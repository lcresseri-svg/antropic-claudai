/**
 * Forecast Engine V4 — type definitions.
 *
 * V4 is a planned-aware, seasonal-aware, budget-aware monthly expense forecaster.
 * Its end-of-month projection decomposes each category into deterministic and
 * statistical components:
 *
 *   forecastCategoria =
 *       spentToDate
 *     + plannedManualRemaining
 *     + recurringRemaining
 *     + seasonalDetectedRemaining
 *     + residualStatisticalRemaining
 *     + budgetSignalAdjustment
 *
 * Only `type === "expense"` transactions are forecast — income, investment and
 * transfer are excluded entirely.
 *
 * V4 is fully isolated from V3 at runtime (it imports only erased types and the
 * shared statistical helpers). It is admin-gated; see forecastFeatureGate.ts.
 */
import type { Transaction, CategoryDef } from '../../../types';

export type ConfidenceV4 = 'high' | 'medium' | 'low';

// ── Planned / seasonal building blocks ───────────────────────────────────────

/**
 * An explicit, deterministic planned expense.
 * In Sunny these are derived from future-dated expense transactions, but the
 * type also models recurring/seasonal/budget-sourced planned items so the same
 * pipeline can ingest them.
 */
export interface PlannedExpenseV4 {
  id: string;
  categoryId: string;
  amount: number;
  /** YYYY-MM-DD */
  expectedDate: string;
  confidence: 'certain' | 'likely' | 'optional';
  source: 'manual' | 'recurring' | 'seasonal' | 'budget';
  recurrence?: 'none' | 'monthly' | 'yearly' | 'custom';
}

/** A detected seasonal expense candidate for a target calendar month. */
export interface SeasonalExpenseCandidateV4 {
  categoryId: string;
  /** Amount still expected this month (reduced when partially paid already). */
  expectedAmount: number;
  /**
   * Full historical seasonal amount, before subtracting any partial payment
   * already made this month. Used to match historical occurrences (residual
   * tail anti double-count). Equals expectedAmount when nothing was paid yet.
   */
  expectedAmountFull?: number;
  /** 0-based calendar month the spend recurs in (Jan = 0). */
  expectedMonth: number;
  confidence: ConfidenceV4;
  /** YYYY-MM keys that backed this detection. */
  sourceMonths: string[];
  reason: string;
}

/** Status of a per-month budget snapshot (mirrors budget/monthlyBudget.ts). */
export type BudgetMonthStatusV4 = 'missing' | 'auto_initialized' | 'draft' | 'confirmed';

/**
 * How the budget signal for the TARGET month is being treated:
 *  - historical_reliability   : confirmed budget + empirical reliability (≥3 samples)
 *  - current_month_intent      : confirmed current budget, reliability from fallback
 *  - unconfirmed_current_budget: budget exists but not confirmed → weak signal
 *  - fallback                  : no per-month budget; reliability from fallback map
 */
export type BudgetSourceV4 =
  | 'historical_reliability'
  | 'current_month_intent'
  | 'unconfirmed_current_budget'
  | 'fallback';

export type BudgetReliabilitySourceV4 = 'empirical' | 'fallback';

/**
 * One historical month of budget configuration (needed for reliability calc).
 * Only `confirmed` months feed empirical reliability; the current month may be
 * present but unconfirmed.
 */
export interface BudgetHistoryEntryV4 {
  /** YYYY-MM */
  month: string;
  categoryBudgets: Record<string, number>;
  totalBudget?: number;
  status?: BudgetMonthStatusV4;
  source?: string;
  savingsTarget?: number;
  confirmedAt?: number | string;
  updatedAt?: number | string;
}

// ── Per-category result ───────────────────────────────────────────────────────

export interface ForecastV4CategoryResult {
  categoryId: string;
  categoryLabel: string;

  spentToDate: number;
  forecastBeforeBudget: number;
  totalForecast: number;

  plannedManualRemaining: number;
  recurringRemaining: number;
  seasonalDetectedRemaining: number;
  residualStatisticalRemaining: number;

  budget?: number;
  budgetGap?: number;
  budgetReliability?: number;
  budgetSignalAdjustment?: number;

  /** Status of the target-month budget snapshot for this category's month. */
  budgetStatus?: BudgetMonthStatusV4;
  /** How the budget signal was treated. */
  budgetSource?: BudgetSourceV4;
  /** Whether reliability was empirical or from the fallback map. */
  budgetReliabilitySource?: BudgetReliabilitySourceV4;
  /** Number of confirmed historical budget months used for reliability. */
  budgetReliabilitySampleCount?: number;

  confidence: ConfidenceV4;
  reasons: string[];
}

// ── Diagnostics ────────────────────────────────────────────────────────────────

export interface LargePlannedExpenseV4 {
  categoryId: string;
  categoryLabel: string;
  amount: number;
  expectedDate: string;
  source: PlannedExpenseV4['source'];
}

export interface BudgetSignalImpactV4 {
  categoryId: string;
  categoryLabel: string;
  budget: number;
  forecastBeforeBudget: number;
  gap: number;
  reliability: number;
  adjustment: number;
}

export interface BudgetSignalIgnoredV4 {
  categoryId: string;
  categoryLabel: string;
  reason: string;
}

export interface ForecastV4Diagnostics {
  /** Planned expenses ≥ 300 € still due this month. */
  largePlannedExpenses: LargePlannedExpenseV4[];
  /** Seasonal candidates detected for the target month. */
  seasonalDetected: SeasonalExpenseCandidateV4[];
  /** Categories whose residual was reduced by stale decay. */
  staleCategories: string[];
  /** Budget signal applied (and how much). */
  budgetSignalApplied: BudgetSignalImpactV4[];
  /** Budget signal evaluated but not applied (with reason). */
  budgetSignalIgnored: BudgetSignalIgnoredV4[];
  /**
   * Fraction of the deterministic (planned+recurring+seasonal) remaining spend
   * relative to the full remaining forecast. High = well-planned month.
   */
  plannedCoverageRatio: number;
  /** Status of the target-month budget snapshot. */
  budgetMonthStatus: BudgetMonthStatusV4;
  /** Overall budget signal treatment for the target month. */
  budgetSource: BudgetSourceV4;
  /** Fraction of recent months that have a budget snapshot (for reliability). */
  budgetHistoryCoverageRatio: number;
  /** True when the budget signal can't yet be validated (<3 confirmed months). */
  budgetSignalValidatable: boolean;
  warnings: string[];
}

// ── Top-level result ────────────────────────────────────────────────────────────

export interface ForecastV4Result {
  /** YYYY-MM target month. */
  month: string;
  /** YYYY-MM-DD snapshot date the forecast was computed as-of. */
  snapshotDate: string;

  totalForecast: number;
  spentToDate: number;

  components: {
    spentToDate: number;
    plannedManualRemaining: number;
    recurringRemaining: number;
    seasonalDetectedRemaining: number;
    budgetSignalAdjustment: number;
    residualStatisticalRemaining: number;
  };

  byCategory: Record<string, ForecastV4CategoryResult>;

  diagnostics: ForecastV4Diagnostics;
}

// ── Engine input ────────────────────────────────────────────────────────────────

export interface ForecastV4Input {
  /**
   * Optional gate subject. When provided and NOT admin-enabled, the engine
   * throws (defence-in-depth). Internal callers (backtest/diagnostics) omit it.
   */
  user?: { uid?: string | null; role?: string | null };
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  /** Current month category budgets (expense categoryId → € limit). */
  categoryBudgets?: Record<string, number>;
  /** Historical budgets per month — enables real reliability; falls back when absent. */
  budgetHistory?: BudgetHistoryEntryV4[];
  /**
   * Explicit planned expenses. When omitted, the engine derives them from
   * future-dated, non-recurring expense transactions in the target month.
   */
  plannedExpenses?: PlannedExpenseV4[];
  /**
   * Status of the current/target-month budget when supplied via `categoryBudgets`
   * rather than a budgetHistory entry. Defaults to 'auto_initialized' (treated as
   * unconfirmed → weak signal).
   */
  currentMonthBudgetStatus?: BudgetMonthStatusV4;
  /** When false, the budget signal is computed for diagnostics but not applied. */
  applyBudgetSignal?: boolean;
  /** Reference "now". Defaults to new Date(). Target month = month of `now`. */
  now?: Date;
}

// ── Backtest types ──────────────────────────────────────────────────────────────

export interface ForecastV4Metrics {
  /** Mean absolute error (€). */
  mae: number;
  /** Weighted absolute percentage error (%). */
  wape: number;
  /** Mean signed error (€). Positive = over-prediction. */
  bias: number;
  /** Root mean squared error (€). */
  rmse: number;
  /** R² coefficient of determination. */
  r2: number;
  /** Number of samples included. */
  sampleCount: number;
}

export interface CategoryImpactV4 {
  categoryId: string;
  categoryLabel: string;
  /** Change in absolute error caused by the budget signal (negative = helped). */
  errorDelta: number;
  sampleCount: number;
}

export interface ForecastBacktestV4Result {
  modelName: string;
  mae: number;
  wape: number;
  bias: number;
  rmse: number;
  r2: number;

  bySnapshotDay: Record<number, ForecastV4Metrics>;
  byMonth: Record<string, ForecastV4Metrics>;
  byCategory: Record<string, ForecastV4Metrics>;

  diagnostics: {
    budgetSignalHelped: CategoryImpactV4[];
    budgetSignalHurt: CategoryImpactV4[];
    seasonalDetected: SeasonalExpenseCandidateV4[];
    plannedCoverageRatio: number;
    /** Target months that had a budget snapshot and so used the budget signal. */
    sampleCountBudgetMonths: number;
    /** Target months with no budget snapshot (budget signal disabled). */
    sampleCountWithoutBudget: number;
    /** sampleCountBudgetMonths / total target months. */
    budgetHistoryCoverageRatio: number;
    /** Set when the budget signal can't yet be validated (<3 budget months). */
    warning?: string;
  };
}
