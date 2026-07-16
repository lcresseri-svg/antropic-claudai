import { describe, it, expect } from 'vitest';
import { Transaction } from '../../types';
import {
  statsSpreadOf, spreadQuotas, monthlyInvestmentStats, addMonths,
  STATS_SPREAD_MIN, STATS_SPREAD_MAX,
} from './investmentStatsSpread';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'x', date: '2026-07-15', description: 'dep', amount: 100,
  type: 'investment', category: 'etf', account: 'a1', direction: 'in', ...over,
} as Transaction);

describe('statsSpreadOf', () => {
  it('valid only on one-off investment deposits within 2–120', () => {
    expect(statsSpreadOf(tx({ statsSpreadMonths: 12 }))).toBe(12);
    expect(statsSpreadOf(tx({ statsSpreadMonths: STATS_SPREAD_MIN }))).toBe(2);
    expect(statsSpreadOf(tx({ statsSpreadMonths: STATS_SPREAD_MAX }))).toBe(120);
  });
  it('null for withdrawals, series, templates, projections, out-of-range', () => {
    expect(statsSpreadOf(tx({}))).toBeNull();
    expect(statsSpreadOf(tx({ statsSpreadMonths: 12, direction: 'out' }))).toBeNull();
    expect(statsSpreadOf(tx({ statsSpreadMonths: 12, seriesId: 's1' }))).toBeNull();
    expect(statsSpreadOf(tx({ statsSpreadMonths: 12, recurring: { freq: 'monthly' } }))).toBeNull();
    expect(statsSpreadOf(tx({ statsSpreadMonths: 12, projected: true }))).toBeNull();
    expect(statsSpreadOf(tx({ statsSpreadMonths: 1 }))).toBeNull();
    expect(statsSpreadOf(tx({ statsSpreadMonths: 121 }))).toBeNull();
    expect(statsSpreadOf(tx({ statsSpreadMonths: 6.5 }))).toBeNull();
    expect(statsSpreadOf(tx({ type: 'expense', statsSpreadMonths: 6 } as Partial<Transaction>))).toBeNull();
  });
});

describe('spreadQuotas', () => {
  it('spec example: 1.200 € a luglio su 12 mesi = 100 € da luglio a giugno', () => {
    const q = spreadQuotas(1200, '2026-07', 12);
    expect(q).toHaveLength(12);
    expect(q[0]).toEqual({ month: '2026-07', amount: 100 });
    expect(q[11]).toEqual({ month: '2027-06', amount: 100 });
    expect(q.every(x => x.amount === 100)).toBe(true);
  });
  it('cents: rounding residue lands on the LAST month, sum is exact', () => {
    const q = spreadQuotas(100, '2026-01', 3); // 33.33 + 33.33 + 33.34
    expect(q.map(x => x.amount)).toEqual([33.33, 33.33, 33.34]);
    expect(q.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(100, 10);
  });
  it('sum stays exact on adversarial amounts', () => {
    for (const [amount, months] of [[0.03, 2], [1000.01, 7], [999.99, 120], [1, 3]] as const) {
      const q = spreadQuotas(amount, '2026-07', months);
      expect(q).toHaveLength(months);
      expect(q.reduce((s, x) => s + Math.round(x.amount * 100), 0)).toBe(Math.round(amount * 100));
    }
  });
  it('crosses year boundaries', () => {
    const q = spreadQuotas(60, '2026-11', 3);
    expect(q.map(x => x.month)).toEqual(['2026-11', '2026-12', '2027-01']);
  });
});

describe('monthlyInvestmentStats', () => {
  it('spread deposits contribute monthly quotas; others land on their real month', () => {
    const stat = monthlyInvestmentStats([
      tx({ amount: 1200, date: '2026-07-01', statsSpreadMonths: 12 }),
      tx({ amount: 50, date: '2026-07-20' }),
    ], { untilMonth: '2026-09' });
    expect(stat.get('2026-07')).toBe(150); // 100 quota + 50 one-off
    expect(stat.get('2026-08')).toBe(100);
    expect(stat.get('2026-09')).toBe(100);
    expect(stat.get('2026-10')).toBeUndefined(); // competenza: capped at untilMonth
  });
  it('TFR share is spread together with the rest (full amount)', () => {
    const stat = monthlyInvestmentStats([
      tx({ amount: 300, tfr: 200, date: '2026-07-01', statsSpreadMonths: 3 }),
    ], { untilMonth: '2027-12' });
    expect(stat.get('2026-07')).toBe(100);
    expect(stat.get('2026-08')).toBe(100);
    expect(stat.get('2026-09')).toBe(100);
  });
  it('withdrawals subtract on their real month, never spread', () => {
    const stat = monthlyInvestmentStats([
      tx({ amount: 90, date: '2026-07-05', direction: 'out', statsSpreadMonths: 3 }),
    ]);
    expect(stat.get('2026-07')).toBe(-90);
    expect(stat.size).toBe(1);
  });
  it('templates and projected rows are ignored', () => {
    const stat = monthlyInvestmentStats([
      tx({ recurring: { freq: 'monthly' } }),
      tx({ projected: true }),
    ]);
    expect(stat.size).toBe(0);
  });
  it('edit/delete recompute dynamically (pure function of the input)', () => {
    const dep = tx({ amount: 1200, date: '2026-07-01', statsSpreadMonths: 12 });
    const before = monthlyInvestmentStats([dep], { untilMonth: '2027-12' });
    expect(before.get('2027-06')).toBe(100);
    // "delete": no residue anywhere
    expect(monthlyInvestmentStats([], { untilMonth: '2027-12' }).size).toBe(0);
    // "edit": spread removed → whole amount back on the real month
    const after = monthlyInvestmentStats([{ ...dep, statsSpreadMonths: undefined }], { untilMonth: '2027-12' });
    expect(after.get('2026-07')).toBe(1200);
    expect(after.get('2026-08')).toBeUndefined();
  });
});

describe('addMonths', () => {
  it('shifts across years', () => {
    expect(addMonths('2026-07', 6)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});
