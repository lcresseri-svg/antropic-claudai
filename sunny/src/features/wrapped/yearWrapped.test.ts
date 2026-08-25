import { describe, it, expect } from 'vitest';
import { Transaction, CategoryDef, AccountDef } from '../../types';
import { buildYearWrapped, YearWrappedInput, WRAPPED_MIN_TX } from './yearWrapped';

const CATS: Record<string, CategoryDef> = {
  casa:      { id: 'casa', label: 'Casa', icon: '🏠', color: '#E6B95C', kind: 'expense' },
  spesa:     { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#8A9270', kind: 'expense' },
  ristoranti:{ id: 'ristoranti', label: 'Ristoranti', icon: '🍝', color: '#88B0C0', kind: 'expense' },
  trasporti: { id: 'trasporti', label: 'Trasporti', icon: '🚗', color: '#8FB0A0', kind: 'expense' },
  extra:     { id: 'extra', label: 'Extra', icon: '✨', color: '#DD5B4F', kind: 'expense' },
  stipendio: { id: 'stipendio', label: 'Stipendio', icon: '💼', color: '#8A9270', kind: 'income' },
  etf:       { id: 'etf', label: 'ETF', icon: '📈', color: '#E6B95C', kind: 'investment' },
};
const UNKNOWN: CategoryDef = { id: '?', label: 'Sconosciuta', icon: '❓', color: '#666', kind: 'expense' };
const ACC: AccountDef = { id: 'cc', label: 'Conto Corrente', icon: '🏦', color: '#888' };

const getCat = (id: string) => CATS[id] ?? UNKNOWN;
const getAcc = () => ACC;

let n = 0;
const tx = (over: Partial<Transaction> & { date: string }): Transaction => ({
  id: `t${n++}`, description: '', amount: 100,
  type: 'expense', category: 'casa', account: 'cc', ...over,
});

/** `count` spese uguali, una al giorno a partire dal 1° del mese. */
const spese = (ym: string, count: number, amount = 100, category = 'casa'): Transaction[] =>
  Array.from({ length: count }, (_, i) =>
    tx({ date: `${ym}-${String(i + 1).padStart(2, '0')}`, amount, category }));

const build = (over: Partial<YearWrappedInput>) => buildYearWrapped({
  transactions: [], getCat, getAcc, year: 2026, todayISO: '2026-12-20', ...over,
});

describe('periodo raccontato', () => {
  it('a dicembre copre l\'anno intero contando anche il programmato', () => {
    const w = build({
      transactions: [
        tx({ date: '2026-03-10', amount: 200 }),          // fatto
        tx({ date: '2026-12-15', amount: 50 }),           // fatto, dicembre
        tx({ date: '2026-12-28', amount: 300 }),          // PROGRAMMATO (futuro)
      ],
      projected: [tx({ date: '2026-12-31', amount: 40, projected: true })],
    });

    expect(w.periodEndISO).toBe('2026-12-31');
    expect(w.monthsCovered).toBe(12);
    expect(w.realizedCount).toBe(2);
    expect(w.plannedCount).toBe(2);
    expect(w.hasPlanned).toBe(true);
    // 200 + 50 + 300 + 40: il dicembre programmato è dentro il totale.
    expect(w.expenseTotal).toBe(590);
    expect(w.months[11].expense).toBe(390);
  });

  it('quello che cade fuori dall\'anno o dopo il periodo non conta', () => {
    const w = build({
      transactions: [
        tx({ date: '2025-12-31', amount: 999 }),  // anno prima
        tx({ date: '2027-01-02', amount: 999 }),  // anno dopo
        tx({ date: '2026-05-05', amount: 10 }),
      ],
      projected: [tx({ date: '2027-02-01', amount: 999, projected: true })],
    });
    expect(w.expenseTotal).toBe(10);
    expect(w.txCount).toBe(1);
  });

  it('lanciato dall\'admin a metà anno si ferma a fine mese corrente', () => {
    const w = build({
      todayISO: '2026-08-25',
      transactions: [
        tx({ date: '2026-08-24', amount: 100 }),
        tx({ date: '2026-08-30', amount: 60 }),   // programmato, ma dentro agosto
        tx({ date: '2026-09-02', amount: 999 }),  // oltre il periodo raccontato
      ],
    });
    expect(w.periodEndISO).toBe('2026-08-31');
    expect(w.monthsCovered).toBe(8);
    expect(w.months).toHaveLength(8);
    expect(w.expenseTotal).toBe(160);
    expect(w.plannedCount).toBe(1);
  });
});

describe('totali e coerenza con il resto dell\'app', () => {
  it('la somma dei mesi è il totale dell\'anno', () => {
    const w = build({
      transactions: [
        ...spese('2026-01', 3, 100),
        ...spese('2026-07', 2, 250),
        tx({ date: '2026-02-01', type: 'income', category: 'stipendio', amount: 2000 }),
      ],
    });
    expect(w.months.reduce((s, m) => s + m.expense, 0)).toBe(w.expenseTotal);
    expect(w.months.reduce((s, m) => s + m.income, 0)).toBe(w.incomeTotal);
    expect(w.expenseTotal).toBe(800);
    expect(w.incomeTotal).toBe(2000);
    // Flusso netto = entrate − uscite, la stessa formula della dashboard.
    expect(w.saved).toBe(1200);
    expect(w.savingsRate).toBeCloseTo(0.6, 6);
  });

  it('senza entrate il tasso di risparmio non esiste (non è zero)', () => {
    const w = build({ transactions: spese('2026-04', 3) });
    expect(w.savingsRate).toBeNull();
    expect(w.investedShareOfIncome).toBeNull();
    expect(w.stories).not.toContain('savingsRate');
  });
});

describe('storie', () => {
  it('una storia senza dato non viene raccontata', () => {
    // Un mese solo di spese: niente entrate, niente investimenti, niente
    // patrimonio, niente anno precedente, un solo mese con spesa.
    const w = build({ transactions: spese('2026-03', 25, 40) });
    expect(w.stories).toEqual(['cover', 'expense', 'topCategory', 'largest', 'count']);
    expect(w.stories).not.toContain('peakMonth');
    expect(w.stories).not.toContain('netWorth');
    expect(w.stories).not.toContain('vsPrev');
  });

  it('con l\'anno pieno le racconta tutte', () => {
    const transactions: Transaction[] = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `2026-${String(m).padStart(2, '0')}`;
      transactions.push(tx({ date: `${ym}-05`, type: 'income', category: 'stipendio', amount: 3000 }));
      transactions.push(...spese(ym, 3, 100 + m * 10));
      transactions.push(tx({ date: `${ym}-20`, type: 'investment', category: 'etf', amount: 200 }));
      // Anno precedente, per il confronto.
      transactions.push(tx({ date: `2025-${String(m).padStart(2, '0')}-05`, type: 'income', category: 'stipendio', amount: 2800 }));
      transactions.push(...spese(`2025-${String(m).padStart(2, '0')}`, 3, 150));
    }
    const w = build({
      transactions,
      netWorth: [
        { date: '2026-01-01', total: 10000 },
        { date: '2026-06-01', total: 14000 },
        { date: '2026-12-31', total: 20000 },
      ],
    });
    expect(w.stories).toEqual([
      'cover', 'expense', 'topCategory', 'peakMonth', 'savingsRate',
      'invested', 'netWorth', 'streak', 'largest', 'count', 'vsPrev',
    ]);
    expect(w.netWorthStart).toBe(10000);
    expect(w.netWorthEnd).toBe(20000);
    expect(w.netWorthDeltaPct).toBeCloseTo(1, 6);
    expect(w.investedMonths).toBe(12);
    expect(w.savingStreak).toBe(12);
  });
});

describe('mesi, categorie, movimento più grande', () => {
  it('trova il mese più caro e il più leggero, e ignora i mesi vuoti', () => {
    const w = build({
      transactions: [...spese('2026-03', 4, 500), ...spese('2026-08', 2, 100)],
    });
    expect(w.peakMonth?.label).toBe('Marzo');
    expect(w.peakMonth?.expense).toBe(2000);
    expect(w.lightestMonth?.label).toBe('Agosto');
    expect(w.lightestMonth?.expense).toBe(200);
    expect(w.months[0].expense).toBe(0);           // gennaio esiste ma è vuoto
    expect(w.months[0].initial).toBe('G');
  });

  it('ordina le categorie e collassa la coda in "altre"', () => {
    const w = build({
      transactions: [
        ...spese('2026-01', 1, 1000, 'casa'),
        ...spese('2026-02', 1, 800, 'spesa'),
        ...spese('2026-03', 1, 600, 'ristoranti'),
        ...spese('2026-04', 1, 400, 'trasporti'),
        ...spese('2026-05', 1, 200, 'extra'),
      ],
    });
    expect(w.categories.map(c => c.id)).toEqual(['casa', 'spesa', 'ristoranti', 'trasporti', 'extra']);
    expect(w.categories[0].share).toBeCloseTo(1000 / 3000, 6);
    expect(w.categories[0].icon).toBe('🏠');
    expect(w.otherCategories).toEqual({ count: 1, total: 200 });
  });

  it('la spesa più grande dell\'anno, anche se è ancora programmata', () => {
    const w = build({
      transactions: [
        tx({ date: '2026-03-14', amount: 2400, description: 'Caldaia nuova' }),
        tx({ date: '2026-12-28', amount: 3000, description: 'Regali' }),   // programmata
        tx({ date: '2026-05-01', type: 'transfer', amount: 9999 }),        // non è una spesa
      ],
    });
    expect(w.largest?.description).toBe('Regali');
    expect(w.largest?.amount).toBe(3000);
    expect(w.largest?.planned).toBe(true);
    expect(w.largest?.accountLabel).toBe('Conto Corrente');
  });

  it('la quota altrui di una spesa condivisa non conta come tua', () => {
    const w = build({ transactions: [tx({ date: '2026-06-01', amount: 200, shared: 150 })] });
    expect(w.expenseTotal).toBe(50);
    expect(w.largest?.amount).toBe(50);
  });
});

describe('striscia di mesi in risparmio', () => {
  it('conta i mesi consecutivi chiusi in positivo, dall\'ultimo indietro', () => {
    const transactions: Transaction[] = [];
    for (let m = 1; m <= 12; m++) {
      const ym = `2026-${String(m).padStart(2, '0')}`;
      transactions.push(tx({ date: `${ym}-05`, type: 'income', category: 'stipendio', amount: 1000 }));
      // Marzo e aprile chiudono in rosso: la striscia parte da maggio.
      transactions.push(tx({ date: `${ym}-10`, amount: m === 3 || m === 4 ? 1500 : 400 }));
    }
    const w = build({ transactions });
    expect(w.savingStreak).toBe(8);   // maggio → dicembre
    expect(w.months[2].net).toBeLessThan(0);
    expect(w.stories).toContain('streak');
  });

  it('una striscia di un mese solo non è una striscia', () => {
    const w = build({
      transactions: [
        tx({ date: '2026-10-05', type: 'income', category: 'stipendio', amount: 100 }),
        tx({ date: '2026-11-10', amount: 500 }),
        tx({ date: '2026-12-05', type: 'income', category: 'stipendio', amount: 900 }),
      ],
    });
    expect(w.savingStreak).toBe(1);
    expect(w.stories).not.toContain('streak');
  });
});

describe('confronto con l\'anno prima', () => {
  it('confronta gli stessi mesi, non un anno intero con un pezzo d\'anno', () => {
    const prev: Transaction[] = [];
    for (let m = 1; m <= 12; m++) prev.push(...spese(`2025-${String(m).padStart(2, '0')}`, 1, 100));
    const w = build({
      todayISO: '2026-03-15',                     // admin a marzo: tre mesi contro tre
      transactions: [...prev, ...spese('2026-01', 1, 50), ...spese('2026-02', 1, 50), ...spese('2026-03', 1, 50)],
    });
    expect(w.monthsCovered).toBe(3);
    expect(w.vsPrevYear?.prevExpense).toBe(300);  // non 1200
    expect(w.vsPrevYear?.expensePct).toBeCloseTo(-0.5, 6);
  });

  it('senza anno precedente il confronto non esiste', () => {
    const w = build({ transactions: spese('2026-05', 5) });
    expect(w.vsPrevYear).toBeNull();
    expect(w.stories).not.toContain('vsPrev');
  });
});

describe('obiettivo per l\'anno prossimo', () => {
  it('parte dalla media davvero risparmiata, con un\'opzione sotto e una sopra', () => {
    const transactions: Transaction[] = [];
    for (let m = 1; m <= 12; m++) {
      transactions.push(tx({ date: `2026-${String(m).padStart(2, '0')}-05`, type: 'income', category: 'stipendio', amount: 2000 }));
      transactions.push(tx({ date: `2026-${String(m).padStart(2, '0')}-10`, amount: 600 }));
    }
    const w = build({ transactions });
    expect(w.savedMonthlyAvg).toBe(1400);
    expect(w.goal.suggested).toBe(1400);
    expect(w.goal.options).toEqual([1200, 1400, 1600]);
  });

  it('con poco o nulla da parte le proposte salgono invece di andare sotto zero', () => {
    const w = build({ transactions: spese('2026-02', 3, 100) });   // media negativa
    expect(w.goal.options.every(v => v > 0)).toBe(true);
    expect(w.goal.options).toContain(w.goal.suggested);
    expect(w.goal.options).toHaveLength(3);
  });
});

describe('casi limite', () => {
  it('nessuna transazione: niente crash, niente racconto', () => {
    const w = build({});
    expect(w.txCount).toBe(0);
    expect(w.expenseTotal).toBe(0);
    expect(w.peakMonth).toBeNull();
    expect(w.largest).toBeNull();
    expect(w.hasEnough).toBe(false);
    expect(w.stories).toEqual(['cover']);
    expect(w.months).toHaveLength(12);
  });

  it('la soglia dei pochi dati non blocca il calcolo, solo la proposta', () => {
    const few = build({ transactions: spese('2026-06', WRAPPED_MIN_TX - 1, 10) });
    expect(few.hasEnough).toBe(false);
    expect(few.expenseTotal).toBeGreaterThan(0);
    const enough = build({ transactions: spese('2026-06', WRAPPED_MIN_TX, 10) });
    expect(enough.hasEnough).toBe(true);
  });

  it('una categoria cancellata non rompe il racconto', () => {
    const w = build({ transactions: [tx({ date: '2026-07-01', category: 'sparita', amount: 30 })] });
    expect(w.categories[0].label).toBe('Sconosciuta');
    expect(w.largest?.description).toBe('Sconosciuta');   // ripiego sull'etichetta
  });
});
