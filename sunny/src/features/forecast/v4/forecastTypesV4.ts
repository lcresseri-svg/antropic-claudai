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
  expectedAmount: number;
  /** 0-based calendar month the spend recurs in (Jan = 0). */
  expectedMonth: number;
  confidence: ConfidenceV4;
  /** YYYY-MM keys that backed this detection. */
  sourceMonths: string[];
  reason: string;
}

/** One historical month of budget configuration (needed for reliability calc). */
export interface BudgetHistoryEntryV4 {
  /** YYYY-MM */
  month: string;
  categoryBudgets: Record<string, number>;
  totalBudget?: number;
  updatedAt?: string;
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
  };
}
