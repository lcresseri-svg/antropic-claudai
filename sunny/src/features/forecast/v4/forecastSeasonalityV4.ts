/**
 * Seasonal expense detection for Forecast V4.
 *
 * Goal: recognise expenses that recur in the SAME calendar month across years
 * (e.g. insurance every February and August at ~870 €) so they can be predicted
 * deterministically instead of being smeared into the statistical residual.
 *
 * Rules (per category, for the target calendar month):
 *   1. Look at the same calendar month in the previous ~2 years.
 *   2. An "occurrence" is a historical (category, month) whose large-transaction
 *      total (txs ≥ 300 €) is ≥ 300 €. Using only large txs prevents everyday
 *      categories (groceries etc.) from being mistaken for seasonal spend.
 *   3. ≥ 2 similar occurrences → expectedAmount = median, confidence "high".
 *   4. Exactly 1 occurrence AND the category looks seasonal/periodic →
 *      expectedAmount = that amount, confidence "medium".
 *   5. Never emit a candidate when it's already covered by a similar planned or
 *      recurring remaining, or when a similar large spend already happened this
 *      month.
 */
import { Transaction, ownShare } from '../../../types';
import { SeasonalExpenseCandidateV4 } from './forecastTypesV4';
import {
  amountsSimilar, median, looksSeasonalByLabel, SEASONAL_MIN_AMOUNT,
} from './forecastV4Common';

export interface DetectSeasonalInput {
  /** Expense transactions (full history). */
  transactions: Transaction[];
  /** 0-based calendar month being forecast. */
  targetMonthIndex: number;
  /** Calendar year being forecast. */
  targetYear: number;
  /** YYYY-MM of the target month (used to skip the current month's actuals). */
  targetMonthKey: string;
  /** ISO snapshot date — spend on/before this is already known. */
  snapshotISO: string;
  /** category label resolver for the periodic-by-label fallback. */
  labelOf: (categoryId: string) => string;
  /** plannedManualRemaining per category — used to avoid double counting. */
  plannedRemaining: Record<string, number>;
  /** recurringRemaining per category — used to avoid double counting. */
  recurringRemaining: Record<string, number>;
  /** spentToDate per category — a similar amount already spent → skip. */
  spentToDate: Record<string, number>;
  /** How many years back to look. Default 2. */
  lookbackYears?: number;
  /** Optional explicit set of category ids known to be periodic/seasonal. */
  periodicCategoryIds?: Set<string>;
}

/**
 * Sum of large (≥ 300 €) expense txs for a category in a YYYY-MM month,
 * optionally bounded to dates on/before `onOrBeforeISO`.
 */
function largeTotalForMonth(
  transactions: Transaction[],
  categoryId: string,
  monthKey: string,
  onOrBeforeISO?: string,
): number {
  let sum = 0;
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.category !== categoryId) continue;
    if (t.date.slice(0, 7) !== monthKey) continue;
    if (onOrBeforeISO && t.date > onOrBeforeISO) continue;
    const share = ownShare(t);
    if (share >= SEASONAL_MIN_AMOUNT) sum += share;
  }
  return sum;
}

export function detectSeasonalExpensesV4(
  input: DetectSeasonalInput,
): SeasonalExpenseCandidateV4[] {
  const {
    transactions, targetMonthIndex, targetYear, targetMonthKey, snapshotISO,
    labelOf, plannedRemaining, recurringRemaining, spentToDate,
  } = input;
  const lookbackYears = input.lookbackYears ?? 2;

  // Distinct expense categories that have ANY history.
  const categoryIds = new Set<string>();
  for (const t of transactions) {
    if (t.type === 'expense') categoryIds.add(t.category);
  }

  const candidates: SeasonalExpenseCandidateV4[] = [];

  for (const categoryId of categoryIds) {
    // Same calendar month, previous `lookbackYears` years.
    const occurrences: { amount: number; monthKey: string }[] = [];
    for (let y = 1; y <= lookbackYears; y++) {
      const year = targetYear - y;
      const key = `${year}-${String(targetMonthIndex + 1).padStart(2, '0')}`;
      const amt = largeTotalForMonth(transactions, categoryId, key);
      if (amt >= SEASONAL_MIN_AMOUNT) occurrences.push({ amount: amt, monthKey: key });
    }
    if (occurrences.length === 0) continue;

    let expectedAmount = 0;
    let confidence: SeasonalExpenseCandidateV4['confidence'] = 'low';
    let reason = '';

    if (occurrences.length >= 2) {
      // Require the occurrences to be mutually similar (a stable seasonal amount).
      const amounts = occurrences.map(o => o.amount);
      const med = median(amounts);
      const allSimilar = amounts.every(a => amountsSimilar(a, med));
      if (!allSimilar) continue;
      expectedAmount = Math.round(med);
      confidence = 'high';
      reason = `Stagionalità rilevata: ${labelOf(categoryId)} ricorre in questo mese (${occurrences.map(o => o.monthKey).join(', ')}).`;
    } else {
      // Single occurrence: only accept if the category looks periodic/seasonal.
      const isPeriodic =
        input.periodicCategoryIds?.has(categoryId) ||
        looksSeasonalByLabel(labelOf(categoryId));
      if (!isPeriodic) continue;
      expectedAmount = Math.round(occurrences[0].amount);
      confidence = 'medium';
      reason = `Stagionalità probabile: ${labelOf(categoryId)} (1 occorrenza in ${occurrences[0].monthKey}, categoria periodica).`;
    }

    // ── Anti double-count guards ───────────────────────────────────────────
    // A similar large amount already spent this month → it already happened.
    const spent = spentToDate[categoryId] ?? 0;
    if (spent > 0 && (amountsSimilar(spent, expectedAmount) || spent >= expectedAmount)) continue;
    // PARTIAL payment: part of the seasonal spend already happened this month
    // (e.g. 400 of an expected ~870 insurance paid in tranches). Only what's
    // still missing is forecast; the FULL amount is kept for tail matching.
    const largeSpent = Math.round(
      largeTotalForMonth(transactions, categoryId, targetMonthKey, snapshotISO),
    );
    const remaining = expectedAmount - largeSpent;
    if (largeSpent > 0 && (remaining <= 0 || amountsSimilar(largeSpent, expectedAmount))) continue;
    // Already covered by a similar planned/recurring remaining → skip.
    // Compared against BOTH the full amount (user planned the whole thing) and
    // the remaining one (user planned just the missing tranche).
    const planned = plannedRemaining[categoryId] ?? 0;
    const recurring = recurringRemaining[categoryId] ?? 0;
    if (planned > 0 && (amountsSimilar(planned, expectedAmount) || amountsSimilar(planned, remaining))) continue;
    if (recurring > 0 && (amountsSimilar(recurring, expectedAmount) || amountsSimilar(recurring, remaining))) continue;

    candidates.push({
      categoryId,
      expectedAmount: remaining,
      expectedAmountFull: expectedAmount,
      expectedMonth: targetMonthIndex,
      confidence,
      sourceMonths: occurrences.map(o => o.monthKey),
      reason: largeSpent > 0
        ? `${reason} Già pagato in parte questo mese (€${largeSpent}): previsto il residuo.`
        : reason,
    });
  }

  return candidates;
}
