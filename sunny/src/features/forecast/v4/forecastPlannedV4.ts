/**
 * Planned & recurring deterministic components for Forecast V4, plus the
 * "deterministic-like" classifiers used for anti-double-count.
 *
 * A single real expense must be counted in exactly ONE of:
 *   planned · recurring · seasonal · residual · budget-signal.
 * These helpers keep the partition clean.
 */
import { Transaction, ownShare } from '../../../types';
import {
  PlannedExpenseV4, SeasonalExpenseCandidateV4,
} from './forecastTypesV4';
import { amountsSimilar, LARGE_EXPENSE_THRESHOLD } from './forecastV4Common';

/** True for explicitly recurring transactions (series / recurrence rule). */
export function isRecurringLikeTransactionV4(tx: Transaction): boolean {
  return Boolean(tx.seriesId || tx.recurring);
}

/**
 * True when a transaction matches an explicit planned expense: same category,
 * similar amount, and within ±3 days of the planned date (when given).
 */
export function isPlannedLikeTransactionV4(
  tx: Transaction,
  plannedExpenses: PlannedExpenseV4[],
): boolean {
  const amt = ownShare(tx);
  return plannedExpenses.some(p => {
    if (p.categoryId !== tx.category) return false;
    if (!amountsSimilar(amt, p.amount)) return false;
    if (p.expectedDate) {
      const diff = Math.abs(new Date(tx.date).getTime() - new Date(p.expectedDate).getTime());
      if (diff > 3 * 86_400_000) return false;
    }
    return true;
  });
}

/**
 * True when a transaction looks like the seasonal candidate it's compared
 * against: same category, same calendar month, large, and similar amount to the
 * candidate's expected amount.
 */
export function isSeasonalLikeTransactionV4(
  tx: Transaction,
  candidate: SeasonalExpenseCandidateV4 | undefined,
): boolean {
  if (!candidate) return false;
  if (tx.category !== candidate.categoryId) return false;
  const monthIdx = parseInt(tx.date.slice(5, 7), 10) - 1;
  if (monthIdx !== candidate.expectedMonth) return false;
  const amt = ownShare(tx);
  if (amt < LARGE_EXPENSE_THRESHOLD) return false;
  return amountsSimilar(amt, candidate.expectedAmount);
}

/**
 * A transaction is "deterministic-like" when it is already captured by a
 * deterministic component and must therefore be excluded from the residual
 * statistical tail:
 *   - it belongs to a recurring series; OR
 *   - it is large (≥ 300 €) and matches a planned expense; OR
 *   - it matches the category's seasonal candidate.
 */
export function isDeterministicLikeTransactionV4(
  tx: Transaction,
  ctx: {
    plannedExpenses: PlannedExpenseV4[];
    seasonalCandidate?: SeasonalExpenseCandidateV4;
  },
): boolean {
  if (isRecurringLikeTransactionV4(tx)) return true;
  if (ownShare(tx) >= LARGE_EXPENSE_THRESHOLD && isPlannedLikeTransactionV4(tx, ctx.plannedExpenses)) return true;
  if (isSeasonalLikeTransactionV4(tx, ctx.seasonalCandidate)) return true;
  return false;
}

// ── Deriving planned expenses from Sunny's data model ────────────────────────

/**
 * In Sunny a "planned manual" expense is a future-dated, non-recurring expense
 * transaction the user entered ahead of time. Recurring future occurrences are
 * handled separately (computeRecurringRemaining), so they're excluded here.
 *
 * Only transactions strictly AFTER the snapshot date (date > snapshotISO) in the
 * target month are planned-remaining; anything on/before the snapshot is already
 * counted in spentToDate.
 */
export function buildPlannedExpensesFromTransactions(
  expenses: Transaction[],
  snapshotISO: string,
  targetMonth: string,
): PlannedExpenseV4[] {
  const out: PlannedExpenseV4[] = [];
  for (const t of expenses) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) !== targetMonth) continue;
    if (t.date <= snapshotISO) continue;
    if (isRecurringLikeTransactionV4(t)) continue;
    out.push({
      id: t.id,
      categoryId: t.category,
      amount: ownShare(t),
      expectedDate: t.date,
      confidence: 'likely',
      source: 'manual',
      recurrence: 'none',
    });
  }
  return out;
}

/**
 * plannedManualRemaining per category: sum of planned expenses still due this
 * month (expectedDate > snapshotISO, in the target month).
 */
export function computePlannedManualRemaining(
  plannedExpenses: PlannedExpenseV4[],
  snapshotISO: string,
  targetMonth: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of plannedExpenses) {
    if (!p.expectedDate.startsWith(targetMonth)) continue;
    if (p.expectedDate <= snapshotISO) continue;
    out[p.categoryId] = (out[p.categoryId] ?? 0) + p.amount;
  }
  return out;
}

/**
 * recurringRemaining per category: future recurring expense transactions in the
 * target month (date > snapshotISO). These are deterministic and must not be
 * re-counted by the residual estimator.
 */
export function computeRecurringRemaining(
  expenses: Transaction[],
  snapshotISO: string,
  targetMonth: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of expenses) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) !== targetMonth) continue;
    if (t.date <= snapshotISO) continue;
    if (!isRecurringLikeTransactionV4(t)) continue;
    out[t.category] = (out[t.category] ?? 0) + ownShare(t);
  }
  return out;
}

/**
 * spentToDate per category: expense transactions in the target month on/before
 * the snapshot date. This is the partition complement of planned + recurring
 * remaining, so there's no overlap.
 */
export function computeSpentToDate(
  expenses: Transaction[],
  snapshotISO: string,
  targetMonth: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of expenses) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) !== targetMonth) continue;
    if (t.date > snapshotISO) continue;
    out[t.category] = (out[t.category] ?? 0) + ownShare(t);
  }
  return out;
}
