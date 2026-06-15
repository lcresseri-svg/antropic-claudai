import { describe, it, expect } from 'vitest';
import {
  getPeriodRange, getPreviousPeriodRange, periodElapsedFraction,
  aggregateCategorySpending, buildComposition, aggregateCategoryTrend,
  getCategoryMovements, historicalMonthlyAverage, localISO,
} from './categoryAnalytics';
import { Transaction } from '../../types';

const NOW = new Date(2026, 5, 15); // 15 June 2026 (local)

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2026-06-01', description: '', amount: 0,
  type: 'expense', category: 'spesa', account: 'conto', ...over,
});

const SAMPLE: Transaction[] = [
  tx({ category: 'spesa', amount: 100, date: '2026-06-05' }),
  tx({ category: 'spesa', amount: 50,  date: '2026-06-10' }),
  tx({ category: 'casa',  amount: 80,  date: '2026-06-12' }),
  tx({ category: 'ristoranti', amount: 30, date: '2026-06-14' }),
  tx({ category: 'spesa', amount: 200, date: '2026-05-20' }),       // previous period
  tx({ category: 'spesa', amount: 999, date: '2026-06-20' }),       // future (after NOW) → excluded
  tx({ category: 'stipendio', amount: 1000, type: 'income', date: '2026-06-01' }), // not an expense
  tx({ category: 'spesa', amount: 500, date: '2026-06-08', projected: true }),     // projected → excluded
];

describe('getPeriodRange', () => {
  it('1m current period spans the current month up to now', () => {
    const r = getPeriodRange('1m', 0, NOW);
    expect(localISO(r.start)).toBe('2026-06-01');
    expect(localISO(r.end)).toBe('2026-06-15');
    expect(r.months).toBe(1);
    expect(r.isCurrent).toBe(true);
    expect(r.label.toLowerCase()).toContain('giugno');
  });

  it('3m current window covers three months ending this month', () => {
    const r = getPeriodRange('3m', 0, NOW);
    expect(localISO(r.start)).toBe('2026-04-01');
    expect(localISO(r.end)).toBe('2026-06-15');
    expect(r.label).toContain('2026');
    expect(r.label).toContain('–');
  });

  it('steps back one month at a time via offset (sliding window)', () => {
    const r = getPeriodRange('3m', 1, NOW);
    // offset=1 → end = May 2026, start = Mar 2026 (3-month window slid 1 month back)
    expect(localISO(r.start)).toBe('2026-03-01');
    expect(localISO(r.end)).toBe('2026-05-31');
    expect(r.isCurrent).toBe(false);
  });

  it('previous period is the immediately preceding non-overlapping window', () => {
    const prev = getPreviousPeriodRange('1m', 0, NOW);
    expect(localISO(prev.start)).toBe('2026-05-01');
    expect(localISO(prev.end)).toBe('2026-05-31');
  });
});

describe('periodElapsedFraction', () => {
  it('is between 0 and 1 for the current period and 1 for past periods', () => {
    const cur = periodElapsedFraction(getPeriodRange('1m', 0, NOW), NOW);
    expect(cur).toBeGreaterThan(0.3);
    expect(cur).toBeLessThan(0.7);
    expect(periodElapsedFraction(getPeriodRange('1m', 1, NOW), NOW)).toBe(1);
  });
});

describe('aggregateCategorySpending', () => {
  const range = getPeriodRange('1m', 0, NOW);
  const prev = getPreviousPeriodRange('1m', 0, NOW);

  it('totals only realized, in-range expenses (no income, projected or future)', () => {
    const agg = aggregateCategorySpending(SAMPLE, range, prev);
    expect(agg.total).toBe(260);            // spesa 150 + casa 80 + ristoranti 30
    expect(agg.previousTotal).toBe(200);    // spesa 200 in May
    expect(agg.deltaPercentage).toBeCloseTo(30, 5);
  });

  it('computes per-category amount, delta, median and sort order', () => {
    const agg = aggregateCategorySpending(SAMPLE, range, prev);
    expect(agg.categories.map(c => c.categoryId)).toEqual(['spesa', 'casa', 'ristoranti']);
    const spesa = agg.categories[0];
    expect(spesa.amount).toBe(150);
    expect(spesa.transactionCount).toBe(2);
    expect(spesa.medianTransactionAmount).toBe(75);
    expect(spesa.previousAmount).toBe(200);
    expect(spesa.deltaAmount).toBe(-50);
    expect(spesa.deltaPercentage).toBeCloseTo(-25, 5);
    const casa = agg.categories[1];
    expect(casa.deltaPercentage).toBeNull(); // no previous spend
    expect(Math.round(spesa.percentageOfTotal)).toBe(58);
  });

  it('derives budget usage and over-pace flag', () => {
    const agg = aggregateCategorySpending(SAMPLE, range, prev, { categoryBudgets: { spesa: 100 }, now: NOW });
    const spesa = agg.categories.find(c => c.categoryId === 'spesa')!;
    expect(spesa.budgetAmount).toBe(100);
    expect(spesa.budgetUsedPercentage).toBeCloseTo(150, 5);
    expect(spesa.isOverPace).toBe(true);
  });
});

describe('buildComposition', () => {
  it('keeps top-N categories and aggregates the rest into Altro', () => {
    const agg = aggregateCategorySpending(SAMPLE, getPeriodRange('1m', 0, NOW), getPreviousPeriodRange('1m', 0, NOW));
    const comp = buildComposition(agg.categories, agg.total, 2);
    expect(comp.map(s => s.categoryId)).toEqual(['spesa', 'casa', '__other__']);
    const other = comp.find(s => s.categoryId === '__other__')!;
    expect(other.amount).toBe(30); // ristoranti folded in
  });
});

describe('aggregateCategoryTrend', () => {
  it('produces one point per month for multi-month windows', () => {
    const pts = aggregateCategoryTrend(SAMPLE, 'spesa', '3m', 0, NOW);
    expect(pts).toHaveLength(3);            // Apr, May, Jun
    expect(pts[1].amount).toBe(200);        // May
    expect(pts[2].amount).toBe(150);        // June (future-dated 999 excluded)
  });

  it('produces weekly buckets for the single-month window', () => {
    const pts = aggregateCategoryTrend(SAMPLE, 'spesa', '1m', 0, NOW);
    expect(pts).toHaveLength(5);            // weeks starting 1, 8, 15, 22, 29
    expect(pts[0].amount).toBe(100);        // 06-05 in week 1
    expect(pts[1].amount).toBe(50);         // 06-10 in week 2
  });
});

describe('getCategoryMovements', () => {
  it('returns in-range expenses for the category, newest first', () => {
    const moves = getCategoryMovements(SAMPLE, 'spesa', getPeriodRange('1m', 0, NOW));
    expect(moves.map(m => m.date)).toEqual(['2026-06-10', '2026-06-05']);
  });
});

describe('historicalMonthlyAverage', () => {
  it('averages over the last full months excluding the current one', () => {
    expect(historicalMonthlyAverage(SAMPLE, 'spesa', NOW, 6)).toBeCloseTo(200 / 6, 5);
  });
});
