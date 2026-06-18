import { describe, it, expect } from 'vitest';
import { computeResidualStatisticalRemainingV4 } from './forecastResidualV4';
import { isRecurringLikeTransactionV4 } from './forecastPlannedV4';
import { percentile } from './forecastV4Common';
import { Transaction } from '../../../types';

function mkTx(date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date, description: 'spesa', amount,
    type: 'expense', category: 'spesa', account: 'cc', ...extra,
  };
}

describe('percentile P60', () => {
  it('computes P60 of [100,200,300,400,500] = 340 (linear interpolation)', () => {
    expect(percentile([100, 200, 300, 400, 500], 60)).toBeCloseTo(340, 5);
  });
});

describe('computeResidualStatisticalRemainingV4 — tail + P60', () => {
  // Target June 2026, snapshot day 10. Five months of increasing after-day-10 spend.
  const txs = [
    mkTx('2026-01-20', 100),
    mkTx('2026-02-20', 200),
    mkTx('2026-03-20', 300),
    mkTx('2026-04-20', 400),
    mkTx('2026-05-20', 500),
  ];

  it('uses P60 of the monthly tail distribution', () => {
    const r = computeResidualStatisticalRemainingV4({
      categoryId: 'spesa', categoryLabel: 'Spesa',
      snapshotDay: 10, targetMonthIndex: 5, targetYear: 2026,
      historicalTransactions: txs,
      isDeterministicLike: () => false,
      lookbackMonths: 5,
    });
    expect(r.samples).toBe(5);
    expect(r.value).toBeCloseTo(340, 0);
    expect(r.staleDecayApplied).toBe(false);
  });

  it('ignores spend on/before the snapshot day (only the tail counts)', () => {
    const early = [mkTx('2026-04-05', 999)]; // day 5 ≤ snapshot day 10 → not in tail
    const r = computeResidualStatisticalRemainingV4({
      categoryId: 'spesa', categoryLabel: 'Spesa',
      snapshotDay: 10, targetMonthIndex: 5, targetYear: 2026,
      historicalTransactions: [...txs, ...early],
      isDeterministicLike: () => false,
      lookbackMonths: 5,
    });
    // April tail unchanged (still 400) → P60 unchanged
    expect(r.value).toBeCloseTo(340, 0);
  });
});

describe('computeResidualStatisticalRemainingV4 — deterministic-like exclusion', () => {
  // All five months' tail spend is recurring (seriesId).
  const recurringTxs = [
    mkTx('2026-01-20', 300, { seriesId: 's1' }),
    mkTx('2026-02-20', 300, { seriesId: 's1' }),
    mkTx('2026-03-20', 300, { seriesId: 's1' }),
    mkTx('2026-04-20', 300, { seriesId: 's1' }),
    mkTx('2026-05-20', 300, { seriesId: 's1' }),
  ];

  it('excludes deterministic-like (recurring) txs from the historical tail → residual 0', () => {
    const r = computeResidualStatisticalRemainingV4({
      categoryId: 'spesa', categoryLabel: 'Spesa',
      snapshotDay: 10, targetMonthIndex: 5, targetYear: 2026,
      historicalTransactions: recurringTxs,
      isDeterministicLike: isRecurringLikeTransactionV4,
      lookbackMonths: 5,
    });
    expect(r.samples).toBe(5);
    expect(r.value).toBe(0);
  });

  it('counts the same txs when the predicate does not exclude them', () => {
    const r = computeResidualStatisticalRemainingV4({
      categoryId: 'spesa', categoryLabel: 'Spesa',
      snapshotDay: 10, targetMonthIndex: 5, targetYear: 2026,
      historicalTransactions: recurringTxs,
      isDeterministicLike: () => false,
      lookbackMonths: 5,
    });
    expect(r.value).toBeCloseTo(300, 0);
  });
});

describe('computeResidualStatisticalRemainingV4 — stale decay', () => {
  // Active in offsets 7–12 (2025-06 … 2025-11) only; quiet for the last 6 months.
  const oldActivity = [
    mkTx('2025-06-20', 600), mkTx('2025-07-20', 600), mkTx('2025-08-20', 600),
    mkTx('2025-09-20', 600), mkTx('2025-10-20', 600), mkTx('2025-11-20', 600),
  ];

  it('halves the residual for a stale, non-protected category', () => {
    const r = computeResidualStatisticalRemainingV4({
      categoryId: 'spesa', categoryLabel: 'Vecchia categoria',
      snapshotDay: 10, targetMonthIndex: 5, targetYear: 2026,
      historicalTransactions: oldActivity,
      isDeterministicLike: () => false,
      lookbackMonths: 12,
    });
    expect(r.rawP60).toBe(600);
    expect(r.staleDecayApplied).toBe(true);
    expect(r.value).toBeCloseTo(300, 0);
  });

  it('does NOT apply stale decay to an exempt category (e.g. Abbonamenti)', () => {
    const r = computeResidualStatisticalRemainingV4({
      categoryId: 'spesa', categoryLabel: 'Abbonamenti',
      snapshotDay: 10, targetMonthIndex: 5, targetYear: 2026,
      historicalTransactions: oldActivity,
      isDeterministicLike: () => false,
      lookbackMonths: 12,
    });
    expect(r.staleDecayApplied).toBe(false);
    expect(r.value).toBeCloseTo(600, 0);
  });

  it('does NOT apply stale decay when the category has a budget/planned signal', () => {
    const r = computeResidualStatisticalRemainingV4({
      categoryId: 'spesa', categoryLabel: 'Vecchia categoria',
      snapshotDay: 10, targetMonthIndex: 5, targetYear: 2026,
      historicalTransactions: oldActivity,
      isDeterministicLike: () => false,
      lookbackMonths: 12,
      hasBudget: true,
    });
    expect(r.staleDecayApplied).toBe(false);
    expect(r.value).toBeCloseTo(600, 0);
  });
});
