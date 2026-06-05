/** Per-category end-of-month projection from the V2 multi-signal engine. */
export interface CategoryForecastV2 {
  categoryId: string;
  /** Total spend already recorded this month (actual — all buckets combined). */
  actualSoFar: number;
  /** Committed recurring occurrences still due this month. */
  scheduledFuture: number;
  /** Planned (future-dated) entries still in this month (normal + one-off combined). */
  plannedFuture: number;
  /** Amount-curve estimate for remaining variable spend (for reference). */
  amountCurveRemaining: number;
  /** Count-curve estimate for remaining variable spend (for reference). */
  countCurveRemaining: number;
  /** Predicted remaining variable spend after subtracting actual and planned-normal. */
  predictedVariableRemaining: number;
  /** Full end-of-month projection. */
  projected: number;
  /** Signal blend weight α ∈ [0,1] applied to amount curve (vs count curve). */
  blendAlpha: number;
  /** Reliability score [0,1]: how much to trust this projection. */
  reliability: number;
  /** Human-readable explanation of the main signal driving this projection. */
  explanation: string;
  /** Detailed breakdown of the projected total by component. */
  composition: ForecastComposition;
  /** Count of current-month transactions per treatment bucket. */
  treatmentBreakdown: TreatmentBreakdown;
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

// ── Classification types ──────────────────────────────────────────────────────

/**
 * How a transaction should be treated by the forecast engine.
 * Computed on-the-fly via inferForecastTreatment() — never stored on Transaction.
 */
export type ForecastTreatment =
  | 'variable_normal'      // normal discretionary spend; drives amount/count curves
  | 'scheduled_recurring'  // recurring / series — predicted as scheduled, not as variable
  | 'planned_normal'       // matches a normal budget item; reduces predictedVariableRemaining
  | 'planned_one_off'      // matches a one-off budget item; added on top of variable baseline
  | 'one_off_extra'        // auto-detected or user-confirmed extra; excluded from baseline
  | 'transfer_excluded';   // transfer between accounts; excluded entirely

/** A user-confirmable or auto-detected rule that overrides treatment for matching transactions. */
export interface ForecastRule {
  id: string;
  merchantPattern?: string;
  categoryId?: string;
  amountRange?: { min: number; max: number };
  treatment: ForecastTreatment;
  recurrencePattern?: 'weekly' | 'monthly' | 'annual' | 'seasonal' | 'none';
  createdAt: string;
  source: 'auto_detected' | 'user_confirmed' | 'budget_confirmed';
}

/**
 * A budget-planned item for a specific month.
 * Optional; when present, matching transactions are classified as planned_normal
 * or planned_one_off instead of variable_normal.
 * Stored as optional field in budget (plannedItems?: PlannedBudgetItem[]).
 */
export interface PlannedBudgetItem {
  id: string;
  month: string;  // YYYY-MM
  categoryId: string;
  label: string;
  expectedAmount: number;
  merchantPattern?: string;
  expectedDate?: string;
  expectedDateRange?: { from: string; to: string };
  kind: 'normal' | 'one_off';
  confirmed?: boolean;
  matchedTransactionId?: string;
}

/** Projected total split by component — used for debug and UI transparency. */
export interface ForecastComposition {
  actualVariableNormalSoFar: number;
  actualScheduledSoFar: number;
  actualOneOffSoFar: number;
  scheduledFuture: number;
  plannedNormalFuture: number;
  plannedOneOffFuture: number;
  predictedVariableRemaining: number;
}

/** Count of current-month transactions classified into each treatment bucket. */
export interface TreatmentBreakdown {
  variableNormal: number;
  scheduledRecurring: number;
  plannedNormal: number;
  plannedOneOff: number;
  oneOffExtra: number;
  transferExcluded: number;
}

