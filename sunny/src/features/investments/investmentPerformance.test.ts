import { describe, it, expect } from 'vitest';
import { Transaction, CategoryDef } from '../../types';
import {
  xnpv, xirr, withdrawalProceeds, collectPositionMovements,
  buildPositionPerformance, buildPaidInSeries,
} from './investmentPerformance';

const TODAY = '2026-07-16';

const cat = (over: Partial<CategoryDef> = {}): CategoryDef => ({
  id: 'etf', label: 'ETF', icon: '📈', color: '#fff', kind: 'investment', ...over,
});

let seq = 0;
const tx = (over: Partial<Transaction>): Transaction => ({
  id: `t${seq++}`, date: '2026-01-10', description: 'dep', amount: 100,
  type: 'investment', category: 'etf', account: 'a1', direction: 'in', ...over,
} as Transaction);

describe('xirr — solver robustness', () => {
  it('single deposit doubling in exactly one year ≈ +100%', () => {
    const r = xirr([
      { date: '2025-07-16', amount: -1000 },
      { date: '2026-07-16', amount: 2000 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0.98);
    expect(r!).toBeLessThan(1.02);
  });
  it('flat position → ~0%', () => {
    const r = xirr([
      { date: '2025-07-16', amount: -1000 },
      { date: '2026-07-16', amount: 1000 },
    ]);
    expect(Math.abs(r!)).toBeLessThan(0.001);
  });
  it('losses produce a negative rate (bounded > −100%)', () => {
    const r = xirr([
      { date: '2024-07-16', amount: -1000 },
      { date: '2026-07-16', amount: 400 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(0);
    expect(r!).toBeGreaterThan(-0.999);
    // sanity: (1+r)^2 ≈ 0.4
    expect(Math.pow(1 + r!, 2)).toBeCloseTo(0.4, 2);
  });
  it('multiple deposits, withdrawal and fees — NPV at the root is ~0', () => {
    const flows = [
      { date: '2024-01-01', amount: -5000 },
      { date: '2024-07-01', amount: -2000 },
      { date: '2025-03-01', amount: -10 },   // fee
      { date: '2025-06-01', amount: 1500 },  // withdrawal proceeds
      { date: '2026-07-16', amount: 7000 },  // current value
    ];
    const r = xirr(flows);
    expect(r).not.toBeNull();
    expect(Math.abs(xnpv(r!, flows))).toBeLessThan(0.01);
  });
  it('degenerate inputs → null (never an invented number)', () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: '2026-01-01', amount: -100 }])).toBeNull();
    expect(xirr([                              // no sign change
      { date: '2025-01-01', amount: -100 },
      { date: '2026-01-01', amount: -50 },
    ])).toBeNull();
    expect(xirr([                              // zero-length timeline
      { date: '2026-01-01', amount: -100 },
      { date: '2026-01-01', amount: 110 },
    ])).toBeNull();
  });
});

describe('withdrawalProceeds', () => {
  it('|valueDelta| when present (out leg carries −cash), amount as legacy fallback', () => {
    expect(withdrawalProceeds(tx({ direction: 'out', amount: 480, valueDelta: -600 }))).toBe(600);
    expect(withdrawalProceeds(tx({ direction: 'out', amount: 480 }))).toBe(480);
  });
});

describe('collectPositionMovements', () => {
  it('links fees and realized P/L via groupId, never double-counting', () => {
    const g = 'grp1';
    const txs: Transaction[] = [
      tx({ direction: 'out', amount: 400, valueDelta: -500, groupId: g, date: '2026-03-01' }),
      tx({ type: 'income', category: '__plusvalenza__', amount: 100, groupId: g, direction: undefined }),
      tx({ type: 'expense', category: 'altro', description: 'Commissione disinvestimento · ETF', amount: 5, groupId: g, direction: undefined }),
      // unrelated expense with another group
      tx({ type: 'expense', category: 'altro', description: 'Commissione · altro fondo', amount: 9, groupId: 'other', direction: undefined }),
    ];
    const m = collectPositionMovements(txs, 'etf');
    expect(m.withdrawals).toHaveLength(1);
    expect(m.fees).toHaveLength(1);
    expect(m.realizedGain).toBe(100);
  });
});

describe('buildPositionPerformance', () => {
  it('capitale netto = initialBalance + depositi − capitale rimborsato', () => {
    const p = buildPositionPerformance({
      category: cat({ initialBalance: 500, subscriptionDate: '2025-01-01' }),
      transactions: [
        tx({ amount: 300, date: '2025-06-01' }),
        tx({ direction: 'out', amount: 200, valueDelta: -250, date: '2026-01-01' }),
      ],
      todayISO: TODAY,
    });
    expect(p.netCapital).toBe(600);      // 500 + 300 − 200
    expect(p.contributed).toBe(800);     // 500 + 300
    expect(p.proceeds).toBe(250);        // cash incassato
  });

  it('guadagno totale = controvalore + incassi − conferito − commissioni (senza doppio conteggio plus)', () => {
    const g = 'w1';
    const p = buildPositionPerformance({
      category: cat({ currentValue: 900, lastValueUpdate: TODAY, subscriptionDate: '2025-01-01', initialBalance: 500 }),
      transactions: [
        tx({ amount: 300, date: '2025-06-01' }),
        tx({ direction: 'out', amount: 200, valueDelta: -250, groupId: g, date: '2026-01-01' }),
        tx({ type: 'income', category: '__plusvalenza__', amount: 50, groupId: g, direction: undefined, date: '2026-01-01' }),
        tx({ type: 'expense', category: 'altro', description: 'Commissione disinvestimento · ETF', amount: 10, groupId: g, direction: undefined, date: '2026-01-01' }),
      ],
      todayISO: TODAY,
    });
    // 900 + 250 − 800 − 10 = 340 (la plusvalenza è già dentro l'incasso)
    expect(p.totalGain).toBe(340);
    expect(p.realizedGain).toBe(50);
    expect(p.fees).toBe(10);
  });

  it('XIRR conta TFR e apporti senza conto come capitale conferito', () => {
    // 300 deposited one year ago (200 TFR, source-less), worth 330 today → ~10%
    const p = buildPositionPerformance({
      category: cat({ currentValue: 330, lastValueUpdate: TODAY }),
      transactions: [tx({ amount: 300, tfr: 200, account: '', date: '2025-07-16' })],
      todayISO: TODAY,
    });
    expect(p.moneyWeightedReturn).not.toBeNull();
    expect(p.moneyWeightedReturn!).toBeGreaterThan(0.08);
    expect(p.moneyWeightedReturn!).toBeLessThan(0.12);
    expect(p.tfrTotal).toBe(200);
  });

  it('senza currentValue: guadagni e rendimenti non disponibili (mai 0 inventato)', () => {
    const p = buildPositionPerformance({
      category: cat(),
      transactions: [tx({ amount: 300, date: '2025-07-16' })],
      todayISO: TODAY,
    });
    expect(p.totalGain).toBeNull();
    expect(p.latentGain).toBeNull();
    expect(p.annualGain).toBeNull();
    expect(p.annualUnavailableReason).toBe('no-current-value');
    expect(p.moneyWeightedReturn).toBeNull();
    expect(p.moneyWeightedUnavailableReason).toBe('no-current-value');
  });

  it('fallback subscriptionDate → primo movimento effettivo, anche con initialBalance>0 (vale pure per XIRR)', () => {
    const p = buildPositionPerformance({
      category: cat({ initialBalance: 1000, currentValue: 1210, lastValueUpdate: TODAY }),
      transactions: [tx({ amount: 100, date: '2025-07-16' })],
      todayISO: TODAY,
    });
    expect(p.startDate).toBe('2025-07-16');
    expect(p.startDateSource).toBe('first-movement');
    expect(p.years).toBeCloseTo(1, 1);
    expect(p.annualGain).not.toBeNull();
    expect(p.moneyWeightedReturn).not.toBeNull(); // initialBalance ancorato al fallback
  });

  it('nessuna data e nessun movimento: no-start-date su entrambe le metriche', () => {
    const p = buildPositionPerformance({
      category: cat({ initialBalance: 1000, currentValue: 1100, lastValueUpdate: TODAY }),
      transactions: [],
      todayISO: TODAY,
    });
    expect(p.startDate).toBeNull();
    expect(p.startDateSource).toBeNull();
    expect(p.years).toBeNull();
    expect(p.annualUnavailableReason).toBe('no-start-date');
    expect(p.moneyWeightedUnavailableReason).toBe('no-start-date');
  });

  it('initialBalance=0: la prima operazione fa da data di partenza (fallback)', () => {
    const p = buildPositionPerformance({
      category: cat({ currentValue: 220, lastValueUpdate: TODAY }),
      transactions: [tx({ amount: 200, date: '2025-07-16' })],
      todayISO: TODAY,
    });
    expect(p.startDate).toBe('2025-07-16');
    expect(p.years).toBeCloseTo(1, 1);
    expect(p.annualGain).not.toBeNull();
    expect(p.moneyWeightedReturn).not.toBeNull();
  });

  it('durata insufficiente (< ~1 mese): entrambi i rendimenti a null', () => {
    const p = buildPositionPerformance({
      category: cat({ currentValue: 101, lastValueUpdate: TODAY }),
      transactions: [tx({ amount: 100, date: '2026-07-10' })],
      todayISO: TODAY,
    });
    expect(p.annualGain).toBeNull();
    expect(p.annualUnavailableReason).toBe('insufficient-duration');
    expect(p.moneyWeightedReturn).toBeNull();
    expect(p.moneyWeightedUnavailableReason).toBe('insufficient-duration');
  });
});

describe('rendimento annualizzato (guadagno totale / anni di sottoscrizione)', () => {
  it('esempio numerico: 10.000 versati 2 anni fa, controvalore 12.000 → ~1.000 €/anno · ~10%/anno', () => {
    const p = buildPositionPerformance({
      category: cat({ currentValue: 12000, lastValueUpdate: TODAY }),
      transactions: [tx({ amount: 10000, date: '2024-07-16' })],
      todayISO: TODAY,
    });
    // anni = 730 giorni / 365,2425 ≈ 1,9987
    expect(p.years!).toBeCloseTo(730 / 365.2425, 4);
    expect(p.annualGain!).toBeGreaterThan(990);
    expect(p.annualGain!).toBeLessThan(1010);
    expect(p.annualizedReturn!).toBeGreaterThan(0.099);
    expect(p.annualizedReturn!).toBeLessThan(0.101);
  });

  it('il prelevato entra nel guadagno: controvalore + prelevato − versato', () => {
    const p = buildPositionPerformance({
      category: cat({ currentValue: 700, lastValueUpdate: TODAY, subscriptionDate: '2024-07-16' }),
      transactions: [
        tx({ amount: 1000, date: '2024-07-16' }),
        tx({ direction: 'out', amount: 400, valueDelta: -500, date: '2025-07-16' }),
      ],
      todayISO: TODAY,
    });
    // guadagno = 700 + 500 − 1000 = 200; anni ≈ 2 → ~100 €/anno, ~10%/anno
    expect(p.totalGain).toBe(200);
    expect(p.annualGain!).toBeGreaterThan(95);
    expect(p.annualGain!).toBeLessThan(105);
    expect(p.annualizedReturn!).toBeGreaterThan(0.095);
    expect(p.annualizedReturn!).toBeLessThan(0.105);
  });

  it('il versato include TFR e apporti senza conto per intero', () => {
    const p = buildPositionPerformance({
      category: cat({ currentValue: 500, lastValueUpdate: TODAY }),
      transactions: [
        tx({ amount: 300, tfr: 200, account: '', date: '2025-07-16' }), // apporto esterno con TFR
        tx({ amount: 100, date: '2025-07-16' }),
      ],
      todayISO: TODAY,
    });
    expect(p.contributed).toBe(400);
    // guadagno = 500 − 400 = 100 su ~1 anno → ~100 €/anno, ~25%/anno
    expect(p.annualGain!).toBeCloseTo(100, 0);
    expect(p.annualizedReturn!).toBeCloseTo(0.25, 2);
  });

  it('le commissioni entrano: il rendimento annuo nasce dal guadagno totale', () => {
    const g = 'grp';
    const p = buildPositionPerformance({
      category: cat({ currentValue: 1100, lastValueUpdate: TODAY, subscriptionDate: '2025-07-16' }),
      transactions: [
        tx({ amount: 1000, date: '2025-07-16', groupId: g }),
        tx({ type: 'expense', category: 'altro', description: 'Commissione · ETF', amount: 10, groupId: g, direction: undefined, date: '2025-07-16' }),
      ],
      todayISO: TODAY,
    });
    expect(p.totalGain).toBe(90);              // 1100 − 1000 − 10
    // Lo stesso 90, diviso ~1 anno: la riga annua non può dire 100 mentre
    // quella sopra dice 90.
    expect(p.annualGain!).toBeCloseTo(90, 0);
    expect(p.annualizedReturn!).toBeCloseTo(p.totalGainPct! / p.years!, 10);
  });

  it('movimenti futuri e template ricorrenti esclusi da versato, capitale netto e metriche', () => {
    const p = buildPositionPerformance({
      category: cat({ currentValue: 220, lastValueUpdate: TODAY }),
      transactions: [
        tx({ amount: 200, date: '2025-07-16' }),
        tx({ amount: 900, date: '2026-12-01' }),                              // futuro → escluso
        tx({ amount: 50, date: '2025-01-01', recurring: { freq: 'monthly' } }), // template → escluso
      ],
      todayISO: TODAY,
    });
    expect(p.contributed).toBe(200);
    expect(p.netCapital).toBe(200);
    expect(p.depositCount).toBe(1);
    expect(p.annualGain!).toBeCloseTo(20, 0); // (220 − 200) / ~1 anno
  });

  it('capitale versato non valido (0): no-capital', () => {
    const p = buildPositionPerformance({
      category: cat({ currentValue: 100, lastValueUpdate: TODAY, subscriptionDate: '2024-07-16' }),
      transactions: [],
      todayISO: TODAY,
    });
    expect(p.annualGain).toBeNull();
    expect(p.annualUnavailableReason).toBe('no-capital');
  });
});

describe('la data della categoria comanda', () => {
  it('un fondo dichiarato dal 2016 ha dieci anni, anche se in Sunny i movimenti iniziano ieri', () => {
    // È il caso di chi importa una posizione aperta da tempo: senza la
    // precedenza, la durata sarebbe di giorni e il rendimento annuo assurdo.
    const p = buildPositionPerformance({
      category: cat({
        subscriptionDate: '2016-07-16', initialBalance: 10000,
        currentValue: 20000, lastValueUpdate: TODAY,
      }),
      transactions: [tx({ amount: 0.01, date: '2026-07-15' })],
      todayISO: TODAY,
    });
    expect(p.startDateSource).toBe('category');
    expect(p.years!).toBeCloseTo(10, 1);
    // +100% in dieci anni = 10%/anno, diviso, non capitalizzato (che darebbe 7,2%).
    expect(p.annualizedReturn!).toBeCloseTo(0.1, 3);
    expect(p.annualizedReturn!).toBeCloseTo(p.totalGainPct! / p.years!, 10);
  });

  it('vince anche quando è PIÙ RECENTE dei movimenti registrati', () => {
    const p = buildPositionPerformance({
      category: cat({ subscriptionDate: '2025-07-16', currentValue: 1100, lastValueUpdate: TODAY }),
      transactions: [tx({ amount: 1000, date: '2020-01-01' })],
      todayISO: TODAY,
    });
    expect(p.startDate).toBe('2025-07-16');
    expect(p.years!).toBeCloseTo(1, 1);   // non sei, come direbbe il movimento
  });

  it('il grafico del versato non torna indietro quando la data è dopo i movimenti', () => {
    const s = buildPaidInSeries(
      cat({ initialBalance: 100, subscriptionDate: '2025-01-01' }),
      [
        tx({ amount: 300, date: '2024-06-01' }),   // prima della data dichiarata
        tx({ amount: 200, date: '2025-06-01' }),
      ],
      TODAY,
    );
    // Il versamento anteriore confluisce nel punto di partenza invece di
    // generare un punto nel 2024.
    expect(s[0]).toEqual({ date: '2025-01-01', value: 400 });
    expect(s[1]).toEqual({ date: '2025-06-01', value: 600 });
    for (let i = 1; i < s.length; i++) expect(s[i].date >= s[i - 1].date).toBe(true);
  });
});

describe('buildPaidInSeries', () => {
  it('starts at initialBalance on subscriptionDate and follows real movements', () => {
    const s = buildPaidInSeries(
      cat({ initialBalance: 500, subscriptionDate: '2025-01-01' }),
      [
        tx({ amount: 300, date: '2025-06-01' }),
        tx({ direction: 'out', amount: 200, date: '2026-01-01' }),
      ],
      TODAY,
    );
    expect(s[0]).toEqual({ date: '2025-01-01', value: 500 });
    expect(s[1]).toEqual({ date: '2025-06-01', value: 800 });
    expect(s[0].date).toBe('2025-01-01');
    expect(s[2]).toEqual({ date: '2026-01-01', value: 600 });
    expect(s[s.length - 1]).toEqual({ date: TODAY, value: 600 });
  });
  it('empty when there is no anchor at all', () => {
    expect(buildPaidInSeries(cat({ initialBalance: 100 }), [], TODAY)).toEqual([]);
  });
});
