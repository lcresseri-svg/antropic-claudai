/**
 * Tests for the causal integrity of runBacktestV3.
 *
 * These tests verify the as-of createdAt filter introduced in P0-closeout:
 *   - Late-entered transactions (createdAt after end-of-month + 3-day grace) must not
 *     contaminate historical snapshot inputs.
 *   - The conservative fallback (absent createdAt → always include) must hold.
 *   - The `excludedLateTx` field must accurately reflect how many transactions were
 *     filtered per month.
 *   - The ground-truth `actual` must always include all transactions (no filter on truth).
 *   - Recurring series created after the grace period must also be excluded from the
 *     future-dated recurring filter (series lookahead guard).
 *   - biasFactor must stay within the [0.75, 1.25] clamp regardless of extreme data.
 */
import { describe, it, expect } from 'vitest';
import { runBacktestV3 } from './forecastBacktestV3';
import { Transaction, CategoryDef } from '../../types';

// NOW = June 15 2026.  Backtest looks at i=1 (May), i=2 (April), i=3 (March), …
// Tests use March 2026 (i=3) as the target month.
const NOW = new Date(2026, 5, 15);

// Grace cutoff for March 2026: new Date(2026, 3, 4) = April 4 00:00 local
const MARCH_GRACE_MS = new Date(2026, 3, 4).getTime();
// 1 ms before the cutoff — still within grace
const BEFORE_GRACE_MS = MARCH_GRACE_MS - 1;
// 1 day after the cutoff — clearly outside grace
const AFTER_GRACE_MS = MARCH_GRACE_MS + 86_400_000;

const CAT: CategoryDef[] = [
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#000', kind: 'expense' },
];

function mkTx(
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date,
    description: 'test',
    amount,
    type: 'expense',
    category: 'spesa',
    account: 'conto',
    ...extra,
  };
}

// Helper: extract March 2026 snapshots from a backtest result
function marchSnaps(result: ReturnType<typeof runBacktestV3>) {
  return result.snapshots.filter(s => s.monthKey === '2026-03');
}

// ── as-of createdAt filter ────────────────────────────────────────────────────

describe('runBacktestV3 — as-of causal filter', () => {
  it('excludes a tx whose createdAt equals the grace cutoff (boundary exclusive)', () => {
    const txs = [
      mkTx('2026-03-10', 100),                              // no createdAt → always included
      mkTx('2026-03-20', 200, { createdAt: MARCH_GRACE_MS }), // = cutoff → excluded
    ];
    const result = runBacktestV3(txs, CAT, NOW);
    const snaps = marchSnaps(result);
    expect(snaps.length).toBeGreaterThan(0);
    snaps.forEach(s => expect(s.excludedLateTx).toBe(1));
  });

  it('includes a tx with no createdAt (conservative fallback — no false exclusions)', () => {
    const txs = [
      mkTx('2026-03-10', 100),
      mkTx('2026-03-20', 100),
    ];
    const result = runBacktestV3(txs, CAT, NOW);
    const snaps = marchSnaps(result);
    expect(snaps.length).toBeGreaterThan(0);
    snaps.forEach(s => expect(s.excludedLateTx).toBe(0));
  });

  it('includes a tx whose createdAt is 1 ms before the grace cutoff (boundary inclusive)', () => {
    const txs = [
      mkTx('2026-03-10', 100, { createdAt: BEFORE_GRACE_MS }),
    ];
    const result = runBacktestV3(txs, CAT, NOW);
    const snaps = marchSnaps(result);
    expect(snaps.length).toBeGreaterThan(0);
    snaps.forEach(s => expect(s.excludedLateTx).toBe(0));
  });

  it('excludedLateTx counts all late-created tx in the month, shared identically across all 5 snapshot days', () => {
    const txs = [
      mkTx('2026-03-05', 100),                              // included (no createdAt)
      mkTx('2026-03-10', 100, { createdAt: AFTER_GRACE_MS }), // excluded
      mkTx('2026-03-15', 100, { createdAt: AFTER_GRACE_MS }), // excluded
      mkTx('2026-03-20', 100),                              // included (no createdAt)
    ];
    const result = runBacktestV3(txs, CAT, NOW);
    const snaps = marchSnaps(result);
    expect(snaps.length).toBe(5); // days 5, 10, 15, 20, 25
    snaps.forEach(s => expect(s.excludedLateTx).toBe(2));
  });

  it('late tx still contributes to actual (ground truth is full month, unfiltered)', () => {
    const txs = [
      mkTx('2026-03-05', 100),                              // in snapshot + in actual
      mkTx('2026-03-28', 300, { createdAt: AFTER_GRACE_MS }), // NOT in snapshot, but IS in actual
    ];
    const result = runBacktestV3(txs, CAT, NOW);
    const snaps = marchSnaps(result);
    expect(snaps.length).toBeGreaterThan(0);
    snaps.forEach(s => {
      expect(s.actual).toBe(400); // 100 + 300
      expect(s.excludedLateTx).toBe(1);
    });
  });

  it('recurring tx with createdAt after grace is excluded from the future-dated recurring filter (series lookahead guard)', () => {
    const txs = [
      mkTx('2026-03-05', 100),                                              // real-time entry, included
      mkTx('2026-03-28', 50, { seriesId: 'sub-abc', createdAt: AFTER_GRACE_MS }), // recurring, but late → excluded
    ];
    const result = runBacktestV3(txs, CAT, NOW);
    const snaps = marchSnaps(result);
    expect(snaps.length).toBeGreaterThan(0);
    // Late recurring tx was excluded from snapshot but counted as excluded
    snaps.forEach(s => expect(s.excludedLateTx).toBe(1));
    // Ground truth still includes both
    snaps.forEach(s => expect(s.actual).toBe(150));
  });
});

// ── bias factor clamp ─────────────────────────────────────────────────────────

describe('runBacktestV3 — biasFactor clamp', () => {
  it('biasFactor stays within [0.75, 1.25] even when actual variable spend is 50× the prediction', () => {
    // 8 historical months with small consistent spend
    const historical = [
      '2025-09', '2025-10', '2025-11', '2025-12',
      '2026-01', '2026-02', '2026-03', '2026-04',
    ];
    const txs: Transaction[] = [
      // History: predictable €10 on days 5 and 10 → engine will forecast low variable tail
      ...historical.flatMap(m => [
        mkTx(`${m}-05`, 10),
        mkTx(`${m}-10`, 10),
      ]),
      // May 2026 (i=1): giant surprise at end → rawFactor >> 1 → must be clamped
      mkTx('2026-05-05', 10),
      mkTx('2026-05-28', 5000), // engine can't see this at day-5/10/15/20 snapshot
    ];
    const result = runBacktestV3(txs, CAT, NOW);
    expect(result.snapshots.length).toBeGreaterThan(0);
    expect(result.biasFactor).toBeGreaterThanOrEqual(0.75);
    expect(result.biasFactor).toBeLessThanOrEqual(1.25);
  });
});
