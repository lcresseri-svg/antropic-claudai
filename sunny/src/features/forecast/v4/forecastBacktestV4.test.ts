import { describe, it, expect } from 'vitest';
import { runBacktestV4 } from './forecastBacktestV4';
import { Transaction, CategoryDef } from '../../../types';

const NOW = new Date(2026, 5, 15); // 15 June 2026

const CATS: CategoryDef[] = [
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#000', kind: 'expense' },
  { id: 'acquisti', label: 'Acquisti', icon: '🛍️', color: '#000', kind: 'expense' },
];

function tx(date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date, description: 'x', amount,
    type: 'expense', category: 'spesa', account: 'cc', ...extra,
  };
}

// Build ~16 months of spend across two categories so the backtest has data.
function history(): Transaction[] {
  const out: Transaction[] = [];
  const months = [
    '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
    '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
    '2026-01', '2026-02', '2026-03', '2026-04', '2026-05',
  ];
  for (const m of months) {
    out.push(tx(`${m}-03`, 80, { category: 'spesa' }));
    out.push(tx(`${m}-12`, 120, { category: 'spesa' }));
    out.push(tx(`${m}-22`, 60, { category: 'spesa' }));
    out.push(tx(`${m}-18`, 90, { category: 'acquisti' }));
  }
  return out;
}

describe('runBacktestV4', () => {
  it('produces complete metrics for all four models', () => {
    const results = runBacktestV4(history(), CATS, { now: NOW });
    expect(results).toHaveLength(4);
    const names = results.map(r => r.modelName);
    expect(names).toEqual(['V3', 'V3.5 (bias)', 'V4 planned-aware', 'V4 + budget']);

    for (const r of results) {
      expect(typeof r.mae).toBe('number');
      expect(typeof r.wape).toBe('number');
      expect(typeof r.bias).toBe('number');
      expect(typeof r.rmse).toBe('number');
      expect(typeof r.r2).toBe('number');
      expect(Object.keys(r.bySnapshotDay).length).toBeGreaterThan(0);
      expect(Object.keys(r.byMonth).length).toBeGreaterThan(0);
      expect(Object.keys(r.byCategory).length).toBeGreaterThan(0);
    }
  });

  it('does not crash when budgetHistory is absent (falls back to category reliability)', () => {
    expect(() => runBacktestV4(history(), CATS, { now: NOW })).not.toThrow();
  });

  it('does not crash with no data and returns zeroed metrics', () => {
    const results = runBacktestV4([], CATS, { now: NOW });
    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.mae).toBe(0);
      expect(r.wape).toBe(0);
      expect(r.diagnostics).toBeDefined();
    }
  });

  it('reports budget-signal impact diagnostics on the V4+budget model', () => {
    const results = runBacktestV4(history(), CATS, {
      now: NOW, categoryBudgets: { spesa: 400, acquisti: 300 },
    });
    const v4b = results.find(r => r.modelName === 'V4 + budget')!;
    expect(v4b.diagnostics).toHaveProperty('budgetSignalHelped');
    expect(v4b.diagnostics).toHaveProperty('budgetSignalHurt');
    expect(typeof v4b.diagnostics.plannedCoverageRatio).toBe('number');
  });

  it('honours the snapshot days option', () => {
    const results = runBacktestV4(history(), CATS, { now: NOW, snapshotDays: [10, 20] });
    const v4 = results.find(r => r.modelName === 'V4 planned-aware')!;
    expect(Object.keys(v4.bySnapshotDay).map(Number).sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it('only applies the budget signal to months present in budgetHistory', () => {
    const budgetHistory = [
      { month: '2025-03', categoryBudgets: { spesa: 400 }, status: 'confirmed' as const },
      { month: '2025-04', categoryBudgets: { spesa: 400 }, status: 'confirmed' as const },
    ];
    const results = runBacktestV4(history(), CATS, { now: NOW, budgetHistory });
    const v4b = results.find(r => r.modelName === 'V4 + budget')!;
    expect(v4b.diagnostics.sampleCountBudgetMonths).toBe(2);
    expect(v4b.diagnostics.sampleCountWithoutBudget).toBeGreaterThan(0);
    expect(v4b.diagnostics.budgetHistoryCoverageRatio).toBeGreaterThan(0);
    expect(v4b.diagnostics.budgetHistoryCoverageRatio).toBeLessThan(1);
  });

  it('warns when fewer than 3 confirmed budget months are available', () => {
    const budgetHistory = [
      { month: '2025-03', categoryBudgets: { spesa: 400 }, status: 'confirmed' as const },
    ];
    const results = runBacktestV4(history(), CATS, { now: NOW, budgetHistory });
    const v4b = results.find(r => r.modelName === 'V4 + budget')!;
    expect(v4b.diagnostics.warning).toMatch(/non ancora validabile/i);
  });

  it('never borrows the current budget for historical months (no budgetHistory → budget signal off)', () => {
    // With no budgetHistory, V4 and V4+budget must be identical (no signal applied).
    const results = runBacktestV4(history(), CATS, { now: NOW });
    const v4 = results.find(r => r.modelName === 'V4 planned-aware')!;
    const v4b = results.find(r => r.modelName === 'V4 + budget')!;
    expect(v4b.mae).toBe(v4.mae);
    expect(v4b.wape).toBe(v4.wape);
    expect(v4b.diagnostics.sampleCountBudgetMonths).toBe(0);
  });
});
