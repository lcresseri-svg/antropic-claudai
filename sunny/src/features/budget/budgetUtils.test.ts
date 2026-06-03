import { describe, it, expect } from 'vitest';
import { suggestBudgets, seasonalHint, seasonalMonthlyAverage, seasonalVariableMonthly, forecastSavings } from './budgetUtils';
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

describe('seasonalVariableMonthly', () => {
  it('averages variable spend for the calendar month across years and counts them', () => {
    // October (month 9): neither is the current (Dec) month, both years count.
    const txs = [tx({ amount: 400, date: '2025-10-10' }), tx({ amount: 600, date: '2026-10-10' })];
    const r = seasonalVariableMonthly(txs, 9, NOW);
    expect(r.avg).toBe(500);
    expect(r.years).toBe(2);
  });

  it('excludes recurring-origin entries (seriesId / recurring)', () => {
    const txs = [
      tx({ amount: 500, date: '2025-10-10' }),
      tx({ amount: 900, date: '2025-10-11', seriesId: 'abc' }), // recurring instance → excluded
    ];
    const r = seasonalVariableMonthly(txs, 9, NOW);
    expect(r.avg).toBe(500);
    expect(r.years).toBe(1);
  });
});

describe('forecastSavings', () => {
  const MID = new Date('2026-12-16T12:00:00Z'); // ~half of December (31 days), prog ≈ 0.516

  it('projects spent-so-far + remaining variable when history exists', () => {
    const f = forecastSavings({
      monthlyIncome: 3000, monthlyExpenses: 800, monthlyInvestments: 0,
      variableSpent: 800, recentVariableAvg: 1600, now: MID,
    });
    expect(f.projectedExpenses).toBeGreaterThan(1450);
    expect(f.projectedExpenses).toBeLessThan(1650);
    expect(f.savings).toBe(f.expectedIncome - f.projectedExpenses - f.expectedInvest);
  });

  it('does not explode early in the month thanks to the historical blend', () => {
    const early = new Date('2026-12-02T12:00:00Z'); // day 2
    const f = forecastSavings({
      monthlyIncome: 0, monthlyExpenses: 50, monthlyInvestments: 0,
      variableSpent: 50, recentVariableAvg: 1500, now: early,
    });
    expect(f.projectedExpenses).toBeLessThan(1600);
    expect(f.projectedExpenses).toBeGreaterThan(1300);
  });

  it('weights the seasonal signal more when more prior years back it (adaptive weights)', () => {
    const base = {
      monthlyIncome: 3000, monthlyExpenses: 500, monthlyInvestments: 0,
      variableSpent: 500, recentVariableAvg: 1000, seasonalVariableAvg: 2000, now: MID,
    };
    const noSeasonal = forecastSavings({ ...base, seasonalYears: 0 }); // seasonal ignored
    const withSeasonal = forecastSavings({ ...base, seasonalYears: 2 }); // full seasonal weight
    expect(withSeasonal.projectedExpenses).toBeGreaterThan(noSeasonal.projectedExpenses);
  });

  it('adds upcoming recurring expenses explicitly, not just as a floor', () => {
    const f = forecastSavings({
      monthlyIncome: 3000, monthlyExpenses: 200, monthlyInvestments: 0,
      variableSpent: 200, recentVariableAvg: 300, upcomingRecurring: 1000, now: MID,
    });
    // Old "floor" model would cap at ~200 + max(remaining, 1000) ≈ 1200.
    // New model adds recurring on top of the variable estimate → clearly above.
    expect(f.projectedExpenses).toBeGreaterThan(1300);
  });

  it('reacts to this month\'s actual pace (overspending pushes the forecast up)', () => {
    const onTrack = forecastSavings({
      monthlyIncome: 3000, monthlyExpenses: 500, monthlyInvestments: 0,
      variableSpent: 500, recentVariableAvg: 1000, now: MID,
    });
    const overspending = forecastSavings({
      monthlyIncome: 3000, monthlyExpenses: 1500, monthlyInvestments: 0,
      variableSpent: 1500, recentVariableAvg: 1000, now: MID,
    });
    expect(overspending.projectedExpenses).toBeGreaterThan(onTrack.projectedExpenses);
    // Reacts above the purely-historical estimate (1500 + 0.484*1000 ≈ 1984).
    expect(overspending.projectedExpenses).toBeGreaterThan(2100);
  });

  it('never projects less than already spent', () => {
    const eom = new Date('2026-12-31T12:00:00Z'); // prog ≈ 1 → no remaining
    const f = forecastSavings({
      monthlyIncome: 2000, monthlyExpenses: 1800, monthlyInvestments: 0,
      variableSpent: 1800, recentVariableAvg: 500, now: eom,
    });
    expect(f.projectedExpenses).toBeGreaterThanOrEqual(1800);
  });

  it('falls back to a guarded run-rate without history', () => {
    const f = forecastSavings({
      monthlyIncome: 2000, monthlyExpenses: 600, monthlyInvestments: 0,
      variableSpent: 600, now: MID,
    });
    // prog ≈ 0.516 → 600 / 0.516 ≈ 1162
    expect(f.projectedExpenses).toBeGreaterThan(1050);
    expect(f.projectedExpenses).toBeLessThan(1300);
  });

  it('does not project from a tiny early-month pace without history', () => {
    const early = new Date('2026-12-02T12:00:00Z'); // prog ≈ 0.06 < 0.15
    const f = forecastSavings({
      monthlyIncome: 2000, monthlyExpenses: 50, monthlyInvestments: 0,
      variableSpent: 50, now: early,
    });
    expect(f.projectedExpenses).toBe(50);
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
