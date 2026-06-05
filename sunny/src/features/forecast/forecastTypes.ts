/** Per-category end-of-month projection from the V2 multi-signal engine. */
export interface CategoryForecastV2 {
  categoryId: string;
  /** Total spend already recorded this month (actual). */
  actualSoFar: number;
  /** Committed recurring occurrences still due this month. */
  scheduledFuture: number;
  /** Planned (future-dated, non-recurring) entries still in this month. */
  plannedFuture: number;
  /** Amount-curve estimate for remaining variable spend. */
  amountCurveRemaining: number;
  /** Count-curve estimate for remaining variable spend. */
  countCurveRemaining: number;
  /** Blended estimate for remaining variable spend (α·amount + (1-α)·count). */
  predictedVariableRemaining: number;
  /** Full end-of-month projection: actual + scheduled + planned + predicted variable. */
  projected: number;
  /** Signal blend weight α ∈ [0,1] applied to amount curve (vs count curve). */
  blendAlpha: number;
  /** Reliability score [0,1]: how much to trust this projection (low early in month). */
  reliability: number;
  /** Human-readable explanation of the main signal driving this projection. */
  explanation: string;
}

export interface TotalForecastV2 {
  /** Sum of all category projections. */
  projectedExpenses: number;
  /** Expected income (committed + historical). */
  expectedIncome: number;
  /** Expected investments (committed + historical). */
  expectedInvest: number;
  /** savings = expectedIncome − projectedExpenses − expectedInvest */
  savings: number;
  /** Per-category breakdown. */
  categories: CategoryForecastV2[];
  /** Quality of the overall estimate [0,1]. */
  overallReliability: number;
}

/** One historical month used in backtest. */
export interface BacktestMonth {
  monthKey: string;      // YYYY-MM
  actual: number;
  predicted: number;
  error: number;         // predicted - actual
  absError: number;
  /** Relative error |predicted - actual| / actual, or 0 if actual = 0 */
  relError: number;
}

export interface BacktestResult {
  months: BacktestMonth[];
  /** Mean absolute error (€). */
  mae: number;
  /** Median absolute relative error (%). */
  mape: number;
  /** R² coefficient of determination. */
  r2: number;
}
