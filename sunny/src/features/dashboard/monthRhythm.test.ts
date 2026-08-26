import { describe, it, expect } from 'vitest';
import { Transaction } from '../../types';
import { buildMonthRhythm, rhythmMonths, shiftMonth, compareMonths, RHYTHM_ALPHA } from './monthRhythm';

// 24 agosto 2026 = lunedì. Agosto 2026 ha 31 giorni e inizia di sabato.
const NOW = new Date(2026, 7, 24, 12, 0, 0);

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-08-01', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

describe('buildMonthRhythm', () => {
  it('aggrega le spese per giorno e ignora gli altri mesi e gli altri tipi', () => {
    const r = buildMonthRhythm({
      transactions: [
        tx({ date: '2026-08-02', amount: 750, description: 'Affitto' }),
        tx({ date: '2026-08-02', amount: 30 }),
        tx({ date: '2026-08-24', amount: 41 }),
        tx({ date: '2026-07-31', amount: 999 }),                       // altro mese
        tx({ date: '2026-08-05', amount: 500, type: 'income' }),       // non è una spesa
      ],
      now: NOW,
    });

    expect(r.days).toHaveLength(31);
    expect(r.days[1].spent).toBe(780);   // 2 agosto
    expect(r.days[23].spent).toBe(41);   // 24 agosto
    expect(r.days[4].spent).toBe(0);     // 5 agosto: l'entrata non conta
    expect(r.totalSpent).toBe(821);
    expect(r.todaySpent).toBe(41);
  });

  it('il giorno più caro riporta il movimento singolo più grande', () => {
    const r = buildMonthRhythm({
      transactions: [
        tx({ date: '2026-08-02', amount: 750, description: 'Affitto' }),
        tx({ date: '2026-08-02', amount: 30, description: 'Caffè' }),
      ],
      now: NOW,
    });
    expect(r.peak?.day).toBe(2);
    expect(r.peak?.spent).toBe(780);
    expect(r.peak?.topDescription).toBe('Affitto');
  });

  it('la quota condivisa e gli storni riducono la spesa del giorno (ownShare)', () => {
    const r = buildMonthRhythm({
      transactions: [tx({ date: '2026-08-03', amount: 100, shared: 40, refundedTotal: 10 })],
      now: NOW,
    });
    expect(r.days[2].spent).toBe(50);
  });

  it('i movimenti futuri non sono spesa: restano fuori dal totale', () => {
    const r = buildMonthRhythm({
      transactions: [
        tx({ date: '2026-08-10', amount: 100 }),
        tx({ date: '2026-08-28', amount: 750, description: 'Affitto' }), // pending
      ],
      now: NOW,
    });
    expect(r.totalSpent).toBe(100);
    expect(r.days[27].spent).toBe(0);
    expect(r.days[27].level).toBe(-1);
  });

  it('marca come programmati i giorni futuri con impegni', () => {
    const r = buildMonthRhythm({
      transactions: [],
      scheduled: [
        { date: '2026-08-28', amount: 750, description: 'Affitto' },
        { date: '2026-08-24', amount: 12 },   // oggi: non è "in arrivo"
        { date: '2026-09-01', amount: 99 },   // mese successivo
      ],
      now: NOW,
    });
    expect(r.days[27].scheduled).toBe(750);
    expect(r.days[23].scheduled).toBe(0);
    expect(r.scheduledAhead).toBe(750);
  });

  it('i 5 gradini di intensità partono dal giorno più caro', () => {
    const r = buildMonthRhythm({
      transactions: [
        tx({ date: '2026-08-01', amount: 100 }),  // picco  → 100%  → livello 4
        tx({ date: '2026-08-02', amount: 80 }),   //  80%           → livello 3
        tx({ date: '2026-08-03', amount: 60 }),   //  60%           → livello 2
        tx({ date: '2026-08-04', amount: 40 }),   //  40%           → livello 1
        tx({ date: '2026-08-05', amount: 20 }),   //  20%           → livello 0
      ],
      now: NOW,
    });
    expect(r.days.slice(0, 5).map(d => d.level)).toEqual([4, 3, 2, 1, 0]);
    expect(RHYTHM_ALPHA[r.days[0].level]).toBe(0.95);
  });

  it('media giornaliera sui soli giorni trascorsi, oggi compreso', () => {
    const r = buildMonthRhythm({
      transactions: [tx({ date: '2026-08-01', amount: 240 })],
      now: NOW,
    });
    expect(r.dailyAverage).toBe(10); // 240 / 24 giorni trascorsi
  });

  it('agosto 2026 inizia di sabato: 5 celle vuote prima del giorno 1', () => {
    const r = buildMonthRhythm({ transactions: [], now: NOW });
    expect(r.leadingBlanks).toBe(5);
    expect(r.monthLabel).toBe('agosto');
    expect(r.days.filter(d => d.isToday).map(d => d.day)).toEqual([24]);
    expect(r.days.filter(d => d.isFuture)).toHaveLength(7); // 25 → 31
    expect(r.peak).toBeNull();
    expect(r.dailyAverage).toBe(0);
  });
});

describe('scorrere fra i mesi', () => {
  it('costruisce un mese chiuso: nessun giorno futuro, nessun oggi', () => {
    const r = buildMonthRhythm({
      transactions: [
        tx({ date: '2026-06-03', amount: 120 }),
        tx({ date: '2026-06-30', amount: 80 }),
        tx({ date: '2026-08-24', amount: 999 }),   // mese corrente: fuori
      ],
      now: NOW,
      monthKey: '2026-06',
    });
    expect(r.monthKey).toBe('2026-06');
    expect(r.monthLabelFull).toBe('giugno 2026');
    expect(r.days).toHaveLength(30);
    expect(r.isClosed).toBe(true);
    expect(r.days.some(d => d.isFuture)).toBe(false);
    expect(r.days.some(d => d.isToday)).toBe(false);
    expect(r.todaySpent).toBe(0);
    expect(r.totalSpent).toBe(200);
    // La media di un mese chiuso è sui suoi giorni, non su quelli trascorsi
    // del mese corrente.
    expect(r.dailyAverage).toBeCloseTo(200 / 30, 2);
  });

  it('giugno 2026 inizia di lunedì: nessuna cella vuota in testa', () => {
    const r = buildMonthRhythm({ transactions: [], now: NOW, monthKey: '2026-06' });
    expect(r.leadingBlanks).toBe(0);
  });

  it('il mese corrente resta quello di default', () => {
    const r = buildMonthRhythm({ transactions: [tx({ date: '2026-08-24', amount: 41 })], now: NOW });
    expect(r.monthKey).toBe('2026-08');
    expect(r.isClosed).toBe(false);
    expect(r.todaySpent).toBe(41);
  });

  it('i mesi scorribili vanno dal primo movimento a oggi, senza buchi', () => {
    const months = rhythmMonths([
      tx({ date: '2026-05-10', amount: 10 }),
      tx({ date: '2026-08-01', amount: 10 }),
      tx({ date: '2026-12-01', amount: 10 }),                          // futuro: non allunga
      tx({ date: '2020-01-01', amount: 10, recurring: { freq: 'monthly' } }), // template: non è storia
    ], NOW);
    // Giugno e luglio non hanno movimenti ma restano: un mese senza spese è
    // un'informazione, non un buco nei dati.
    expect(months).toEqual(['2026-05', '2026-06', '2026-07', '2026-08']);
  });

  it('senza movimenti resta il solo mese corrente', () => {
    expect(rhythmMonths([], NOW)).toEqual(['2026-08']);
  });

  it('shiftMonth attraversa il capodanno', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-08', 0)).toBe('2026-08');
  });
});

describe('confronto col mese precedente', () => {
  const build = (monthKey: string, txs: Transaction[]) =>
    buildMonthRhythm({ transactions: txs, now: NOW, monthKey });

  it('un mese in corso si confronta sui soli giorni trascorsi', () => {
    // Oggi è il 24 agosto. A luglio si è speso 100 al giorno 3 e 900 al 28:
    // contare tutto luglio direbbe "stai spendendo molto meno", ma il 28
    // agosto non è ancora arrivato.
    const ago = build('2026-08', [tx({ date: '2026-08-10', amount: 200 })]);
    const lug = build('2026-07', [
      tx({ date: '2026-07-03', amount: 100 }),
      tx({ date: '2026-07-28', amount: 900 }),
    ]);
    const c = compareMonths(ago, lug);
    expect(c.throughDay).toBe(24);
    expect(c.previous).toBe(100);     // i 900 del 28 luglio restano fuori
    expect(c.current).toBe(200);
    expect(c.delta).toBe(100);
    expect(c.deltaPct).toBe(1);
  });

  it('fra due mesi chiusi il confronto è fra totali pieni', () => {
    const giu = build('2026-06', [tx({ date: '2026-06-15', amount: 300 })]);
    const mag = build('2026-05', [tx({ date: '2026-05-31', amount: 200 })]);
    const c = compareMonths(giu, mag);
    expect(c.throughDay).toBeNull();
    expect(c.previous).toBe(200);
    expect(c.delta).toBe(100);
  });

  it('senza spese nel mese precedente la percentuale non si inventa', () => {
    const c = compareMonths(build('2026-06', [tx({ date: '2026-06-15', amount: 300 })]), build('2026-05', []));
    expect(c.previous).toBe(0);
    expect(c.deltaPct).toBeNull();
    expect(c.delta).toBe(300);
  });
});
