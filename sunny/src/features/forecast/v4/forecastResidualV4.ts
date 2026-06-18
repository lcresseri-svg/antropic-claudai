/**
 * Residual statistical estimator for Forecast V4.
 *
 * After the deterministic components (spentToDate, planned, recurring, seasonal)
 * are separated out, the remaining variable spend is estimated from the
 * historical tail: for each complete historical month, how much was spent in
 * this category AFTER the snapshot day-of-month — excluding deterministic-like
 * transactions so nothing is double-counted.
 *
 * V4 uses P60 (not V3's P65/P75): once the large/planned/seasonal items are
 * removed, the residual is cleaner and should be estimated less aggressively.
 *
 * Stale decay: a category that has gone quiet (no activity for ≥ 6 months) and
 * is not recurring/seasonal/budgeted/planned/exempt has its residual halved.
 */
import { Transaction, ownShare } from '../../../types';
import { percentile, isStaleDecayExempt, STALE_MONTHS } from './forecastV4Common';

export interface ResidualInputV4 {
  categoryId: string;
  categoryLabel: string;
  /** Day of month of the snapshot (1..31). Tail = spend strictly after this day. */
  snapshotDay: number;
  /** 0-based target month index. */
  targetMonthIndex: number;
  /** Target calendar year. */
  targetYear: number;
  /** Full expense transaction history. */
  historicalTransactions: Transaction[];
  /** Predicate: should this historical tx be excluded as deterministic-like? */
  isDeterministicLike: (tx: Transaction) => boolean;
  /** How many complete months back to sample. Default 12. */
  lookbackMonths?: number;
  /** Signals that exempt the category from stale decay. */
  hasBudget?: boolean;
  hasPlanned?: boolean;
  hasRecurring?: boolean;
  hasSeasonalHighConfidence?: boolean;
}

export interface ResidualResultV4 {
  /** Estimated remaining variable spend (€). */
  value: number;
  /** P60 before any stale decay. */
  rawP60: number;
  /** True when stale decay (×0.5) was applied. */
  staleDecayApplied: boolean;
  /** Number of historical months sampled. */
  samples: number;
}

/** YYYY-MM key for an offset of `i` complete months before the target month. */
function offsetMonthKey(targetYear: number, targetMonthIndex: number, i: number): string {
  const d = new Date(targetYear, targetMonthIndex - i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function computeResidualStatisticalRemainingV4(
  input: ResidualInputV4,
): ResidualResultV4 {
  const {
    categoryId, categoryLabel, snapshotDay, targetMonthIndex, targetYear,
    historicalTransactions, isDeterministicLike,
  } = input;
  const lookbackMonths = input.lookbackMonths ?? 12;

  // Pre-index this category's expense txs by month, tracking earliest activity.
  const catTx = historicalTransactions.filter(
    t => t.type === 'expense' && t.category === categoryId,
  );
  if (catTx.length === 0) {
    return { value: 0, rawP60: 0, staleDecayApplied: false, samples: 0 };
  }
  let firstMonth = catTx[0].date.slice(0, 7);
  for (const t of catTx) {
    const k = t.date.slice(0, 7);
    if (k < firstMonth) firstMonth = k;
  }

  // Build the tail distribution over complete historical months.
  const tailValues: number[] = [];
  for (let i = 1; i <= lookbackMonths; i++) {
    const key = offsetMonthKey(targetYear, targetMonthIndex, i);
    if (key < firstMonth) continue; // category didn't exist yet — not a genuine zero
    let tail = 0;
    for (const t of catTx) {
      if (t.date.slice(0, 7) !== key) continue;
      const day = parseInt(t.date.slice(8, 10), 10);
      if (day <= snapshotDay) continue;        // already "spent to date" in that month
      if (isDeterministicLike(t)) continue;    // captured by a deterministic component
      tail += ownShare(t);
    }
    tailValues.push(tail);
  }

  const rawP60 = percentile(tailValues, 60);

  // ── Stale decay ────────────────────────────────────────────────────────────
  // Quiet for ≥ STALE_MONTHS and not protected by any deterministic signal.
  const recentKeys = new Set<string>();
  for (let i = 1; i <= STALE_MONTHS; i++) {
    recentKeys.add(offsetMonthKey(targetYear, targetMonthIndex, i));
  }
  const hasRecentActivity = catTx.some(t => recentKeys.has(t.date.slice(0, 7)));
  const exempt =
    isStaleDecayExempt(categoryLabel) ||
    Boolean(input.hasRecurring) ||
    Boolean(input.hasSeasonalHighConfidence) ||
    Boolean(input.hasBudget) ||
    Boolean(input.hasPlanned);

  const staleDecayApplied = !hasRecentActivity && !exempt && rawP60 > 0;
  const value = staleDecayApplied ? rawP60 * 0.5 : rawP60;

  return {
    value: Math.max(0, value),
    rawP60: Math.round(rawP60),
    staleDecayApplied,
    samples: tailValues.length,
  };
}
