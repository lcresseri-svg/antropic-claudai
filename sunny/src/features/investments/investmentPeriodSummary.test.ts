import { describe, expect, it } from 'vitest';
import type { Transaction } from '../../types';
import { getPeriodRange } from '../dashboard/categoryAnalytics';
import { investmentPeriodSummary } from './investmentPeriodSummary';

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx', type: 'investment', date: '2026-11-01', amount: 100,
  account: '', category: 'fund', description: 'Versamento', ...overrides,
});
const now = new Date(2026, 10, 15, 12);

describe('investmentPeriodSummary', () => {
  it('calculates net deposits excluding TFR and returned capital without statistical spread', () => {
    expect(investmentPeriodSummary([
      tx({ amount: 1200, tfr: 400, statsSpreadMonths: 12 }),
      tx({ direction: 'in', amount: 100 }),
      tx({ direction: 'out', amount: 300, valueDelta: -350 }),
    ], getPeriodRange('1m', 0, now))).toEqual({ deposits: 1300, returnedCapital: 300, tfr: 400, netDeposits: 600 });
  });
  it('preserves negative net amounts and counts TFR only on deposits', () => {
    expect(investmentPeriodSummary([tx({ amount: 100, tfr: 100 }), tx({ direction: 'out', amount: 200, tfr: 50 })], getPeriodRange('1m', 0, now)))
      .toEqual({ deposits: 100, returnedCapital: 200, tfr: 100, netDeposits: -200 });
  });
  it('excludes projections, recurring templates, other types, previous months and future dates', () => {
    expect(investmentPeriodSummary([
      tx({ projected: true }), tx({ recurring: { freq: 'monthly' } }),
      tx({ type: 'income' }), tx({ type: 'expense' }),
      tx({ date: '2026-10-31' }), tx({ date: '2026-11-16' }),
      tx({ date: '2026-11-01', amount: 0.1 }), tx({ date: '2026-11-15', amount: 0.2 }),
    ], getPeriodRange('1m', 0, now))).toEqual({ deposits: 0.3, returnedCapital: 0, tfr: 0, netDeposits: 0.3 });
  });
  it('includes both boundaries of a previous month and returns zeros for empty periods', () => {
    const range = getPeriodRange('1m', 1, now);
    expect(investmentPeriodSummary([tx({ date: '2026-10-01' }), tx({ date: '2026-10-31' }), tx()], range))
      .toEqual({ deposits: 200, returnedCapital: 0, tfr: 0, netDeposits: 200 });
    expect(investmentPeriodSummary([], range)).toEqual({ deposits: 0, returnedCapital: 0, tfr: 0, netDeposits: 0 });
  });
});
