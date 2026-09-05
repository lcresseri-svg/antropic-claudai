import { describe, it, expect } from 'vitest';
import { CategoryDef, Transaction } from '../../types';
import { buildInvestmentTrend, investmentAxisMax, summarizeInvestmentPeriod } from './investmentTrend';

const today = '2026-09-05';
const keys = ['2026-07', '2026-08', '2026-09'];
const cat = (p: Partial<CategoryDef> = {}): CategoryDef => ({ id: 'fund', label: 'Fondo', icon: '', color: '#aaa', kind: 'investment', initialBalance: 1000, ...p });
const tx = (p: Partial<Transaction> = {}): Transaction => ({ id: 't', date: today, description: '', amount: 100, type: 'investment', category: 'fund', account: '', ...p });

describe('buildInvestmentTrend', () => {
  it('includes opening capital and pre-window flows, without counting them as period deposits', () => {
    const points = buildInvestmentTrend(keys, [cat()], [tx({ date: '2026-01-01', amount: 200 }), tx({ date: '2026-07-10' }), tx({ amount: 50 })], today);
    expect(points).toEqual([
      { key: keys[0], versato: 1300, deposits: 100, returned: 0 },
      { key: keys[1], versato: 1300, deposits: 0, returned: 0 },
      { key: keys[2], versato: 1350, deposits: 50, returned: 0 },
    ]);
    expect(summarizeInvestmentPeriod(points)).toEqual({ deposits: 150, returned: 0, net: 150 });
  });
  it('excludes future dates within the current month, projected and expired templates', () => {
    const points = buildInvestmentTrend(keys, [cat()], [
      tx({ date: '2026-09-06' }), tx({ projected: true }),
      tx({ date: '2026-08-01', recurring: { freq: 'monthly', until: '2026-07-01' } }),
      tx({ date: today }),
    ], today);
    expect(points[2]).toEqual({ key: keys[2], versato: 1100, deposits: 100, returned: 0 });
  });
  it('matches balance semantics for a started legacy recurring template', () => {
    const points = buildInvestmentTrend(keys, [cat()], [tx({ recurring: { freq: 'monthly' } })], today);
    expect(points[2].versato).toBe(1100);
  });
  it('ignores archived, hidden, non-investment and unrelated transactions', () => {
    const points = buildInvestmentTrend(keys, [cat(), cat({ id: 'old', archived: true }), cat({ id: 'food', kind: 'expense' })], [
      tx({ category: 'old' }), tx({ category: 'hidden' }), tx({ category: 'food' }), tx({ type: 'income' }),
    ], today);
    expect(points.every(p => p.versato === 1000 && p.deposits === 0)).toBe(true);
  });
  it('tracks returned capital separately from market-value deltas and realized gains', () => {
    const points = buildInvestmentTrend(keys, [cat()], [
      tx({ date: '2026-08-01', direction: 'out', amount: 300, valueDelta: -400 }),
      tx({ type: 'income', amount: 100 }),
    ], today);
    expect(points[1]).toEqual({ key: keys[1], versato: 700, deposits: 0, returned: 300 });
    expect(summarizeInvestmentPeriod(points)).toEqual({ deposits: 0, returned: 300, net: -300 });
  });
  it('uses actual dates, not statistical spreading; includes TFR only once', () => {
    const points = buildInvestmentTrend(keys, [cat()], [tx({ amount: 1200, statsSpreadMonths: 12, tfr: 400 })], today);
    expect(points.map(p => p.deposits)).toEqual([0, 0, 1200]);
    expect(points[2].versato).toBe(2200);
  });
  it('floors each category at zero, retaining raw balances for later months', () => {
    const points = buildInvestmentTrend(keys, [cat({ initialBalance: 0 }), cat({ id: 'other' })], [
      tx({ date: '2026-07-01', direction: 'out', amount: 200 }), tx({ date: '2026-08-01' }), tx({ amount: 200 }),
    ], today);
    expect(points.map(p => p.versato)).toEqual([1000, 1000, 1100]);
  });
  it('handles unsorted movements, year boundaries and cent rounding', () => {
    const points = buildInvestmentTrend(['2025-12', '2026-01'], [cat({ initialBalance: 0 })], [
      tx({ date: '2026-01-01', amount: 0.2 }), tx({ date: '2025-12-01', amount: 0.1 }),
    ], today);
    expect(points.map(p => p.versato)).toEqual([0.1, 0.3]);
    expect(summarizeInvestmentPeriod(points.slice(-1)).net).toBe(0.2);
  });
  it('handles no months, no positions and no movements', () => {
    expect(buildInvestmentTrend([], [cat()], [], today)).toEqual([]);
    expect(buildInvestmentTrend(keys, [], [], today).every(p => p.versato === 0)).toBe(true);
    expect(buildInvestmentTrend(keys, [cat()], [], today).every(p => p.versato === 1000)).toBe(true);
    expect(summarizeInvestmentPeriod([])).toEqual({ deposits: 0, returned: 0, net: 0 });
  });
});

describe('investmentAxisMax', () => {
  it.each([0, 0.01, 1, 1000, 31065.14, 10000000])('has a finite positive scale covering %s', value => {
    const max = investmentAxisMax([{ key: today.slice(0, 7), versato: value, deposits: 0, returned: 0 }]);
    expect(Number.isFinite(max)).toBe(true);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeGreaterThanOrEqual(value);
  });
});
