import { describe, it, expect } from 'vitest';
import { Transaction } from '../../types';
import { buildMonthRhythm, RHYTHM_ALPHA } from './monthRhythm';

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
