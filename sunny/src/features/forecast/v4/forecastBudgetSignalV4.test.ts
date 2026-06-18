import { describe, it, expect } from 'vitest';
import {
  computeBudgetSignalAdjustmentV4, computeBudgetReliabilityV4,
} from './forecastBudgetSignalV4';

describe('computeBudgetSignalAdjustmentV4', () => {
  it('Assicurazioni: high budget far above forecast → large adjustment', () => {
    const r = computeBudgetSignalAdjustmentV4({
      budget: 870, forecastBeforeBudget: 50, spentToDate: 0,
      reliability: 0.95, explainedByDeterministic: 0,
    });
    expect(r.applied).toBe(true);
    expect(r.gap).toBe(820);
    expect(r.adjustment).toBe(779); // 820 × 0.95
  });

  it('Acquisti: high budget but low reliability → small adjustment', () => {
    const r = computeBudgetSignalAdjustmentV4({
      budget: 600, forecastBeforeBudget: 320, spentToDate: 0,
      reliability: 0.25, explainedByDeterministic: 0,
    });
    expect(r.applied).toBe(true);
    expect(r.gap).toBe(280);
    expect(r.adjustment).toBe(70); // 280 × 0.25
  });

  it('small gap → zero adjustment', () => {
    const r = computeBudgetSignalAdjustmentV4({
      budget: 540, forecastBeforeBudget: 500, spentToDate: 200,
      reliability: 0.8, explainedByDeterministic: 0,
    });
    expect(r.applied).toBe(false);
    expect(r.adjustment).toBe(0);
    expect(r.reason).toMatch(/piccolo/i);
  });

  it('gap already explained by planned/seasonal (≥75%) → zero adjustment', () => {
    const r = computeBudgetSignalAdjustmentV4({
      budget: 800, forecastBeforeBudget: 400, spentToDate: 0,
      reliability: 0.9, explainedByDeterministic: 300, // 300 ≥ 400 × 0.75
    });
    expect(r.applied).toBe(false);
    expect(r.adjustment).toBe(0);
    expect(r.reason).toMatch(/già spiegato/i);
  });

  it('spent already over budget → treated as a ceiling, no adjustment', () => {
    const r = computeBudgetSignalAdjustmentV4({
      budget: 300, forecastBeforeBudget: 320, spentToDate: 350,
      reliability: 0.5, explainedByDeterministic: 0,
    });
    expect(r.applied).toBe(false);
    expect(r.adjustment).toBe(0);
    expect(r.reason).toMatch(/limite massimo/i);
  });

  it('no budget → no adjustment', () => {
    const r = computeBudgetSignalAdjustmentV4({
      budget: 0, forecastBeforeBudget: 200, spentToDate: 0,
      reliability: 0.5, explainedByDeterministic: 0,
    });
    expect(r.applied).toBe(false);
    expect(r.adjustment).toBe(0);
  });
});

describe('computeBudgetReliabilityV4', () => {
  it('uses the per-category fallback when there is no history', () => {
    const a = computeBudgetReliabilityV4({ categoryId: 'x', categoryLabel: 'Assicurazioni' });
    expect(a.empirical).toBe(false);
    expect(a.reliability).toBe(0.95);

    const b = computeBudgetReliabilityV4({ categoryId: 'y', categoryLabel: 'Acquisti' });
    expect(b.empirical).toBe(false);
    expect(b.reliability).toBe(0.25);

    const c = computeBudgetReliabilityV4({ categoryId: 'z', categoryLabel: 'Categoria sconosciuta' });
    expect(c.reliability).toBe(0.4); // default
  });

  it('computes empirical reliability ≈ 1.0 (clamped to 0.95) when the gap fully realised', () => {
    const samples = Array.from({ length: 3 }, () => ({ budget: 870, statisticalForecast: 50, actual: 870 }));
    const r = computeBudgetReliabilityV4({ categoryId: 'x', categoryLabel: 'Assicurazioni', samples });
    expect(r.empirical).toBe(true);
    expect(r.reliability).toBe(0.95); // realization 1.0 clamped to 0.95
  });

  it('computes empirical reliability ≈ 0.25 when only a quarter of the gap realised', () => {
    const samples = Array.from({ length: 4 }, () => ({ budget: 600, statisticalForecast: 320, actual: 390 }));
    const r = computeBudgetReliabilityV4({ categoryId: 'y', categoryLabel: 'Acquisti', samples });
    expect(r.empirical).toBe(true);
    expect(r.reliability).toBeCloseTo(0.25, 2);
  });

  it('ignores samples where the budget gap was too small to be informative', () => {
    const samples = [
      { budget: 110, statisticalForecast: 100, actual: 130 }, // gap 10 < max(80, 25) → ignored
      { budget: 120, statisticalForecast: 100, actual: 130 }, // gap 20 < 80 → ignored
    ];
    const r = computeBudgetReliabilityV4({ categoryId: 'y', categoryLabel: 'Cene', samples });
    expect(r.empirical).toBe(false); // not enough qualifying samples → fallback
    expect(r.reliability).toBe(0.35);
  });
});
