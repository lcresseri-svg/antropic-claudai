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
import { CategoryForecastV2, TotalForecastV2 } from './forecastTypes';

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
 * Returns `null` when there's insufficient data to use this signal.
 */
function amountCurveRemaining(
  variableSpent: number,
  variableAvg: number,
  prog: number,
): { remaining: number; reliability: number } | null {
  if (variableAvg <= 0) return null;

  const expectedSoFar = prog * variableAvg;
  const paceMonthly = prog > 0 ? variableSpent / prog : 0;

  // Reliability: how well this month's spending tracks the average so far.
  // Low at the start (prog < 0.2) or when spent is far below expected (data sparsity).
  const spendRatio = expectedSoFar > 0 ? variableSpent / expectedSoFar : 1;
  const timeReliability = Math.min(1, prog / 0.2);  // ramps 0→1 over first 20% of month
  const spendReliability = Math.min(1, spendRatio);
  const reliability = timeReliability * spendReliability;

  // Quadratic ramp: amount-curve weight ramps with prog² to avoid early-month overfit
  const w = Math.min(1, prog * prog);
  const projectedMonthly = w * paceMonthly + (1 - w) * variableAvg;
  const remaining = Math.max(0, 1 - prog) * projectedMonthly;
  return { remaining, reliability };
}

// ── Count-curve signal ────────────────────────────────────────────────────────
/**
 * Estimate end-of-month variable spend from transaction frequency × median ticket.
 */
function countCurveRemaining(
  variableCount: number,
  avgMonthlyCount: number,
  medianTicket: number,
  prog: number,
): { remaining: number; reliability: number } | null {
  if (avgMonthlyCount <= 0 || medianTicket <= 0) return null;
  if (prog < MIN_PROG_FOR_PACE) return null;

  const paceCountMonthly = variableCount / prog;
  const expectedCount = avgMonthlyCount;
  // Reliability: how close actual transaction count is to expected (linear ramp)
  const countRatio = paceCountMonthly / expectedCount;
  const reliability = Math.min(1, prog / 0.25) * Math.min(1.5, countRatio) / 1.5;

  const projectedCountMonthly = lerp(expectedCount, paceCountMonthly, Math.min(1, prog * 1.5));
  const remaining = Math.max(0, projectedCountMonthly - variableCount) * medianTicket;
  return { remaining, reliability: Math.max(0, Math.min(1, reliability)) };
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

  // ── 1. Build history ─────────────────────────────────────────────────────
  const history = buildCategoryHistory(input.transactions, catIds, curKey, cutoff);

  // ── 2. Collect current-month actuals ─────────────────────────────────────
  const actualSoFar: Record<string, number> = {};
  const variableSpent: Record<string, number> = {};
  const variableCount: Record<string, number> = {};
  const scheduledFuture: Record<string, number> = {};
  const plannedFuture: Record<string, number> = {};
  const recentTickets: Record<string, number[]> = {};

  for (const t of input.transactions) {
    if (t.type !== 'expense') continue;
    if (!catIds.has(t.category)) continue;
    const tKey = t.date.slice(0, 7);

    if (tKey === curKey) {
      const share = ownShare(t);
      if (t.seriesId || t.recurring) {
        // Recurring entry for current month
        if (t.date > todayISO) {
          // Future recurring still due
          scheduledFuture[t.category] = (scheduledFuture[t.category] ?? 0) + share;
        } else {
          actualSoFar[t.category] = (actualSoFar[t.category] ?? 0) + share;
        }
      } else if (t.date > todayISO) {
        // Planned future one-off (not recurring, not yet occurred)
        plannedFuture[t.category] = (plannedFuture[t.category] ?? 0) + share;
      } else {
        actualSoFar[t.category] = (actualSoFar[t.category] ?? 0) + share;
        variableSpent[t.category] = (variableSpent[t.category] ?? 0) + share;
        variableCount[t.category] = (variableCount[t.category] ?? 0) + 1;
      }
      continue;
    }

    // Collect recent tickets for median calculation
    if (recentKeys.includes(tKey) && !t.seriesId && !t.recurring) {
      (recentTickets[t.category] ??= []).push(ownShare(t));
    }
  }

  // ── 3. Per-category projections ───────────────────────────────────────────
  const categoryForecasts: CategoryForecastV2[] = [];

  for (const cat of input.expenseCategories) {
    const catId = cat.id;
    const catHistory = history[catId] ?? {};
    const tickets = recentTickets[catId] ?? [];

    const stats = computeCatStats(catHistory, recentKeys, currentMonth, tickets);

    // Seasonal blend for variable avg
    let variableAvg: number;
    if (stats.recentVarMean > 0 && stats.seasonalMean > 0) {
      const sw = SEASONAL_MAX_WEIGHT * Math.min(1, stats.seasonalYears / SEASONAL_FULL_YEARS);
      variableAvg = stats.recentVarMean * (1 - sw) + stats.seasonalMean * sw;
    } else {
      variableAvg = stats.recentVarMean > 0 ? stats.recentVarMean : stats.seasonalMean;
    }

    const catActual = actualSoFar[catId] ?? 0;
    const catVarSpent = variableSpent[catId] ?? 0;
    const catVarCount = variableCount[catId] ?? 0;
    const catScheduled = scheduledFuture[catId] ?? 0;
    const catPlanned = plannedFuture[catId] ?? 0;

    // Amount curve
    const ac = amountCurveRemaining(catVarSpent, variableAvg, prog);
    // Count curve
    const cc = countCurveRemaining(catVarCount, stats.recentCountMean, stats.medianTicket, prog);

    let predictedVariableRemaining = 0;
    let blendAlpha = 0;
    let reliability = 0;
    let explanation = '';

    if (ac && cc) {
      // Both signals: blend α·amount + (1-α)·count, α grows with prog
      blendAlpha = Math.min(AMOUNT_ALPHA_MAX, prog * AMOUNT_ALPHA_MAX / 0.6);
      predictedVariableRemaining = blendAlpha * ac.remaining + (1 - blendAlpha) * cc.remaining;
      reliability = blendAlpha * ac.reliability + (1 - blendAlpha) * cc.reliability;
      explanation = buildExplanation(cat.label, catVarSpent, variableAvg, prog, 'both');
    } else if (ac) {
      blendAlpha = 1;
      predictedVariableRemaining = ac.remaining;
      reliability = ac.reliability;
      explanation = buildExplanation(cat.label, catVarSpent, variableAvg, prog, 'amount');
    } else if (cc) {
      blendAlpha = 0;
      predictedVariableRemaining = cc.remaining;
      reliability = cc.reliability;
      explanation = buildExplanation(cat.label, catVarCount, stats.recentCountMean, prog, 'count');
    } else if (variableAvg > 0) {
      // No live signal yet (early month) — fall back to historical average
      predictedVariableRemaining = Math.max(0, 1 - prog) * variableAvg;
      reliability = 0.1;
      explanation = `Stima basata sulla media storica (nessun dato ancora questo mese per ${cat.label}).`;
    }

    const projected = Math.round(catActual + catScheduled + catPlanned + predictedVariableRemaining);

    categoryForecasts.push({
      categoryId: catId,
      actualSoFar: Math.round(catActual),
      scheduledFuture: Math.round(catScheduled),
      plannedFuture: Math.round(catPlanned),
      amountCurveRemaining: ac ? Math.round(ac.remaining) : 0,
      countCurveRemaining: cc ? Math.round(cc.remaining) : 0,
      predictedVariableRemaining: Math.round(predictedVariableRemaining),
      projected,
      blendAlpha,
      reliability,
      explanation,
    });
  }

  // ── 4. Totals ─────────────────────────────────────────────────────────────
  const projectedExpenses = categoryForecasts.reduce((s, c) => s + c.projected, 0);
  const committedIncome = input.monthlyIncome + Math.max(0, input.upcomingIncome ?? 0);
  const committedInvest = input.monthlyInvestments + Math.max(0, input.upcomingInvest ?? 0);
  const expectedIncome = Math.round(Math.max(committedIncome, input.avgIncome ?? 0));
  const expectedInvest = Math.round(Math.max(committedInvest, input.avgInvest ?? 0));
  const savings = expectedIncome - projectedExpenses - expectedInvest;

  // Overall reliability = weighted mean of per-cat reliabilities, weighted by projected amount
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
