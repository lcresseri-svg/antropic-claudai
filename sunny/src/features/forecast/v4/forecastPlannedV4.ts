/**
 * Planned & recurring deterministic components for Forecast V4, plus the
 * "deterministic-like" classifiers used for anti-double-count.
 *
 * A single real expense must be counted in exactly ONE of:
 *   planned · recurring · seasonal · residual · budget-signal.
 * These helpers keep the partition clean.
 */
import { Transaction, ownShare } from '../../../types';
import { addPeriod, isExpiredTemplate } from '../../../shared/recurrence';
import {
  PlannedExpenseV4, SeasonalExpenseCandidateV4,
} from './forecastTypesV4';
import { amountsSimilar, daysInMonth, LARGE_EXPENSE_THRESHOLD } from './forecastV4Common';

/** True for explicitly recurring transactions (series / recurrence rule). */
export function isRecurringLikeTransactionV4(tx: Transaction): boolean {
  return Boolean(tx.seriesId || tx.recurring);
}

/**
 * True when a transaction matches an explicit planned expense: same category
 * and similar amount. When the transaction is in the SAME month as the planned
 * expense it must also sit within ±3 days of the planned date; transactions in
 * OTHER (historical) months match on category+amount alone — that's the
 * anti-double-count that keeps a monthly one-off (e.g. a fee entered by hand
 * each month, no series) from being predicted twice: once as this month's
 * planned expense and once again by the residual tail built from the very same
 * historical one-offs.
 */
export function isPlannedLikeTransactionV4(
  tx: Transaction,
  plannedExpenses: PlannedExpenseV4[],
): boolean {
  const amt = ownShare(tx);
  const txMonth = tx.date.slice(0, 7);
  return plannedExpenses.some(p => {
    if (p.categoryId !== tx.category) return false;
    if (!amountsSimilar(amt, p.amount)) return false;
    if (p.expectedDate && p.expectedDate.slice(0, 7) === txMonth) {
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
  // Match against the FULL historical amount: when the candidate was reduced by
  // a partial payment this month, historical full-amount occurrences must still
  // be recognised (and excluded from the residual tail).
  return amountsSimilar(amt, candidate.expectedAmountFull ?? candidate.expectedAmount);
}

export type DeterministicLikeKindV4 = 'recurring' | 'planned' | 'seasonal';

/**
 * Which deterministic component (if any) already captures this transaction, so
 * it must be excluded from the residual statistical tail:
 *   - 'recurring': it belongs to a recurring series;
 *   - 'planned':   it is large (≥ 300 €) and matches a planned expense;
 *   - 'seasonal':  it matches the category's seasonal candidate;
 *   - null:        variable spend — it stays in the tail.
 */
export function deterministicLikeKindV4(
  tx: Transaction,
  ctx: {
    plannedExpenses: PlannedExpenseV4[];
    seasonalCandidate?: SeasonalExpenseCandidateV4;
  },
): DeterministicLikeKindV4 | null {
  if (isRecurringLikeTransactionV4(tx)) return 'recurring';
  if (ownShare(tx) >= LARGE_EXPENSE_THRESHOLD && isPlannedLikeTransactionV4(tx, ctx.plannedExpenses)) return 'planned';
  if (isSeasonalLikeTransactionV4(tx, ctx.seasonalCandidate)) return 'seasonal';
  return null;
}

/** Boolean form of deterministicLikeKindV4 (kept for compatibility). */
export function isDeterministicLikeTransactionV4(
  tx: Transaction,
  ctx: {
    plannedExpenses: PlannedExpenseV4[];
    seasonalCandidate?: SeasonalExpenseCandidateV4;
  },
): boolean {
  return deterministicLikeKindV4(tx, ctx) !== null;
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
 * recurringRemaining per category: future recurring expense occurrences in the
 * target month (date > snapshotISO). These are deterministic and must not be
 * re-counted by the residual estimator.
 *
 * Two sources, deduplicated by (seriesId, date):
 *   1. REAL rows — materialized instances, caller-fed projected rows, and the
 *      recurring template itself (whose date IS the series' next occurrence).
 *   2. VIRTUAL occurrences — in Sunny only the NEXT occurrence of a series
 *      exists as a document; later occurrences in the month are only implied
 *      by the recurrence rule. A weekly/daily series would otherwise have its
 *      2nd..nth occurrence of the month counted NOWHERE (the residual tail
 *      excludes recurring history), so they are expanded here from the
 *      template's rule up to month end (respecting `until`).
 *
 * Expired templates (a series already past its own `until`) are dead series
 * markers, never future spend — skipped entirely.
 */
export function computeRecurringRemaining(
  expenses: Transaction[],
  snapshotISO: string,
  targetMonth: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  const counted = new Set<string>(); // `${seriesId}|${date}` occurrences already accounted for
  for (const t of expenses) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) !== targetMonth) continue;
    if (!isRecurringLikeTransactionV4(t)) continue;
    if (isExpiredTemplate(t)) continue;
    counted.add(`${t.seriesId ?? t.id}|${t.date}`);
    if (t.date <= snapshotISO) continue; // already realized → spentToDate
    out[t.category] = (out[t.category] ?? 0) + ownShare(t);
  }

  const [ty, tm] = targetMonth.split('-').map(Number);
  const monthEnd = `${targetMonth}-${String(daysInMonth(ty, tm - 1)).padStart(2, '0')}`;
  for (const t of expenses) {
    const rule = t.recurring;
    if (!rule || t.type !== 'expense') continue;
    if (isExpiredTemplate(t)) continue;
    const sid = t.seriesId ?? t.id;
    // Occurrences strictly AFTER the template's own date (the template row
    // already represents its own date), fast-forwarded past the snapshot.
    let d = addPeriod(t.date, rule.freq);
    let guard = 500;
    while (d <= snapshotISO && --guard > 0) d = addPeriod(d, rule.freq);
    let cap = 35; // bounds dense daily series within a single month
    while (d <= monthEnd && (!rule.until || d <= rule.until) && --cap > 0) {
      const key = `${sid}|${d}`;
      if (d.slice(0, 7) === targetMonth && !counted.has(key)) {
        counted.add(key);
        out[t.category] = (out[t.category] ?? 0) + ownShare(t);
      }
      d = addPeriod(d, rule.freq);
    }
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
