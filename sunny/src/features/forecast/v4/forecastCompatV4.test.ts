import { describe, it, expect } from 'vitest';
import { forecastSavingsV4, forecastByCategoryV4 } from './forecastCompatV4';
import { Transaction, CategoryDef } from '../../../types';

const NOW = new Date(2026, 5, 15); // 15 June 2026

const CATS: CategoryDef[] = [
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#000', kind: 'expense' },
];

function exp(date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date, description: 'x', amount,
    type: 'expense', category: 'spesa', account: 'cc', ...extra,
  };
}

const income = (date: string, amount: number): Transaction => ({
  id: Math.random().toString(36).slice(2), date, description: 'Stipendio',
  amount, type: 'income', category: 'stip', account: 'cc',
});

describe('forecastCompatV4 — drop-in wrappers', () => {
  const txs = [
    exp('2026-06-05', 100), exp('2026-05-12', 120), exp('2026-04-12', 110),
    income('2026-06-01', 2000), income('2026-05-01', 2000), income('2026-04-01', 2000),
  ];

  it('runs WITHOUT a user (admin gate is a no-op in production)', () => {
    expect(() => forecastSavingsV4({
      transactions: txs, expenseCategories: CATS,
      monthlyIncome: 2000, monthlyInvestments: 0, now: NOW,
    })).not.toThrow();
  });

  it('returns the MonthForecastShape with savings = income − expenses − invest', () => {
    const r = forecastSavingsV4({
      transactions: txs, expenseCategories: CATS,
      monthlyIncome: 2000, monthlyInvestments: 0,
      avgIncome: 2000, avgInvest: 0, now: NOW,
    });
    expect(r.savings).toBe(r.expectedIncome - r.projectedExpenses - r.expectedInvest);
    expect(r.expectedIncome).toBe(2000);
    expect(r.expectedInvest).toBe(0);
    expect(r.projectedExpenses).toBeGreaterThanOrEqual(100); // at least what's spent
  });

  it('forecastByCategoryV4 returns only positive per-category projections', () => {
    const m = forecastByCategoryV4(txs, CATS, NOW);
    expect(typeof m).toBe('object');
    for (const v of Object.values(m)) expect(v).toBeGreaterThan(0);
  });
});

describe('forecastCompatV4 — composite month through the production wrapper', () => {
  // One realistic month exercising every engine component at once:
  //   palestra      weekly series, only the NEXT occurrence exists as a doc
  //   vecchiaserie  expired template (ended series) — must be ignored
  //   rata          monthly 300 € fee entered by hand (no series) + planned this month
  //   assicurazioni seasonal June spend, partially paid this month
  //   spesa         plain variable groceries (residual)
  const COMPOSITE_CATS: CategoryDef[] = [
    { id: 'palestra', label: 'Palestra', icon: '🏋️', color: '#000', kind: 'expense' },
    { id: 'vecchiaserie', label: 'Rivista', icon: '📰', color: '#000', kind: 'expense' },
    { id: 'rata', label: 'Corso serale', icon: '🎓', color: '#000', kind: 'expense' },
    { id: 'assicurazioni', label: 'Assicurazioni', icon: '🛡️', color: '#000', kind: 'expense' },
    { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#000', kind: 'expense' },
  ];
  const compositeTxs: Transaction[] = [
    // palestra: weekly 25 €, realized instances + template on the 17th
    exp('2026-06-03', 25, { category: 'palestra', seriesId: 'gym' }),
    exp('2026-06-10', 25, { category: 'palestra', seriesId: 'gym' }),
    exp('2026-06-17', 25, { category: 'palestra', seriesId: 'gym', recurring: { freq: 'weekly' } }),
    // vecchiaserie: ended series whose template lingers past `until`
    exp('2026-06-20', 90, { category: 'vecchiaserie', seriesId: 'mag', recurring: { freq: 'monthly', until: '2026-05-31' } }),
    // rata: 300 € one-off history each month + this month's payment planned on the 28th
    exp('2026-03-28', 300, { category: 'rata' }), exp('2026-04-28', 300, { category: 'rata' }),
    exp('2026-05-28', 300, { category: 'rata' }), exp('2026-06-28', 300, { category: 'rata' }),
    // assicurazioni: seasonal June (870/880), first 400 € tranche already paid
    exp('2024-06-10', 870, { category: 'assicurazioni' }),
    exp('2025-06-10', 880, { category: 'assicurazioni' }),
    exp('2026-06-05', 400, { category: 'assicurazioni' }),
    // spesa: steady variable spend, 60 € in the tail of each month
    exp('2026-03-20', 60), exp('2026-04-20', 60), exp('2026-05-20', 60),
    exp('2026-06-08', 60),
  ];

  it('every component lands exactly once in the projected expenses', () => {
    const m = forecastByCategoryV4(compositeTxs, COMPOSITE_CATS, NOW);
    expect(m['palestra']).toBe(100);       // 2 realized + 17th (doc) + 24th (virtual)
    expect(m['vecchiaserie']).toBeUndefined(); // expired template ignored
    expect(m['rata']).toBe(300);           // planned replaces the historical one-offs (not 600)
    expect(m['assicurazioni']).toBe(875);  // 400 paid + 475 seasonal remaining (not 400+875)
    expect(m['spesa']).toBe(120);          // 60 spent + 60 residual tail
  });

  it('the savings wrapper stays coherent on the same composite month', () => {
    const r = forecastSavingsV4({
      transactions: [...compositeTxs, income('2026-06-01', 2000)],
      expenseCategories: COMPOSITE_CATS,
      monthlyIncome: 2000, monthlyInvestments: 0,
      avgIncome: 2000, avgInvest: 0, now: NOW,
    });
    expect(r.projectedExpenses).toBe(100 + 300 + 875 + 120);
    expect(r.savings).toBe(2000 - r.projectedExpenses);
  });
});
