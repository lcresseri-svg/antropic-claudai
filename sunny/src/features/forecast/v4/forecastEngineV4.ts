/**
 * Forecast Engine V4 — planned-aware · seasonal-aware · budget-aware.
 *
 * Admin-only and fully isolated from V3 (no imports from forecastEngineV3 etc.).
 * Per category:
 *
 *   forecastBeforeBudget =
 *       spentToDate
 *     + plannedManualRemaining
 *     + recurringRemaining
 *     + seasonalDetectedRemaining
 *     + residualStatisticalRemaining
 *
 *   totalForecast = forecastBeforeBudget + budgetSignalAdjustment
 *
 * Only expense transactions are forecast; income/investment/transfer excluded.
 */
import { Transaction, CategoryDef, ownShare } from '../../../types';
import { assertForecastV4Access } from '../forecastFeatureGate';
import {
  ForecastV4Input, ForecastV4Result, ForecastV4CategoryResult,
  ForecastV4Diagnostics, SeasonalExpenseCandidateV4, PlannedExpenseV4,
  BudgetHistoryEntryV4, ConfidenceV4,
} from './forecastTypesV4';
import { isExpiredTemplate } from '../../../shared/recurrence';
import {
  computeSpentToDate, computePlannedManualRemaining, computeRecurringRemaining,
  buildPlannedExpensesFromTransactions, deterministicLikeKindV4,
} from './forecastPlannedV4';
import { detectSeasonalExpensesV4 } from './forecastSeasonalityV4';
import { computeResidualStatisticalRemainingV4 } from './forecastResidualV4';
import {
  computeBudgetReliabilityV4, computeBudgetSignalAdjustmentV4,
  ReliabilitySampleV4,
} from './forecastBudgetSignalV4';
import {
  monthKey as monthKeyOf, isoDate, LARGE_EXPENSE_THRESHOLD, median, isFixedCategory,
} from './forecastV4Common';

export const FORECAST_V4_WARNING =
  'Per forecast entro ±5%, pianifica o conferma le spese rilevanti sopra 300 €. ' +
  'Sunny userà budget e stagionalità per stimare le spese non ancora registrate.';

/** YYYY-MM key shifted by `delta` calendar months. */
function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Trailing-median statistical proxy used to build reliability samples: median
 * spend over the 3 CALENDAR months before `beforeKey`, zero-filled for months
 * with no spend (bounded by the category's first activity). Matches the
 * residual estimator, which also counts genuine zero months.
 */
function statisticalProxy(
  monthlyActual: Map<string, number>,
  beforeKey: string,
  firstMonth: string,
): number {
  const priors: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const k = shiftMonthKey(beforeKey, -i);
    if (k < firstMonth) break; // before the category existed — not a genuine zero
    priors.push(monthlyActual.get(k) ?? 0);
  }
  return median(priors);
}

/**
 * Build (budget, statisticalForecast, actual) reliability samples for a category
 * from CONFIRMED historical budget months only (never the target month, never
 * unconfirmed snapshots). Months with NO spend after the category's first
 * activity count as actual = 0 — a budget that didn't materialise at all is the
 * strongest evidence of unreliability and must not be dropped. Returns [] when
 * there's no usable history, so the engine falls back to the per-category
 * default reliability.
 */
function buildReliabilitySamples(
  categoryId: string,
  budgetHistory: BudgetHistoryEntryV4[] | undefined,
  monthlyActual: Map<string, number>,
  targetMonthKey: string,
): ReliabilitySampleV4[] {
  if (!budgetHistory || budgetHistory.length === 0) return [];
  if (monthlyActual.size === 0) return []; // category never had any spend
  let firstMonth = '';
  for (const k of monthlyActual.keys()) {
    if (!firstMonth || k < firstMonth) firstMonth = k;
  }
  const samples: ReliabilitySampleV4[] = [];
  for (const entry of budgetHistory) {
    if (entry.month >= targetMonthKey) continue;        // never the target/future months
    if (entry.status !== 'confirmed') continue;         // only confirmed history counts
    if (entry.month < firstMonth) continue;             // category didn't exist yet
    const budget = entry.categoryBudgets[categoryId];
    if (!budget || budget <= 0) continue;
    samples.push({
      budget,
      statisticalForecast: statisticalProxy(monthlyActual, entry.month, firstMonth),
      actual: monthlyActual.get(entry.month) ?? 0,
    });
  }
  return samples;
}

export function computeForecastV4(input: ForecastV4Input): ForecastV4Result {
  // ── 0. Admin gate (defence-in-depth; UI must also gate) ───────────────────
  assertForecastV4Access(input.user);

  const now = input.now ?? new Date();
  const snapshotISO = isoDate(now);
  const targetMonthKey = monthKeyOf(now);
  const targetMonthIndex = now.getMonth();
  const targetYear = now.getFullYear();
  const snapshotDay = now.getDate();
  const applyBudgetSignal = input.applyBudgetSignal ?? true;

  // ── Budget for the TARGET month ─────────────────────────────────────────────
  // Prefer the per-month snapshot from budgetHistory; only fall back to the
  // legacy `categoryBudgets` for the current month (treated as an unconfirmed
  // intent). Historical/other months never borrow the current budget.
  const budgetHistory = input.budgetHistory ?? [];
  const targetEntry = budgetHistory.find(b => b.month === targetMonthKey);
  const targetCategoryBudgets: Record<string, number> =
    targetEntry?.categoryBudgets ?? input.categoryBudgets ?? {};
  const hasLegacyBudget = Object.keys(input.categoryBudgets ?? {}).length > 0;
  const budgetMonthStatus: ForecastV4Result['diagnostics']['budgetMonthStatus'] =
    targetEntry?.status
    ?? (hasLegacyBudget ? (input.currentMonthBudgetStatus ?? 'auto_initialized') : 'missing');
  const budgetConfirmed = budgetMonthStatus === 'confirmed';

  // Confirmed historical budget months (for empirical-reliability availability).
  const confirmedBudgetMonths = new Set(
    budgetHistory.filter(b => b.month < targetMonthKey && b.status === 'confirmed').map(b => b.month),
  ).size;
  const budgetSignalValidatable = confirmedBudgetMonths >= 3;
  // Coverage over the 12 complete months before the target.
  const coverageWindow: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(targetYear, targetMonthIndex - i, 1);
    coverageWindow.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const coveredMonths = coverageWindow.filter(k => budgetHistory.some(b => b.month === k)).length;
  const budgetHistoryCoverageRatio = Math.round((coveredMonths / coverageWindow.length) * 100) / 100;

  // Only expenses are forecast. Expired recurring templates (a series advanced
  // past its own `until`) are dead-series markers, not spend — never counted.
  const expenses = input.transactions.filter(t => t.type === 'expense' && !isExpiredTemplate(t));
  const labelOf = (id: string) =>
    input.expenseCategories.find(c => c.id === id)?.label ?? id;

  // ── 1. Deterministic components ────────────────────────────────────────────
  const spentToDate = computeSpentToDate(expenses, snapshotISO, targetMonthKey);

  const plannedExpenses: PlannedExpenseV4[] = input.plannedExpenses
    ?? buildPlannedExpensesFromTransactions(expenses, snapshotISO, targetMonthKey);
  const plannedRemaining = computePlannedManualRemaining(plannedExpenses, snapshotISO, targetMonthKey);
  const recurringRemaining = computeRecurringRemaining(expenses, snapshotISO, targetMonthKey);

  // ── 2. Seasonal detection (after planned/recurring so it can avoid them) ───
  const seasonalCandidates = detectSeasonalExpensesV4({
    transactions: expenses,
    targetMonthIndex,
    targetYear,
    targetMonthKey,
    snapshotISO,
    labelOf,
    plannedRemaining,
    recurringRemaining,
    spentToDate,
  });
  const seasonalByCat = new Map<string, SeasonalExpenseCandidateV4>(
    seasonalCandidates.map(c => [c.categoryId, c]),
  );

  // ── 3. Monthly actual totals per category (for reliability samples) ────────
  const monthlyActualByCat = new Map<string, Map<string, number>>();
  for (const t of expenses) {
    const k = t.date.slice(0, 7);
    if (k >= targetMonthKey) continue; // only completed months
    const m = monthlyActualByCat.get(t.category) ?? new Map<string, number>();
    m.set(k, (m.get(k) ?? 0) + ownShare(t));
    monthlyActualByCat.set(t.category, m);
  }

  // ── 4. Per-category forecast ───────────────────────────────────────────────
  const byCategory: Record<string, ForecastV4CategoryResult> = {};
  const staleCategories: string[] = [];
  const diagApplied: ForecastV4Diagnostics['budgetSignalApplied'] = [];
  const diagIgnored: ForecastV4Diagnostics['budgetSignalIgnored'] = [];

  let totalSpent = 0;
  let totalPlanned = 0;
  let totalRecurring = 0;
  let totalSeasonal = 0;
  let totalResidual = 0;
  let totalBudgetAdj = 0;
  let anyEmpiricalReliability = false;

  for (const cat of input.expenseCategories) {
    const categoryId = cat.id;
    const categoryLabel = cat.label;
    const spent = Math.round(spentToDate[categoryId] ?? 0);
    const planned = Math.round(plannedRemaining[categoryId] ?? 0);
    const recurring = Math.round(recurringRemaining[categoryId] ?? 0);
    const seasonalCandidate = seasonalByCat.get(categoryId);
    const seasonal = Math.round(seasonalCandidate?.expectedAmount ?? 0);

    // Anti double-count: exclude deterministic-like txs from the residual tail.
    // Each planned expense replaces at most ONE similar historical tx per month.
    const classifyDetLike = (tx: Transaction) =>
      deterministicLikeKindV4(tx, { plannedExpenses, seasonalCandidate });
    const plannedCountForCategory =
      plannedExpenses.filter(p => p.categoryId === categoryId).length;

    const budget = targetCategoryBudgets[categoryId] ?? 0;
    const residualRes = computeResidualStatisticalRemainingV4({
      categoryId,
      categoryLabel,
      snapshotDay,
      targetMonthIndex,
      targetYear,
      historicalTransactions: expenses,
      isDeterministicLike: (tx: Transaction) => classifyDetLike(tx) !== null,
      classifyDeterministicLike: classifyDetLike,
      maxPlannedLikeExclusionsPerMonth: plannedCountForCategory,
      hasBudget: budget > 0,
      hasPlanned: planned > 0,
      hasRecurring: recurring > 0,
      hasSeasonalHighConfidence: seasonalCandidate?.confidence === 'high',
    });
    if (residualRes.staleDecayApplied) staleCategories.push(categoryId);

    // FIXED / committed categories (loan instalment, subscription, insurance, rent…)
    // have DETERMINISTIC spend — a single committed occurrence per month. When that
    // occurrence is already known this month (spent/planned/recurring/seasonal > 0)
    // the statistical residual must NOT be added on top, otherwise a category whose
    // history looks "variable" (e.g. entered as plain one-off expenses, no series)
    // gets double-counted: planned 300 + residual 300 = 600. With nothing committed
    // yet the residual stays, so a not-yet-paid fixed expense still forecasts from history.
    const fixedCategory = isFixedCategory(categoryLabel);
    const deterministicCommitted = spent + planned + recurring + seasonal;
    const residual = (fixedCategory && deterministicCommitted > 0) ? 0 : Math.round(residualRes.value);

    const forecastBeforeBudget = deterministicCommitted + residual;

    // ── Budget signal ─────────────────────────────────────────────────────
    const relRes = computeBudgetReliabilityV4({
      categoryId,
      categoryLabel,
      samples: buildReliabilitySamples(
        categoryId, budgetHistory, monthlyActualByCat.get(categoryId) ?? new Map(), targetMonthKey,
      ),
    });
    const explainedByDeterministic = planned + recurring + seasonal;
    const signal = computeBudgetSignalAdjustmentV4({
      budget,
      forecastBeforeBudget,
      spentToDate: spent,
      reliability: relRes.reliability,
      explainedByDeterministic,
    });

    // Budget as a FLOOR for fixed categories (never a top-up summed on the already-
    // planned amount); VARIABLE categories keep the reliability-weighted signal.
    let budgetSignalAdjustment: number;
    let dampedUnconfirmed = false;
    if (fixedCategory) {
      budgetSignalAdjustment = (applyBudgetSignal && budget > 0)
        ? Math.max(0, budget - forecastBeforeBudget) // floor to budget, no top-up
        : 0;
    } else {
      // Apply the signal, then damp it when the target budget isn't confirmed:
      // halve for planned-like categories, zero for purely-discretionary ones.
      budgetSignalAdjustment = applyBudgetSignal ? signal.adjustment : 0;
      if (budgetSignalAdjustment > 0 && !budgetConfirmed) {
        const plannedLike = (planned + recurring + seasonal) > 0;
        budgetSignalAdjustment = plannedLike ? Math.round(budgetSignalAdjustment * 0.5) : 0;
        dampedUnconfirmed = true;
      }
    }

    // Per-category budget provenance.
    const budgetReliabilitySource: 'empirical' | 'fallback' = relRes.empirical ? 'empirical' : 'fallback';
    if (budget > 0 && relRes.empirical) anyEmpiricalReliability = true;
    const budgetSourceCat: ForecastV4CategoryResult['budgetSource'] =
      budget <= 0 ? undefined
      : relRes.empirical ? 'historical_reliability'
      : budgetConfirmed ? 'current_month_intent'
      : (targetEntry || hasLegacyBudget) ? 'unconfirmed_current_budget'
      : 'fallback';

    if (budget > 0) {
      if (applyBudgetSignal && budgetSignalAdjustment > 0) {
        diagApplied.push({
          categoryId, categoryLabel, budget,
          forecastBeforeBudget, gap: signal.gap,
          reliability: relRes.reliability, adjustment: budgetSignalAdjustment,
        });
      } else if (signal.gap > 0) {
        const reason = dampedUnconfirmed
          ? 'Budget non confermato: segnale azzerato'
          : signal.reason;
        diagIgnored.push({ categoryId, categoryLabel, reason });
      }
    }

    const totalForecast = forecastBeforeBudget + budgetSignalAdjustment;

    // ── Confidence + reasons ────────────────────────────────────────────────
    const deterministic = spent + planned + recurring + seasonal;
    const denom = totalForecast || 1;
    const deterministicShare = deterministic / denom;
    let confidence: ConfidenceV4;
    if (deterministicShare >= 0.8) confidence = 'high';
    else if (deterministicShare >= 0.5) confidence = 'medium';
    else confidence = 'low';

    const reasons: string[] = [];
    if (planned > 0) reasons.push('Spesa pianificata manuale futura');
    if (recurring > 0) reasons.push('Ricorrente futura già registrata');
    if (seasonal > 0 && seasonalCandidate) reasons.push(seasonalCandidate.reason);
    if (residual > 0) reasons.push('Residuo statistico P60');
    if (residualRes.staleDecayApplied) reasons.push('Categoria stale: residuo ridotto');
    if (budgetSignalAdjustment > 0) {
      reasons.push(fixedCategory
        ? 'Categoria fissa: previsto allineato al budget (programmato)'
        : budgetConfirmed
          ? 'Budget superiore alla previsione statistica'
          : 'Budget (non confermato) superiore alla previsione — segnale ridotto');
    } else if (!fixedCategory && budget > 0 && signal.gap > 0) {
      reasons.push(dampedUnconfirmed ? 'Budget non confermato: segnale azzerato' : signal.reason);
    }

    // Skip categories with no signal at all to keep the result compact.
    if (totalForecast === 0 && spent === 0) continue;

    byCategory[categoryId] = {
      categoryId,
      categoryLabel,
      spentToDate: spent,
      forecastBeforeBudget,
      totalForecast,
      plannedManualRemaining: planned,
      recurringRemaining: recurring,
      seasonalDetectedRemaining: seasonal,
      residualStatisticalRemaining: residual,
      budget: budget > 0 ? budget : undefined,
      budgetGap: budget > 0 ? signal.gap : undefined,
      budgetReliability: budget > 0 ? Math.round(relRes.reliability * 100) / 100 : undefined,
      budgetSignalAdjustment: budget > 0 ? budgetSignalAdjustment : undefined,
      budgetStatus: budget > 0 ? budgetMonthStatus : undefined,
      budgetSource: budgetSourceCat,
      budgetReliabilitySource: budget > 0 ? budgetReliabilitySource : undefined,
      budgetReliabilitySampleCount: budget > 0 ? relRes.usedSamples : undefined,
      confidence,
      reasons,
    };

    totalSpent += spent;
    totalPlanned += planned;
    totalRecurring += recurring;
    totalSeasonal += seasonal;
    totalResidual += residual;
    totalBudgetAdj += budgetSignalAdjustment;
  }

  // ── 5. Diagnostics ──────────────────────────────────────────────────────────
  const largePlannedExpenses = plannedExpenses
    .filter(p => p.amount >= LARGE_EXPENSE_THRESHOLD && p.expectedDate > snapshotISO && p.expectedDate.startsWith(targetMonthKey))
    .map(p => ({
      categoryId: p.categoryId,
      categoryLabel: labelOf(p.categoryId),
      amount: Math.round(p.amount),
      expectedDate: p.expectedDate,
      source: p.source,
    }));

  const deterministicRemaining = totalPlanned + totalRecurring + totalSeasonal;
  const futureRemaining = deterministicRemaining + totalResidual + totalBudgetAdj;
  const plannedCoverageRatio = futureRemaining > 0
    ? Math.round((deterministicRemaining / futureRemaining) * 100) / 100
    : 0;

  const overallBudgetSource: ForecastV4Result['diagnostics']['budgetSource'] =
    anyEmpiricalReliability ? 'historical_reliability'
    : budgetConfirmed ? 'current_month_intent'
    : (targetEntry || hasLegacyBudget) ? 'unconfirmed_current_budget'
    : 'fallback';

  const warnings = [FORECAST_V4_WARNING];
  if (totalBudgetAdj > 0 && !budgetSignalValidatable) {
    warnings.push('Budget signal non ancora validabile: storico budget insufficiente.');
  }
  if (budgetMonthStatus !== 'confirmed' && (targetEntry || hasLegacyBudget)) {
    warnings.push('Budget del mese corrente non confermato: il segnale budget è ridotto.');
  }

  const diagnostics: ForecastV4Diagnostics = {
    largePlannedExpenses,
    seasonalDetected: seasonalCandidates,
    staleCategories,
    budgetSignalApplied: diagApplied,
    budgetSignalIgnored: diagIgnored,
    plannedCoverageRatio,
    budgetMonthStatus,
    budgetSource: overallBudgetSource,
    budgetHistoryCoverageRatio,
    budgetSignalValidatable,
    warnings,
  };

  const totalForecast =
    totalSpent + totalPlanned + totalRecurring + totalSeasonal + totalResidual + totalBudgetAdj;

  return {
    month: targetMonthKey,
    snapshotDate: snapshotISO,
    totalForecast: Math.round(totalForecast),
    spentToDate: Math.round(totalSpent),
    components: {
      spentToDate: Math.round(totalSpent),
      plannedManualRemaining: Math.round(totalPlanned),
      recurringRemaining: Math.round(totalRecurring),
      seasonalDetectedRemaining: Math.round(totalSeasonal),
      budgetSignalAdjustment: Math.round(totalBudgetAdj),
      residualStatisticalRemaining: Math.round(totalResidual),
    },
    byCategory,
    diagnostics,
  };
}
