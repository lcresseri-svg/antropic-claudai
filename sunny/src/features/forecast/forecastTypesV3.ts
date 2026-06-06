/**
 * Forecast Engine V3 — type definitions.
 *
 * V3 improves on V2 by:
 *   - Replacing the mode enum with a richer `CategoryBehavior` type
 *   - Adding stale detection and recurring_bundle (anti double-count)
 *   - Confidence intervals per category
 *   - Bias correction from rolling multi-snapshot backtest
 */
import type { ForecastComposition, TreatmentBreakdown } from './forecastTypes';

// ── Behavior classification ───────────────────────────────────────────────────

/**
 * How a category behaves historically.
 *
 * Priority order used by the V3 engine:
 *   recurring → recurring_bundle → fixed_monthly → periodic_fixed →
 *   hybrid → variable_frequent → variable_sparse → volatile_mixed →
 *   stale → unknown
 */
export type CategoryBehavior =
  | 'recurring'           // explicit seriesId/recurring flag → deterministic
  | 'recurring_bundle'    // auto-detected recurring merchants, no seriesId (anti-double-count)
  | 'fixed_monthly'       // stable amount, ≥ 3/5 recent months active (relaxed from V2's 4/6)
  | 'periodic_fixed'      // regular non-monthly cadence: quarterly / semi-annual / annual
  | 'hybrid'              // explicit recurring + significant variable component
  | 'variable_frequent'   // > 3 transactions/month on average
  | 'variable_sparse'     // ≤ 3 transactions/month on average
  | 'volatile_mixed'      // high variability (CV > 0.50), low confidence
  | 'stale'               // was active but 0 activity in last 2+ months with no budget/plan
  | 'unknown';            // < 3 months of history

export type PeriodicInterval = 'quarterly' | 'semi_annual' | 'annual' | 'irregular';

export interface CategoryBehaviorResult {
  behavior: CategoryBehavior;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
  /** For fixed_monthly / recurring / recurring_bundle: the anchor amount. */
  expectedAmount?: number;
  /** For periodic_fixed: detected cadence. */
  interval?: PeriodicInterval;
  /** For periodic_fixed: median gap in months. */
  intervalMonths?: number;
  /** For periodic_fixed: the next calendar month (0-based) where activity is expected. */
  nextExpectedCalendarMonth?: number;
  /** For periodic_fixed / recurring_bundle: calendar months with historical activity (0-based). */
  activeMonths?: number[];
  /** For hybrid: the stable recurring part in €. */
  fixedAmount?: number;
  /** For hybrid: the statistical variable part in €. */
  variableAmount?: number;
  /** True if the category appears to have stopped. */
  isStale?: boolean;
  /** Last YYYY-MM key with activity. */
  lastActiveKey?: string;
}

// ── Per-category V3 forecast ─────────────────────────────────────────────────

export interface CategoryForecastV3 {
  categoryId: string;
  /** V3 detected behavior. */
  behavior: CategoryBehavior;
  /** Full behavior detection result. */
  behaviorResult: CategoryBehaviorResult;
  /** Total spend already recorded this month. */
  actualSoFar: number;
  /** Committed recurring occurrences still due this month. */
  scheduledFuture: number;
  /** Planned entries still in this month. */
  plannedFuture: number;
  /** Amount-curve estimate for remaining variable spend (reference only). */
  amountCurveRemaining: number;
  /** Count-curve estimate for remaining variable spend (reference only). */
  countCurveRemaining: number;
  /** Predicted remaining variable spend after subtracting actuals. */
  predictedVariableRemaining: number;
  /** Full end-of-month projection (bias-corrected if biasFactor applied). */
  projected: number;
  /** Projection before bias correction. */
  projectedRaw: number;
  /** Bias correction factor applied (1.0 = no correction). */
  biasCorrection: number;
  /** Lower bound of confidence interval. */
  projectedLow: number;
  /** Upper bound of confidence interval. */
  projectedHigh: number;
  /** Signal blend weight α ∈ [0,1] (amount curve fraction). */
  blendAlpha: number;
  /** Reliability score [0,1]. */
  reliability: number;
  /** Human-readable projection explanation. */
  explanation: string;
  /** Detailed composition breakdown. */
  composition: ForecastComposition;
  /** Current-month transaction classification counts. */
  treatmentBreakdown: TreatmentBreakdown;
  // ── Debug / signal tracing fields ─────────────────────────────────────────
  /** Deterministic component: actuals + scheduled future + plans (no statistical estimate). */
  deterministicComponent: number;
  /** Statistical variable estimate before bias correction. */
  variableBeforeBias: number;
  /** Historical tail median for remaining variable spend (€). */
  tailMedian: number;
  /** Historical tail P75 used as cap (€). */
  tailP75: number;
  /** Number of historical months used for tail distribution. */
  tailSamples: number;
  /** Time-adjusted expected remaining transactions this month. */
  expectedRemainingTx: number;
  /** Pace remaining signal fed to the 3-signal blend (€). */
  paceRemainingSignal: number;
  /** Transaction completion factor [0,1]. Near 0 = most expected tx already done. */
  txCompletionFactor: number;
}

// ── Total V3 forecast ────────────────────────────────────────────────────────

export interface TotalForecastV3 {
  projectedExpenses: number;
  expectedIncome: number;
  expectedInvest: number;
  savings: number;
  categories: CategoryForecastV3[];
  overallReliability: number;
  /** True if projections include bias correction from backtest. */
  biasCorrectionApplied: boolean;
  /** Bias factor used (1.0 if no correction applied). */
  biasFactor: number;
}

// ── V3 Backtest ───────────────────────────────────────────────────────────────

/**
 * One forecast snapshot: pretend we're at `snapshotDay` of a closed month.
 *
 * Component decomposition (correct, non-circular):
 *   error = deterministicFutureError + variableError
 *   where:
 *     deterministicFutureError = forecastDeterministicFuture − actualDeterministicAfterD
 *     variableError            = predictedVariable           − actualVariableAfterD
 *
 * "AfterD" means transactions that occurred AFTER the snapshot date (in the same month).
 * These are what the engine has to predict — transactions before the snapshot are already
 * in actualSoFar and cancel out of the error formula.
 */
export interface BacktestSnapshotV3 {
  monthKey: string;
  snapshotDay: number;
  /** Full-month actual total expenses (€). */
  actual: number;
  /** Engine prediction at snapshot day (€). */
  predicted: number;
  /** predicted − actual (positive = over-prediction). */
  error: number;
  absError: number;
  relError: number;
  // ── Component breakdown ────────────────────────────────────────────────────
  /** Engine's estimated variable tail: sum(c.predictedVariableRemaining). */
  predictedVariable: number;
  /** Engine's deterministic future estimate: sum(c.scheduledFuture + c.plannedFuture). */
  forecastDeterministicFuture: number;
  /** Scheduled/recurring expense transactions that actually occurred AFTER snapshot date. */
  actualDeterministicAfterD: number;
  /** Variable (non-recurring) expense transactions that actually occurred AFTER snapshot date. */
  actualVariableAfterD: number;
  /** predictedVariable − actualVariableAfterD. Positive = engine over-estimated variable tail. */
  variableError: number;
  /** forecastDeterministicFuture − actualDeterministicAfterD. Positive = engine over-estimated scheduled future. */
  deterministicFutureError: number;
  /** How much scheduled/recurring arrived after snapshot but wasn't in forecastDeterministicFuture.
   *  = max(0, actualDeterministicAfterD − forecastDeterministicFuture). */
  missedDeterministic: number;
}

export interface BacktestComponentMetrics {
  /** Mean absolute error (€). */
  mae: number;
  /** Median absolute error (€). */
  medAE: number;
  /** Mean signed error (€). Positive = over-predicts. */
  bias: number;
  /**
   * Weighted absolute percentage error (%).
   * Only meaningful when wapeReliable = true (denominator large enough).
   */
  wape: number;
  /** False if the denominator (total actual) was too small (<€50 total) to compute a reliable WAPE. */
  wapeReliable: boolean;
  /** Number of snapshots included in these metrics. */
  sampleCount: number;
}

export interface BacktestResultV3 {
  snapshots: BacktestSnapshotV3[];
  /** Mean absolute error across all snapshots (€). */
  mae: number;
  /** Median absolute error (€). */
  medAE: number;
  /** Weighted absolute percentage error: Σ|error| / Σactual. */
  wape: number;
  /** Mean signed error (€). Positive = engine over-predicts. */
  bias: number;
  /** Bias correction factor = mean(actualVariableAfterD)/mean(predictedVariable), clamped [0.75, 1.25]. */
  biasFactor: number;
  /** R² coefficient of determination. */
  r2: number;
  /** Variable tail component: predictedVariable vs actualVariableAfterD. */
  variableTail: BacktestComponentMetrics;
  /** Deterministic future component: forecastDeterministicFuture vs actualDeterministicAfterD. */
  deterministic: BacktestComponentMetrics;
  /**
   * Mean amount of deterministic spend that arrived after snapshot but wasn't predicted (€).
   * High value = engine consistently misses scheduled/periodic items.
   */
  missedDeterministicMean: number;
  /** Breakdown by snapshot day-of-month. */
  byDay: Array<{
    day: number; mae: number; bias: number; count: number;
    variableMae: number; variableBias: number;
  }>;
}
