import { describe, it, expect } from 'vitest';
import {
  compareV4toV3, overallConfidenceV4, componentWeightsV4, buildForecastV4DiagnosticsReport,
} from './forecastDiagnosticsV4';
import { ForecastV4Result } from './forecastTypesV4';

function mkResult(over: Partial<ForecastV4Result> = {}): ForecastV4Result {
  return {
    month: '2026-06',
    snapshotDate: '2026-06-15',
    totalForecast: 1000,
    spentToDate: 200,
    components: {
      spentToDate: 200,
      plannedManualRemaining: 400,
      recurringRemaining: 100,
      seasonalDetectedRemaining: 200,
      budgetSignalAdjustment: 50,
      residualStatisticalRemaining: 50,
    },
    byCategory: {
      a: {
        categoryId: 'a', categoryLabel: 'A', spentToDate: 200, forecastBeforeBudget: 700,
        totalForecast: 700, plannedManualRemaining: 400, recurringRemaining: 100,
        seasonalDetectedRemaining: 0, residualStatisticalRemaining: 0,
        confidence: 'high', reasons: [],
      },
      b: {
        categoryId: 'b', categoryLabel: 'B', spentToDate: 0, forecastBeforeBudget: 250,
        totalForecast: 300, plannedManualRemaining: 0, recurringRemaining: 0,
        seasonalDetectedRemaining: 200, residualStatisticalRemaining: 50,
        budget: 350, budgetGap: 100, budgetReliability: 0.5, budgetSignalAdjustment: 50,
        confidence: 'low', reasons: [],
      },
    },
    diagnostics: {
      largePlannedExpenses: [], seasonalDetected: [], staleCategories: [],
      budgetSignalApplied: [], budgetSignalIgnored: [], plannedCoverageRatio: 0.7,
      budgetMonthStatus: 'confirmed', budgetSource: 'current_month_intent',
      budgetHistoryCoverageRatio: 0, budgetSignalValidatable: false, warnings: [],
    },
    ...over,
  };
}

describe('compareV4toV3', () => {
  it('computes delta and percentage delta', () => {
    const cmp = compareV4toV3(1100, 1000);
    expect(cmp.delta).toBe(100);
    expect(cmp.deltaPct).toBe(10);
  });

  it('handles a zero V3 baseline without dividing by zero', () => {
    const cmp = compareV4toV3(500, 0);
    expect(cmp.deltaPct).toBe(0);
  });
});

describe('componentWeightsV4', () => {
  it('returns component shares that sum to ~100%', () => {
    const w = componentWeightsV4(mkResult());
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(100, 0);
  });
});

describe('overallConfidenceV4', () => {
  it('is spend-weighted across categories', () => {
    // category A (high, weight 700) dominates category B (low, weight 300)
    const conf = overallConfidenceV4(mkResult());
    expect(['high', 'medium']).toContain(conf);
  });
});

describe('buildForecastV4DiagnosticsReport', () => {
  it('assembles a serialisable report with comparison and weights', () => {
    const report = buildForecastV4DiagnosticsReport({
      result: mkResult(), v3ProjectedExpenses: 900,
    });
    expect(report.modelVersion).toBe('forecast-engine-v4');
    expect(report.comparisonV3?.delta).toBe(100);
    expect(report.componentWeights).toBeDefined();
    expect(report.warning).toContain('300');
    // Round-trips through JSON without throwing.
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
