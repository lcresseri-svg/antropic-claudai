/**
 * Budget-as-signal for Forecast V4.
 *
 * The budget is NOT a substitute for the forecast and NEVER a hard floor
 * (`forecast = max(forecast, budget)` is wrong: for categories like Acquisti the
 * budget is just a ceiling). Instead the budget nudges the forecast toward the
 * user's stated intention, scaled by how reliably that category's budget has
 * historically predicted real spend.
 *
 *   gap        = budget − forecastBeforeBudget
 *   adjustment = gap × reliability        (only when conditions below hold)
 */
import {
  fallbackReliabilityByCategory, median,
} from './forecastV4Common';

// ── Reliability ───────────────────────────────────────────────────────────────

export interface ReliabilitySampleV4 {
  /** Historical budget for the category that month. */
  budget: number;
  /** Historical pure-statistical forecast (no budget influence). */
  statisticalForecast: number;
  /** Historical realised spend. */
  actual: number;
}

export interface BudgetReliabilityInputV4 {
  categoryId: string;
  categoryLabel: string;
  /** Historical samples (built from budgetHistory + backtest). May be empty. */
  samples?: ReliabilitySampleV4[];
  /** Minimum samples needed before empirical reliability overrides the fallback. */
  minSamples?: number;
}

export interface BudgetReliabilityResultV4 {
  reliability: number;
  /** True when computed from data; false when the per-category fallback was used. */
  empirical: boolean;
  usedSamples: number;
}

/**
 * "When the budget was higher than the statistical forecast, what fraction of
 * that gap actually materialised?" — median realisation over recent samples,
 * clamped to [0.15, 0.95]. Falls back to a per-category default when there
 * aren't enough qualifying samples.
 */
export function computeBudgetReliabilityV4(
  input: BudgetReliabilityInputV4,
): BudgetReliabilityResultV4 {
  const minSamples = input.minSamples ?? 3;
  const fallback = fallbackReliabilityByCategory(input.categoryLabel);

  const realizations: number[] = [];
  for (const s of input.samples ?? []) {
    if (s.budget <= 0) continue;
    const gap = s.budget - s.statisticalForecast;
    const threshold = Math.max(80, s.statisticalForecast * 0.25);
    if (gap < threshold) continue; // budget wasn't meaningfully above the forecast
    const missingReal = s.actual - s.statisticalForecast;
    const realization = Math.max(0, Math.min(1, missingReal / gap));
    realizations.push(realization);
  }

  if (realizations.length < minSamples) {
    return { reliability: fallback, empirical: false, usedSamples: realizations.length };
  }

  const rel = Math.max(0.15, Math.min(0.95, median(realizations)));
  return { reliability: rel, empirical: true, usedSamples: realizations.length };
}

// ── Signal adjustment ───────────────────────────────────────────────────────

export interface BudgetSignalInputV4 {
  budget: number;
  forecastBeforeBudget: number;
  spentToDate: number;
  reliability: number;
  /** plannedManualRemaining + recurringRemaining + seasonalDetectedRemaining. */
  explainedByDeterministic: number;
}

export interface BudgetSignalResultV4 {
  adjustment: number;
  gap: number;
  applied: boolean;
  reason: string;
}

/**
 * Computes the budget-signal adjustment, applying it only when the budget is a
 * credible predictive signal:
 *   - budget > 0;
 *   - gap > max(80, forecastBeforeBudget × 0.25);
 *   - spentToDate ≤ budget (otherwise the budget is just a ceiling already blown);
 *   - the gap is NOT already explained (≥75%) by planned/recurring/seasonal.
 */
export function computeBudgetSignalAdjustmentV4(
  input: BudgetSignalInputV4,
): BudgetSignalResultV4 {
  const { budget, forecastBeforeBudget, spentToDate, reliability, explainedByDeterministic } = input;
  const gap = Math.round(budget - forecastBeforeBudget);

  if (!budget || budget <= 0) {
    return { adjustment: 0, gap, applied: false, reason: 'Nessun budget impostato' };
  }
  // A budget already blown by actual spend is clearly just a ceiling, not a
  // predictive target — check this before the gap test (gap would be negative).
  if (spentToDate > budget) {
    return { adjustment: 0, gap, applied: false, reason: 'Budget ignorato: probabilmente limite massimo (speso oltre budget)' };
  }
  const threshold = Math.max(80, forecastBeforeBudget * 0.25);
  if (gap <= threshold) {
    return { adjustment: 0, gap, applied: false, reason: 'Gap budget troppo piccolo' };
  }
  if (explainedByDeterministic >= gap * 0.75) {
    return { adjustment: 0, gap, applied: false, reason: 'Budget ignorato: già spiegato da planned/seasonal' };
  }

  const adjustment = Math.max(0, gap) * reliability;
  return {
    adjustment: Math.round(adjustment),
    gap,
    applied: adjustment > 0,
    reason: 'Budget superiore alla previsione statistica',
  };
}
