import { describe, it, expect } from 'vitest';
import { suggestBudgets, seasonalHint, seasonalMonthlyAverage } from './budgetUtils';
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
  it('averages a category over the same calendar month across years', () => {
    const txs = [
      tx({ category: 'regali', amount: 400, date: '2024-12-10' }),
      tx({ category: 'regali', amount: 600, date: '2025-12-10' }),
      tx({ category: 'regali', amount: 50,  date: '2025-06-10' }), // different month, ignored
    ];
    const avg = seasonalMonthlyAverage(txs, 11, NOW); // 11 = December
    expect(avg.regali).toBe(500);
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
