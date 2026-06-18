/**
 * Diagnostics helpers for Forecast V4.
 *
 * Pure, serialisable helpers used by the admin diagnostics panel and by any
 * JSON export: V4 ↔ V3 comparison, overall confidence, component weights, and a
 * combined report object. No React, no Firebase — easy to unit-test.
 */
import {
  ForecastV4Result, ForecastBacktestV4Result, ConfidenceV4,
} from './forecastTypesV4';
import { FORECAST_V4_WARNING } from './forecastEngineV4';

export interface ForecastV4ComparisonV3 {
  v4Total: number;
  v3Total: number;
  /** v4 − v3. Positive = V4 predicts more. */
  delta: number;
  /** delta relative to V3 (%). */
  deltaPct: number;
}

export function compareV4toV3(v4Total: number, v3Total: number): ForecastV4ComparisonV3 {
  const delta = Math.round(v4Total - v3Total);
  const deltaPct = v3Total > 0 ? Math.round((delta / v3Total) * 1000) / 10 : 0;
  return { v4Total: Math.round(v4Total), v3Total: Math.round(v3Total), delta, deltaPct };
}

/** Spend-weighted overall confidence across categories. */
export function overallConfidenceV4(result: ForecastV4Result): ConfidenceV4 {
  const weight: Record<ConfidenceV4, number> = { high: 1, medium: 0.5, low: 0 };
  let num = 0, den = 0;
  for (const c of Object.values(result.byCategory)) {
    const w = Math.max(1, c.totalForecast);
    num += weight[c.confidence] * w;
    den += w;
  }
  if (den === 0) return 'low';
  const score = num / den;
  return score >= 0.75 ? 'high' : score >= 0.4 ? 'medium' : 'low';
}

/** Fraction each component contributes to the total forecast. */
export function componentWeightsV4(result: ForecastV4Result): Record<string, number> {
  const c = result.components;
  const total =
    c.spentToDate + c.plannedManualRemaining + c.recurringRemaining +
    c.seasonalDetectedRemaining + c.residualStatisticalRemaining + c.budgetSignalAdjustment;
  const denom = total || 1;
  const pct = (n: number) => Math.round((n / denom) * 1000) / 10;
  return {
    spentToDate: pct(c.spentToDate),
    plannedManualRemaining: pct(c.plannedManualRemaining),
    recurringRemaining: pct(c.recurringRemaining),
    seasonalDetectedRemaining: pct(c.seasonalDetectedRemaining),
    residualStatisticalRemaining: pct(c.residualStatisticalRemaining),
    budgetSignalAdjustment: pct(c.budgetSignalAdjustment),
  };
}

export interface ForecastV4DiagnosticsReport {
  generatedAt: string;
  modelVersion: 'forecast-engine-v4';
  month: string;
  snapshotDate: string;
  result: ForecastV4Result;
  comparisonV3?: ForecastV4ComparisonV3;
  overallConfidence: ConfidenceV4;
  componentWeights: Record<string, number>;
  backtest?: ForecastBacktestV4Result[];
  warning: string;
}

export function buildForecastV4DiagnosticsReport(input: {
  result: ForecastV4Result;
  v3ProjectedExpenses?: number;
  backtest?: ForecastBacktestV4Result[];
  now?: Date;
}): ForecastV4DiagnosticsReport {
  const { result } = input;
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    modelVersion: 'forecast-engine-v4',
    month: result.month,
    snapshotDate: result.snapshotDate,
    result,
    comparisonV3: input.v3ProjectedExpenses != null
      ? compareV4toV3(result.totalForecast, input.v3ProjectedExpenses)
      : undefined,
    overallConfidence: overallConfidenceV4(result),
    componentWeights: componentWeightsV4(result),
    backtest: input.backtest,
    warning: FORECAST_V4_WARNING,
  };
}
