/**
 * ForecastService (admin-only, flag `forecast_unified`).
 *
 * One OUTPUT CONTRACT over interchangeable engines: the existing V3 engine
 * (production baseline, untouched) and the experimental V4 engine are wrapped
 * by adapters that normalize their results into a single explainable shape.
 * The old engines stay available as baselines until the unified path is
 * validated by backtest (see forecastBaselines.ts).
 *
 * Guarantees encoded in the contract:
 *  - no double counting: breakdown components sum to the central estimate
 *    (any engine-specific remainder is exposed as `residual`, never hidden);
 *  - transfers are excluded by construction (both engines only look at
 *    expense categories);
 *  - investments are separate (never part of projected expenses);
 *  - the budget signal is a visible component (V4) or 0 (V3), never an
 *    invisible retroactive tweak;
 *  - every number is explainable: drivers + warnings + data quality travel
 *    with the estimate.
 */
import { Transaction, CategoryDef } from '../../../types';
import { computeForecastV3, medianMonthlyFlowV3 } from '../forecastEngineV3';
import { computeForecastV4 } from '../v4/forecastEngineV4';
import type { TotalForecastV3 } from '../forecastTypesV3';
import type { ForecastV4Input, ForecastV4Result } from '../v4/forecastTypesV4';

export const UNIFIED_FORECAST_VERSION = 1;

export type ForecastEngineName = 'v3' | 'v4';
export type ForecastConfidence = 'low' | 'medium' | 'high';

export interface UnifiedForecastBreakdown {
  /** Already recorded this month (speso finora). */
  recorded: number;
  /** Future one-off planned entries (programmato). */
  scheduled: number;
  /** Future recurring occurrences (ricorrente). */
  recurring: number;
  /** Statistical variable estimate (variabile). */
  variable: number;
  /** Seasonal / exceptional component (eccezionale). */
  exceptional: number;
  /** Budget-signal adjustment (segnale budget; 0 when not applied). */
  budgetSignal: number;
  /** central − Σ(previous components): engine remainder, always visible. */
  residual: number;
}

export interface UnifiedForecastDriver {
  categoryId: string;
  label: string;
  projected: number;
}

export interface UnifiedForecast {
  version: number;
  engine: ForecastEngineName;
  /** YYYY-MM the estimate refers to. */
  targetMonth: string;
  /** ISO date-time the estimate was generated at. */
  generatedAt: string;
  /** Central end-of-month expense estimate (€). */
  central: number;
  /** Confidence interval around the central estimate. */
  low: number;
  high: number;
  confidence: ForecastConfidence;
  dataQuality: {
    monthsOfHistory: number;
    /** Categories the engine could not classify. */
    unknownCategories: number;
    notes: string[];
  };
  breakdown: UnifiedForecastBreakdown;
  /** Top categories by projected spend. */
  drivers: UnifiedForecastDriver[];
  warnings: string[];
}

export interface ForecastServiceInput {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  /** V4 only — budget signal inputs (current month never retroactive). */
  categoryBudgets?: Record<string, number>;
  budgetHistory?: ForecastV4Input['budgetHistory'];
  currentMonthBudgetStatus?: ForecastV4Input['currentMonthBudgetStatus'];
  now?: Date;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Distinct YYYY-MM keys with at least one realized expense before `now`. */
function monthsOfHistory(transactions: Transaction[], nowISO: string): number {
  const months = new Set<string>();
  for (const t of transactions) {
    if (t.projected || t.type !== 'expense' || t.date > nowISO) continue;
    months.add(t.date.slice(0, 7));
  }
  return months.size;
}

function finishBreakdown(central: number, parts: Omit<UnifiedForecastBreakdown, 'residual'>): UnifiedForecastBreakdown {
  const sum = parts.recorded + parts.scheduled + parts.recurring
    + parts.variable + parts.exceptional + parts.budgetSignal;
  return { ...parts, residual: r2(central - sum) };
}

// ── V3 adapter ────────────────────────────────────────────────────────────────

export function unifyFromV3(
  v3: TotalForecastV3,
  ctx: { transactions: Transaction[]; getLabel: (id: string) => string; now: Date },
): UnifiedForecast {
  const nowISO = ctx.now.toISOString().slice(0, 10);
  let recorded = 0, scheduled = 0, recurring = 0, variable = 0, low = 0, high = 0;
  let unknown = 0;
  for (const c of v3.categories) {
    recorded += c.actualSoFar;
    scheduled += c.plannedFuture;
    recurring += c.scheduledFuture;
    variable += c.predictedVariableRemaining;
    low += c.projectedLow;
    high += c.projectedHigh;
    if (c.behavior === 'unknown') unknown++;
  }
  const central = r2(v3.projectedExpenses);
  const confidence: ForecastConfidence =
    v3.overallReliability >= 0.7 ? 'high' : v3.overallReliability >= 0.4 ? 'medium' : 'low';

  const warnings: string[] = [];
  if (v3.biasCorrectionApplied) warnings.push(`Correzione bias applicata (fattore ${v3.biasFactor.toFixed(2)}).`);
  if (unknown > 0) warnings.push(`${unknown} categorie senza storico sufficiente.`);

  return {
    version: UNIFIED_FORECAST_VERSION,
    engine: 'v3',
    targetMonth: nowISO.slice(0, 7),
    generatedAt: ctx.now.toISOString(),
    central,
    low: r2(low),
    high: r2(high),
    confidence,
    dataQuality: {
      monthsOfHistory: monthsOfHistory(ctx.transactions, nowISO),
      unknownCategories: unknown,
      notes: ['Il motore V3 non separa la componente stagionale (inclusa nel variabile).'],
    },
    breakdown: finishBreakdown(central, {
      recorded: r2(recorded), scheduled: r2(scheduled), recurring: r2(recurring),
      variable: r2(variable), exceptional: 0, budgetSignal: 0,
    }),
    drivers: [...v3.categories]
      .sort((a, b) => b.projected - a.projected)
      .slice(0, 5)
      .map(c => ({ categoryId: c.categoryId, label: ctx.getLabel(c.categoryId), projected: r2(c.projected) })),
    warnings,
  };
}

// ── V4 adapter ────────────────────────────────────────────────────────────────

export function unifyFromV4(
  v4: ForecastV4Result,
  ctx: { transactions: Transaction[]; now: Date },
): UnifiedForecast {
  const nowISO = ctx.now.toISOString().slice(0, 10);
  const central = r2(v4.totalForecast);
  const cats = Object.values(v4.byCategory);
  const lowCount = cats.filter(c => c.confidence === 'low').length;
  const confidence: ForecastConfidence =
    cats.length === 0 ? 'low'
      : lowCount / cats.length <= 0.2 ? 'high'
      : lowCount / cats.length <= 0.5 ? 'medium' : 'low';

  return {
    version: UNIFIED_FORECAST_VERSION,
    engine: 'v4',
    targetMonth: v4.month,
    generatedAt: ctx.now.toISOString(),
    central,
    // V4 does not emit an interval yet: the central estimate is reported as a
    // degenerate interval instead of inventing spread.
    low: central,
    high: central,
    confidence,
    dataQuality: {
      monthsOfHistory: monthsOfHistory(ctx.transactions, nowISO),
      unknownCategories: 0,
      notes: [
        `Copertura pianificata: ${(v4.diagnostics.plannedCoverageRatio * 100).toFixed(0)}%.`,
        `Budget mese: ${v4.diagnostics.budgetMonthStatus} (${v4.diagnostics.budgetSource}).`,
      ],
    },
    breakdown: finishBreakdown(central, {
      recorded: r2(v4.components.spentToDate),
      scheduled: r2(v4.components.plannedManualRemaining),
      recurring: r2(v4.components.recurringRemaining),
      variable: r2(v4.components.residualStatisticalRemaining),
      exceptional: r2(v4.components.seasonalDetectedRemaining),
      budgetSignal: r2(v4.components.budgetSignalAdjustment),
    }),
    drivers: [...cats]
      .sort((a, b) => b.totalForecast - a.totalForecast)
      .slice(0, 5)
      .map(c => ({ categoryId: c.categoryId, label: c.categoryLabel, projected: r2(c.totalForecast) })),
    warnings: [...v4.diagnostics.warnings],
  };
}

// ── Service entry point ───────────────────────────────────────────────────────

/**
 * Compute the unified forecast with the requested engine. The caller (UI)
 * remains responsible for the feature gate; V4 additionally self-guards.
 */
export function computeUnifiedForecast(
  engine: ForecastEngineName,
  input: ForecastServiceInput,
): UnifiedForecast {
  const now = input.now ?? new Date();
  const getLabel = (id: string) => input.expenseCategories.find(c => c.id === id)?.label ?? id;

  if (engine === 'v4') {
    const v4 = computeForecastV4({
      transactions: input.transactions,
      expenseCategories: input.expenseCategories,
      categoryBudgets: input.categoryBudgets,
      budgetHistory: input.budgetHistory,
      currentMonthBudgetStatus: input.currentMonthBudgetStatus,
      now,
    });
    return unifyFromV4(v4, { transactions: input.transactions, now });
  }

  const v3 = computeForecastV3({
    transactions: input.transactions,
    expenseCategories: input.expenseCategories,
    monthlyIncome: input.monthlyIncome,
    monthlyInvestments: input.monthlyInvestments,
    avgIncome: medianMonthlyFlowV3(input.transactions, 'income', now),
    avgInvest: medianMonthlyFlowV3(input.transactions, 'investment', now),
    biasFactor: 1.0,
    now,
  });
  return unifyFromV3(v3, { transactions: input.transactions, getLabel, now });
}
