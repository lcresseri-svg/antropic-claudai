import { describe, it, expect } from 'vitest';
import { suggestBudgets, seasonalHint, seasonalMonthlyAverage, forecastSavings } from './budgetUtils';
import { Transaction, CategoryDef } from '../../types';

const NOW = new Date('2026-12-15T12:00:00Z'); // December → seasonal gifts
const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2026-01-01', description: '', amount: 0,
  type: 'expense', category: 'spesa', account: 'conto', ...over,
});

const cats: CategoryDef[] = [
  { id: 'regali', label: 'Regali', icon: '🎁', color: '#000', kind: 'expense' },
  { id: 'spesa',  label: 'Spesa',  icon: '🛒', color: '#000', kind: 'expense' },
];

describe('seasonalMonthlyAverage', () => {
  it('averages a category over the same calendar month across years (within the 18-month window)', () => {
    const txs = [
      tx({ category: 'regali', amount: 400, date: '2025-10-10' }),
      tx({ category: 'regali', amount: 600, date: '2026-10-10' }),
      tx({ category: 'regali', amount: 50,  date: '2026-08-10' }), // different month, ignored
    ];
    const avg = seasonalMonthlyAverage(txs, 9, NOW); // 9 = October
    expect(avg.regali).toBe(500);
  });

  it('ignores data older than ~18 months', () => {
    const txs = [
      tx({ category: 'regali', amount: 400, date: '2024-12-10' }), // 24 months back → excluded
      tx({ category: 'regali', amount: 600, date: '2025-12-10' }),
    ];
    expect(seasonalMonthlyAverage(txs, 11, NOW).regali).toBe(600);
  });

  it('excludes the current partial month', () => {
    const txs = [tx({ category: 'regali', amount: 999, date: '2026-12-05' })];
    expect(seasonalMonthlyAverage(txs, 11, NOW).regali).toBeUndefined();
  });
});

describe('seasonalHint', () => {
  it('flags a category that spikes in the current month vs its overall average', () => {
    const txs = [
      // Gifts: heavy in December, light otherwise
      tx({ category: 'regali', amount: 500, date: '2025-12-10' }),
      tx({ category: 'regali', amount: 20,  date: '2025-03-10' }),
      tx({ category: 'regali', amount: 20,  date: '2025-06-10' }),
    ];
    const hint = seasonalHint(txs, NOW);
    expect(hint?.categoryId).toBe('regali');
    expect(hint!.ratio).toBeGreaterThan(1.4);
  });

  it('returns null when nothing is seasonal', () => {
    const txs = [
      tx({ category: 'spesa', amount: 100, date: '2025-11-10' }),
      tx({ category: 'spesa', amount: 100, date: '2025-12-10' }),
    ];
    expect(seasonalHint(txs, NOW)).toBeNull();
  });
});

describe('forecastSavings', () => {
  const MID = new Date('2026-12-16T12:00:00Z'); // ~half of December (31 days)

  it('uses "spent so far + typical remaining" when history exists', () => {
    const f = forecastSavings({
      monthlyIncome: 3000, monthlyExpenses: 800, monthlyInvestments: 0,
      avgIncome: 3000, avgExpense: 1600, now: MID,
    });
    // prog ≈ 16/31 ≈ 0.516 → projected ≈ 800 + 0.484*1600 ≈ 1574
    expect(f.projectedExpenses).toBeGreaterThan(1500);
    expect(f.projectedExpenses).toBeLessThan(1650);
    expect(f.savings).toBe(f.expectedIncome - f.projectedExpenses - f.expectedInvest);
  });

  it('does not explode early in the month thanks to the historical blend', () => {
    const early = new Date('2026-12-02T12:00:00Z'); // day 2
    const f = forecastSavings({
      monthlyIncome: 0, monthlyExpenses: 50, monthlyInvestments: 0,
      avgIncome: 3000, avgExpense: 1500, now: early,
    });
    // ≈ 50 + ~0.94*1500 ≈ 1460 — close to the typical month, NOT 50/0.06 ≈ 800+ inflated nonsense
    expect(f.projectedExpenses).toBeLessThan(1600);
    expect(f.projectedExpenses).toBeGreaterThan(1300);
  });

  it('never projects less than already spent', () => {
    const f = forecastSavings({
      monthlyIncome: 2000, monthlyExpenses: 1800, monthlyInvestments: 0,
      avgIncome: 2000, avgExpense: 500, now: MID,
    });
    expect(f.projectedExpenses).toBeGreaterThanOrEqual(1800);
  });

  it('falls back to a guarded run-rate without history', () => {
    const f = forecastSavings({
      monthlyIncome: 2000, monthlyExpenses: 600, monthlyInvestments: 0, now: MID,
    });
    // prog ≈ 0.516 → 600 / 0.516 ≈ 1162
    expect(f.projectedExpenses).toBeGreaterThan(1050);
    expect(f.projectedExpenses).toBeLessThan(1300);
  });
});

describe('suggestBudgets seasonality', () => {
  it('raises the suggestion to the seasonal level for the current month', () => {
    const txs = [
      // recent 3 months (Sep–Nov 2026) light on gifts
      tx({ category: 'regali', amount: 30, date: '2026-10-10' }),
      // but December historically heavy
      tx({ category: 'regali', amount: 480, date: '2025-12-10' }),
    ];
    const out = suggestBudgets(txs, cats, NOW);
    // Seasonal Dec avg (~480) should dominate the recent light average.
    expect(out.regali).toBeGreaterThanOrEqual(400);
  });
});
