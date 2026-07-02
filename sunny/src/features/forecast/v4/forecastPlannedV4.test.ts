import { describe, it, expect } from 'vitest';
import {
  computeRecurringRemaining, isPlannedLikeTransactionV4, isSeasonalLikeTransactionV4,
} from './forecastPlannedV4';
import { PlannedExpenseV4, SeasonalExpenseCandidateV4 } from './forecastTypesV4';
import { Transaction } from '../../../types';

function tx(date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date, description: 'x', amount,
    type: 'expense', category: 'palestra', account: 'cc', ...extra,
  };
}

const SNAPSHOT = '2026-06-15';
const MONTH = '2026-06';

describe('computeRecurringRemaining — virtual occurrences', () => {
  it('counts the template row AND its later virtual occurrences within the month (weekly)', () => {
    // Weekly series: next occurrence (template) on the 17th → the 24th exists
    // only as a rule, not as a document. Both must be forecast.
    const template = tx('2026-06-17', 25, { seriesId: 's1', recurring: { freq: 'weekly' } });
    const out = computeRecurringRemaining([template], SNAPSHOT, MONTH);
    expect(out['palestra']).toBe(50); // 17 + 24 (1 July is out of the month)
  });

  it('deduplicates virtual occurrences against real rows of the same series', () => {
    const template = tx('2026-06-17', 25, { seriesId: 's1', recurring: { freq: 'weekly' } });
    const materialized = tx('2026-06-24', 25, { seriesId: 's1' });
    const out = computeRecurringRemaining([template, materialized], SNAPSHOT, MONTH);
    expect(out['palestra']).toBe(50); // not 75: the 24th is counted once
  });

  it('respects the series `until` bound when expanding', () => {
    const template = tx('2026-06-16', 10, { seriesId: 's1', recurring: { freq: 'daily', until: '2026-06-19' } });
    const out = computeRecurringRemaining([template], SNAPSHOT, MONTH);
    expect(out['palestra']).toBe(40); // 16, 17, 18, 19 — nothing after `until`
  });

  it('contributes nothing when the next occurrence is beyond the target month', () => {
    const template = tx('2026-07-05', 25, { seriesId: 's1', recurring: { freq: 'monthly' } });
    const out = computeRecurringRemaining([template], SNAPSHOT, MONTH);
    expect(out['palestra']).toBeUndefined();
  });

  it('ignores an EXPIRED template (series already past its own until)', () => {
    // A dead series whose template lingers future-dated past `until` is not spend.
    const expired = tx('2026-06-20', 500, { seriesId: 's1', recurring: { freq: 'monthly', until: '2026-05-31' } });
    const out = computeRecurringRemaining([expired], SNAPSHOT, MONTH);
    expect(out['palestra']).toBeUndefined();
  });
});

describe('isPlannedLikeTransactionV4 — historical anti double-count', () => {
  const planned: PlannedExpenseV4[] = [{
    id: 'p1', categoryId: 'palestra', amount: 300, expectedDate: '2026-06-28',
    confidence: 'likely', source: 'manual', recurrence: 'none',
  }];

  it('matches an amount-similar historical tx in ANOTHER month (no date window)', () => {
    expect(isPlannedLikeTransactionV4(tx('2026-03-10', 310), planned)).toBe(true);
  });

  it('still requires ±3 days for a tx in the SAME month as the planned expense', () => {
    expect(isPlannedLikeTransactionV4(tx('2026-06-10', 300), planned)).toBe(false);
    expect(isPlannedLikeTransactionV4(tx('2026-06-26', 300), planned)).toBe(true);
  });

  it('never matches a different category or a dissimilar amount', () => {
    expect(isPlannedLikeTransactionV4(tx('2026-03-10', 310, { category: 'altro' }), planned)).toBe(false);
    expect(isPlannedLikeTransactionV4(tx('2026-03-10', 900), planned)).toBe(false);
  });
});

describe('isSeasonalLikeTransactionV4 — partial-payment candidates', () => {
  it('matches historical full-amount occurrences via expectedAmountFull', () => {
    const candidate: SeasonalExpenseCandidateV4 = {
      categoryId: 'palestra', expectedAmount: 475, expectedAmountFull: 875,
      expectedMonth: 5, confidence: 'high', sourceMonths: ['2025-06'], reason: 'x',
    };
    // 870 is similar to the FULL 875, not to the reduced 475.
    expect(isSeasonalLikeTransactionV4(tx('2025-06-10', 870), candidate)).toBe(true);
  });
});
