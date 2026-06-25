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
