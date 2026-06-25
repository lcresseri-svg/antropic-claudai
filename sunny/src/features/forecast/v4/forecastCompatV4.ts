/**
 * Forecast V4 — drop-in compatibility wrappers.
 *
 * These expose V4 behind the SAME signatures and output shapes as the V3
 * adapters (`forecastSavingsV3`, `forecastByCategoryV3`), so production call
 * sites switch engine by changing only the import — no other code changes.
 *
 * Expenses come from the V4 engine (`computeForecastV4`); income & investments
 * from `forecastFlowsV4` (so V4 owns the whole "risparmio previsto" number and
 * V3 is no longer imported in production).
 *
 * The wrappers call the engine WITHOUT a `user`, so the admin gate
 * (`assertForecastV4Access`) is a no-op: V4 is the default engine for everyone.
 */
import { Transaction, CategoryDef } from '../../../types';
import type { MonthForecastShape } from '../forecastEngine';
import { computeForecastV4 } from './forecastEngineV4';
import { forecastFlowV4 } from './forecastFlowsV4';
import type { BudgetHistoryEntryV4, BudgetMonthStatusV4 } from './forecastTypesV4';

/** Optional budget context that sharpens V4's budget-aware signal. */
export interface ForecastV4BudgetContext {
  categoryBudgets?: Record<string, number>;
  budgetHistory?: BudgetHistoryEntryV4[];
  currentMonthBudgetStatus?: BudgetMonthStatusV4;
}

/**
 * Drop-in replacement for `forecastSavingsV3`: same input object, same
 * `MonthForecastShape` output. Expenses via V4; income/investments via V4 flows.
 */
export function forecastSavingsV4(input: {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  avgIncome?: number;
  avgInvest?: number;
  upcomingIncome?: number;
  upcomingInvest?: number;
  now?: Date;
} & ForecastV4BudgetContext): MonthForecastShape {
  const now = input.now ?? new Date();
  const r = computeForecastV4({
    transactions: input.transactions,
    expenseCategories: input.expenseCategories,
    categoryBudgets: input.categoryBudgets,
    budgetHistory: input.budgetHistory,
    currentMonthBudgetStatus: input.currentMonthBudgetStatus,
    now,
  });
  const projectedExpenses = Math.round(r.totalForecast);
  const expectedIncome = forecastFlowV4({
    transactions: input.transactions, type: 'income',
    realizedThisMonth: input.monthlyIncome, upcoming: input.upcomingIncome,
    avg: input.avgIncome, now,
  });
  const expectedInvest = forecastFlowV4({
    transactions: input.transactions, type: 'investment',
    realizedThisMonth: input.monthlyInvestments, upcoming: input.upcomingInvest,
    avg: input.avgInvest, now,
  });
  const savings = expectedIncome - projectedExpenses - expectedInvest;
  return { expectedIncome, projectedExpenses, expectedInvest, savings };
}

/**
 * Drop-in replacement for `forecastByCategoryV3`: end-of-month projected spend
 * per expense category (categories with no projection are omitted, as before).
 */
export function forecastByCategoryV4(
  transactions: Transaction[],
  expenseCategories: CategoryDef[],
  now: Date = new Date(),
  budget?: ForecastV4BudgetContext,
): Record<string, number> {
  const r = computeForecastV4({
    transactions,
    expenseCategories,
    categoryBudgets: budget?.categoryBudgets,
    budgetHistory: budget?.budgetHistory,
    currentMonthBudgetStatus: budget?.currentMonthBudgetStatus,
    now,
  });
  const out: Record<string, number> = {};
  for (const [catId, c] of Object.entries(r.byCategory)) {
    const v = Math.round(c.totalForecast);
    if (v > 0) out[catId] = v;
  }
  return out;
}
