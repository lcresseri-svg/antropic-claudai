/**
 * Sunny Forecast Engine V2
 *
 * Multi-signal end-of-month projection using:
 *   - Amount curve  : how much has been spent as a fraction of historical monthly avg
 *   - Count curve   : how many transactions × median ticket
 *
 * This engine does NOT modify and does NOT call forecastSavings() / forecastByCategory().
 * It lives entirely in features/forecast/ and imports only from types.ts and its siblings.
 */
import { Transaction, CategoryDef, ownShare } from '../../types';
import { robustMean, lerp, median } from './forecastStats';
import { buildCategoryHistory, computeCatStats } from './forecastHistory';
import {
  CategoryForecastV2, TotalForecastV2,
  ForecastComposition, TreatmentBreakdown,
  ForecastRule, PlannedBudgetItem,
} from './forecastTypes';
import {
  buildMerchantHistory, buildMerchantRecentMonths,
  normalizeMerchant, inferForecastTreatment,
} from './forecastTreatment';

// ── Tuning constants ─────────────────────────────────────────────────────────
const LOOKBACK_MONTHS = 3;      // recent window for variable averages
const HISTORY_CUTOFF_MONTHS = 24; // max age of historical data used
const SEASONAL_MAX_WEIGHT = 0.35; // max fraction of seasonal signal in blend
const SEASONAL_FULL_YEARS = 2;   // years of history needed for full seasonal weight
// Amount-curve vs count-curve blend:
// α = fraction given to amount curve; (1-α) to count curve.
// α ramps from 0 (no live data) to 0.7 at month-end.
const AMOUNT_ALPHA_MAX = 0.7;
// Below this fraction of the month elapsed, count curve is very unreliable too.
const MIN_PROG_FOR_PACE = 0.08;  // ~2-3 days

// ── Helpers ──────────────────────────────────────────────────────────────────

function monthKeys(n: number, now: Date): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function monthProgress(now: Date): number {
  return Math.min(1, now.getDate() / daysInMonth(now.getFullYear(), now.getMonth()));
}

// ── Amount-curve signal ───────────────────────────────────────────────────────
/**
 * Estimate end-of-month variable spend from the current month's pace.
 * Only variable_normal spend (not one-offs, not recurring) should be passed in.
 * Returns null when there's insufficient data.
 */
function computeAmountCurve(
  variableNormalSpent: number,
  variableAvg: number,
  prog: number,
): { projectedMonthly: number; remaining: number; reliability: number } | null {
  if (variableAvg <= 0) return null;

  const expectedSoFar = prog * variableAvg;
  const paceMonthly = prog > 0 ? variableNormalSpent / prog : 0;

  const spendRatio = expectedSoFar > 0 ? variableNormalSpent / expectedSoFar : 1;
  const timeReliability = Math.min(1, prog / 0.2);
  const spendReliability = Math.min(1, spendRatio);
  const reliability = timeReliability * spendReliability;

  // Quadratic ramp avoids a single early-month purchase blowing up the projection
  const w = Math.min(1, prog * prog);
  const projectedMonthly = w * paceMonthly + (1 - w) * variableAvg;
  const remaining = Math.max(0, 1 - prog) * projectedMonthly;
  return { projectedMonthly, remaining, reliability };
}

// ── Count-curve signal ────────────────────────────────────────────────────────
/**
 * Estimate end-of-month variable spend from transaction frequency × median ticket.
 * Only variable_normal transaction counts should be passed in.
 */
function computeCountCurve(
  variableNormalCount: number,
  avgMonthlyCount: number,
  medianTicket: number,
  prog: number,
): { projectedMonthly: number; remaining: number; reliability: number } | null {
  if (avgMonthlyCount <= 0 || medianTicket <= 0) return null;
  if (prog < MIN_PROG_FOR_PACE) return null;

  const paceCountMonthly = variableNormalCount / prog;
  const countRatio = paceCountMonthly / avgMonthlyCount;
  const reliability = Math.min(1, prog / 0.25) * Math.min(1.5, countRatio) / 1.5;

  const projectedCountMonthly = lerp(avgMonthlyCount, paceCountMonthly, Math.min(1, prog * 1.5));
  const projectedMonthly = projectedCountMonthly * medianTicket;
  const remaining = Math.max(0, projectedCountMonthly - variableNormalCount) * medianTicket;
  return { projectedMonthly, remaining, reliability: Math.max(0, Math.min(1, reliability)) };
}

// ── Main engine ───────────────────────────────────────────────────────────────

export interface ForecastV2Input {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  avgIncome?: number;
  avgInvest?: number;
  upcomingIncome?: number;
  upcomingInvest?: number;
  plannedItems?: PlannedBudgetItem[];
  forecastRules?: ForecastRule[];
  now?: Date;
}

export function computeForecastV2(input: ForecastV2Input): TotalForecastV2 {
  const now = input.now ?? new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayISO = now.toISOString().slice(0, 10);
  const prog = monthProgress(now);
  const cutoff = new Date(now.getFullYear(), now.getMonth() - HISTORY_CUTOFF_MONTHS, 1);
  const recentKeys = monthKeys(LOOKBACK_MONTHS, now);
  const catIds = new Set(input.expenseCategories.map(c => c.id));
  const currentMonth = now.getMonth();

  const plannedItems = input.plannedItems ?? [];
  const forecastRules = input.forecastRules ?? [];

  // ── 1. Build category history (excludes current month) ────────────────────
  const history = buildCategoryHistory(input.transactions, catIds, curKey, cutoff);

  // ── 2. Collect recent tickets per category (for medianTicket) ─────────────
  const recentTickets: Record<string, number[]> = {};
  for (const t of input.transactions) {
    if (t.type !== 'expense') continue;
    if (!catIds.has(t.category)) continue;
    const tKey = t.date.slice(0, 7);
    if (recentKeys.includes(tKey) && !t.seriesId && !t.recurring) {
      (recentTickets[t.category] ??= []).push(ownShare(t));
    }
  }

  // ── 3. Pre-compute per-category stats (used for treatment context) ─────────
  const allCatStats: Record<string, ReturnType<typeof computeCatStats>> = {};
  for (const cat of input.expenseCategories) {
    allCatStats[cat.id] = computeCatStats(
      history[cat.id] ?? {},
      recentKeys,
      currentMonth,
      recentTickets[cat.id] ?? [],
    );
  }

  // ── 4. Build merchant context ──────────────────────────────────────────────
  const merchantHistory = buildMerchantHistory(input.transactions);
  const merchantRecentMonthsMap = buildMerchantRecentMonths(input.transactions, recentKeys);

  // ── 5. Classify and bucket current-month transactions ─────────────────────
  const makeBreakdown = (): TreatmentBreakdown => ({
    variableNormal: 0, scheduledRecurring: 0, plannedNormal: 0,
    plannedOneOff: 0, oneOffExtra: 0, transferExcluded: 0,
  });

  const actualVarNormal: Record<string, number> = {};
  const actualScheduled: Record<string, number> = {};
  const actualOneOff: Record<string, number> = {};
  const varNormalCount: Record<string, number> = {};
  const scheduledFutureBucket: Record<string, number> = {};
  const plannedNormalFuture: Record<string, number> = {};
  const plannedOneOffFuture: Record<string, number> = {};
  const breakdownMap: Record<string, TreatmentBreakdown> = {};

  for (const t of input.transactions) {
    if (t.type !== 'expense') continue;
    if (!catIds.has(t.category)) continue;
    if (t.date.slice(0, 7) !== curKey) continue;

    const catId = t.category;
    const isFuture = t.date > todayISO;
    const share = ownShare(t);
    const norm = normalizeMerchant(t.description);
    const stats = allCatStats[catId];
    const treatment = inferForecastTreatment(t, {
      merchantOccurrences: merchantHistory[norm] ?? [],
      medianTicket: stats.medianTicket,
      recentActiveMonths: stats.recentActiveMonths,
      merchantRecentMonths: merchantRecentMonthsMap[norm] ?? 0,
      plannedItems,
      forecastRules,
    });

    const bd = (breakdownMap[catId] ??= makeBreakdown());

    if (isFuture) {
      switch (treatment) {
        case 'scheduled_recurring':
          scheduledFutureBucket[catId] = (scheduledFutureBucket[catId] ?? 0) + share;
          bd.scheduledRecurring++;
          break;
        case 'planned_one_off':
          plannedOneOffFuture[catId] = (plannedOneOffFuture[catId] ?? 0) + share;
          bd.plannedOneOff++;
          break;
        case 'one_off_extra':
          plannedOneOffFuture[catId] = (plannedOneOffFuture[catId] ?? 0) + share;
          bd.oneOffExtra++;
          break;
        case 'transfer_excluded':
          bd.transferExcluded++;
          break;
        default:
          // variable_normal or planned_normal: future pre-entered spend within baseline
          plannedNormalFuture[catId] = (plannedNormalFuture[catId] ?? 0) + share;
          treatment === 'planned_normal' ? bd.plannedNormal++ : bd.variableNormal++;
      }
    } else {
      switch (treatment) {
        case 'variable_normal':
          actualVarNormal[catId] = (actualVarNormal[catId] ?? 0) + share;
          varNormalCount[catId] = (varNormalCount[catId] ?? 0) + 1;
          bd.variableNormal++;
          break;
        case 'planned_normal':
          // Planned-normal past spend counts toward the variable baseline
          actualVarNormal[catId] = (actualVarNormal[catId] ?? 0) + share;
          varNormalCount[catId] = (varNormalCount[catId] ?? 0) + 1;
          bd.plannedNormal++;
          break;
        case 'scheduled_recurring':
          actualScheduled[catId] = (actualScheduled[catId] ?? 0) + share;
          bd.scheduledRecurring++;
          break;
        case 'planned_one_off':
          actualOneOff[catId] = (actualOneOff[catId] ?? 0) + share;
          bd.plannedOneOff++;
          break;
        case 'one_off_extra':
          actualOneOff[catId] = (actualOneOff[catId] ?? 0) + share;
          bd.oneOffExtra++;
          break;
        case 'transfer_excluded':
          bd.transferExcluded++;
          break;
      }
    }
  }

  // ── 6. Per-category projections ───────────────────────────────────────────
  const categoryForecasts: CategoryForecastV2[] = [];

  for (const cat of input.expenseCategories) {
    const catId = cat.id;
    const stats = allCatStats[catId];

    // Seasonal blend for variable avg
    let variableAvg: number;
    if (stats.recentVarMean > 0 && stats.seasonalMean > 0) {
      const sw = SEASONAL_MAX_WEIGHT * Math.min(1, stats.seasonalYears / SEASONAL_FULL_YEARS);
      variableAvg = stats.recentVarMean * (1 - sw) + stats.seasonalMean * sw;
    } else {
      variableAvg = stats.recentVarMean > 0 ? stats.recentVarMean : stats.seasonalMean;
    }

    const catVarNormal = actualVarNormal[catId] ?? 0;
    const catVarCount = varNormalCount[catId] ?? 0;
    const catScheduled = actualScheduled[catId] ?? 0;
    const catOneOff = actualOneOff[catId] ?? 0;
    const catSchedFuture = scheduledFutureBucket[catId] ?? 0;
    const catPlannedNormalFuture = plannedNormalFuture[catId] ?? 0;
    const catPlannedOneOffFuture = plannedOneOffFuture[catId] ?? 0;
    const catActualSoFar = catVarNormal + catScheduled + catOneOff;

    // Amount curve — only variable_normal spend feeds the pace signal
    const ac = computeAmountCurve(catVarNormal, variableAvg, prog);
    // Count curve — only variable_normal transaction counts feed the frequency signal
    const cc = computeCountCurve(catVarCount, stats.recentCountMean, stats.medianTicket, prog);

    let blendedProjectedMonthly = 0;
    let blendAlpha = 0;
    let reliability = 0;
    let explanation = '';
    let amtCurveRemaining = 0;
    let cntCurveRemaining = 0;

    if (ac && cc) {
      blendAlpha = Math.min(AMOUNT_ALPHA_MAX, prog * AMOUNT_ALPHA_MAX / 0.6);
      blendedProjectedMonthly = blendAlpha * ac.projectedMonthly + (1 - blendAlpha) * cc.projectedMonthly;
      amtCurveRemaining = ac.remaining;
      cntCurveRemaining = cc.remaining;
      reliability = blendAlpha * ac.reliability + (1 - blendAlpha) * cc.reliability;
      explanation = buildExplanation(cat.label, catVarNormal, variableAvg, prog, 'both');
    } else if (ac) {
      blendAlpha = 1;
      blendedProjectedMonthly = ac.projectedMonthly;
      amtCurveRemaining = ac.remaining;
      reliability = ac.reliability;
      explanation = buildExplanation(cat.label, catVarNormal, variableAvg, prog, 'amount');
    } else if (cc) {
      blendAlpha = 0;
      blendedProjectedMonthly = cc.projectedMonthly;
      cntCurveRemaining = cc.remaining;
      reliability = cc.reliability;
      explanation = buildExplanation(cat.label, catVarCount, stats.recentCountMean, prog, 'count');
    } else if (variableAvg > 0) {
      blendedProjectedMonthly = variableAvg;
      reliability = 0.1;
      explanation = `Stima basata sulla media storica (nessun dato ancora questo mese per ${cat.label}).`;
    }

    // Double-counting prevention:
    // blendedProjectedMonthly is the expected variable baseline for the full month.
    // catVarNormal is already spent, catPlannedNormalFuture is already planned (within baseline).
    // So only the gap beyond those two is still unpredicted.
    const predictedVariableRemaining = Math.max(
      0,
      blendedProjectedMonthly - catVarNormal - catPlannedNormalFuture,
    );

    const composition: ForecastComposition = {
      actualVariableNormalSoFar: Math.round(catVarNormal),
      actualScheduledSoFar: Math.round(catScheduled),
      actualOneOffSoFar: Math.round(catOneOff),
      scheduledFuture: Math.round(catSchedFuture),
      plannedNormalFuture: Math.round(catPlannedNormalFuture),
      plannedOneOffFuture: Math.round(catPlannedOneOffFuture),
      predictedVariableRemaining: Math.round(predictedVariableRemaining),
    };

    const projected = Math.round(
      catActualSoFar + catSchedFuture + catPlannedNormalFuture +
      catPlannedOneOffFuture + predictedVariableRemaining,
    );

    categoryForecasts.push({
      categoryId: catId,
      actualSoFar: Math.round(catActualSoFar),
      scheduledFuture: Math.round(catSchedFuture),
      plannedFuture: Math.round(catPlannedNormalFuture + catPlannedOneOffFuture),
      amountCurveRemaining: Math.round(amtCurveRemaining),
      countCurveRemaining: Math.round(cntCurveRemaining),
      predictedVariableRemaining: Math.round(predictedVariableRemaining),
      projected,
      blendAlpha,
      reliability,
      explanation,
      composition,
      treatmentBreakdown: breakdownMap[catId] ?? makeBreakdown(),
    });
  }

  // ── 7. Totals ─────────────────────────────────────────────────────────────
  const projectedExpenses = categoryForecasts.reduce((s, c) => s + c.projected, 0);
  const committedIncome = input.monthlyIncome + Math.max(0, input.upcomingIncome ?? 0);
  const committedInvest = input.monthlyInvestments + Math.max(0, input.upcomingInvest ?? 0);
  const expectedIncome = Math.round(Math.max(committedIncome, input.avgIncome ?? 0));
  const expectedInvest = Math.round(Math.max(committedInvest, input.avgInvest ?? 0));
  const savings = expectedIncome - projectedExpenses - expectedInvest;

  const totalProjected = projectedExpenses || 1;
  const overallReliability = categoryForecasts.reduce(
    (s, c) => s + (c.reliability * c.projected) / totalProjected, 0,
  );

  return {
    projectedExpenses,
    expectedIncome,
    expectedInvest,
    savings,
    categories: categoryForecasts,
    overallReliability: Math.max(0, Math.min(1, overallReliability)),
  };
}

// ── Explanation builder ───────────────────────────────────────────────────────
type SignalType = 'both' | 'amount' | 'count';

function buildExplanation(
  label: string,
  current: number,
  avg: number,
  prog: number,
  signal: SignalType,
): string {
  const pct = Math.round(prog * 100);
  if (signal === 'count') {
    return `${label}: frequenza transazioni proiettata al mese (${pct}% del mese trascorso).`;
  }
  if (avg <= 0) return `${label}: nessuna storia sufficiente.`;
  const ratio = current / (avg * prog || 1);
  if (ratio > 1.3) return `${label}: ritmo più alto del solito (+${Math.round((ratio - 1) * 100)}%).`;
  if (ratio < 0.7) return `${label}: ritmo più basso del solito (${pct}% del mese trascorso).`;
  return `${label}: ritmo in linea con la media storica.`;
}

// ── Income/investment history helpers ────────────────────────────────────────
/**
 * Compute the median monthly income (or investment) over recent months.
 * Used to provide `avgIncome`/`avgInvest` when calling computeForecastV2.
 */
export function medianMonthlyFlow(
  transactions: Transaction[],
  type: 'income' | 'investment',
  now: Date = new Date(),
  months = 3,
): number {
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const byMonth: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== type) continue;
    const key = t.date.slice(0, 7);
    if (key >= curKey) continue;
    byMonth[key] = (byMonth[key] ?? 0) + ownShare(t);
  }
  const recent = Object.entries(byMonth)
    .filter(([k]) => k < curKey)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, months)
    .map(([, v]) => v);
  return median(recent);
}

// ── V1-compatible adapters ────────────────────────────────────────────────────
// These return the SAME shapes as forecastSavings() / forecastByCategory() so the
// admin-only V2 screens can swap to the V2 engine with no other code changes.
// Income/investment expectations are passed straight through (identical max() of
// committed-vs-historical), so ONLY the expense projection changes to the V2 model.

/** Same `MonthForecast` shape as forecastSavings(), backed by the V2 engine. */
export interface MonthForecastShape {
  expectedIncome: number;
  projectedExpenses: number;
  expectedInvest: number;
  savings: number;
}

export function forecastSavingsV2(input: {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  avgIncome?: number;
  avgInvest?: number;
  upcomingIncome?: number;
  upcomingInvest?: number;
  now?: Date;
}): MonthForecastShape {
  const r = computeForecastV2({
    transactions: input.transactions,
    expenseCategories: input.expenseCategories,
    monthlyIncome: input.monthlyIncome,
    monthlyInvestments: input.monthlyInvestments,
    avgIncome: input.avgIncome,
    avgInvest: input.avgInvest,
    upcomingIncome: input.upcomingIncome,
    upcomingInvest: input.upcomingInvest,
    now: input.now,
  });
  return {
    expectedIncome: r.expectedIncome,
    projectedExpenses: r.projectedExpenses,
    expectedInvest: r.expectedInvest,
    savings: r.savings,
  };
}

/** Same `Record<categoryId, projected>` shape as forecastByCategory(), via V2. */
export function forecastByCategoryV2(
  transactions: Transaction[],
  expenseCategories: CategoryDef[],
  now: Date = new Date(),
): Record<string, number> {
  const r = computeForecastV2({
    transactions,
    expenseCategories,
    monthlyIncome: 0,
    monthlyInvestments: 0,
    now,
  });
  const out: Record<string, number> = {};
  for (const c of r.categories) {
    // Mirror V1: omit categories with no projection at all.
    if (c.projected > 0) out[c.categoryId] = c.projected;
  }
  return out;
}
