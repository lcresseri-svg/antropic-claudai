import { Transaction, CategoryDef, ownShare } from '../../types';

export type CategoryStatus = 'normal' | 'warning' | 'over';
export type PaceStatus = 'ahead' | 'on' | 'behind';

/** Round to the nearest 10 € for friendlier suggested figures. */
function round10(n: number): number {
  return Math.max(0, Math.round(n / 10) * 10);
}

function daysInMonth(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/**
 * Average of an array, winsorizing values above 2.5× the median of non-zero
 * entries. With ≤2 values uses a plain mean (not enough data to detect outliers).
 * Exported so the insights engine can apply it to its per-month variable expense
 * accumulator without duplicating the logic.
 */
export function robustAvg(values: number[]): number {
  if (values.length === 0) return 0;
  const n = values.length;
  if (n <= 2) return values.reduce((s, v) => s + v, 0) / n;
  // Winsorize using the median of non-zero values so zeros aren't treated as outliers.
  const nonZero = values.filter(v => v > 0);
  if (nonZero.length === 0) return 0;
  const sorted = [...nonZero].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cap = median * 2.5;
  return values.map(v => Math.min(v, cap)).reduce((s, v) => s + v, 0) / n;
}

/** Fraction of the current month already elapsed (0–1, never 0). */
export function monthProgress(now: Date): number {
  return Math.min(1, now.getDate() / daysInMonth(now));
}

/**
 * Average spend per category in a given calendar month (0–11) across past
 * years. The current (partial) month is excluded so it doesn't skew history.
 * Used to make budget suggestions seasonally aware (e.g. gifts in December).
 */
export function seasonalMonthlyAverage(
  transactions: Transaction[],
  monthIdx: number,
  now: Date = new Date(),
): Record<string, number> {
  const curKey = now.toISOString().slice(0, 7);
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 18, 1);
  const byCatYear: Record<string, Record<number, number>> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) === curKey) continue;
    const d = new Date(t.date);
    if (d < cutoff) continue; // only the last ~18 months
    if (d.getMonth() !== monthIdx) continue;
    (byCatYear[t.category] ??= {});
    byCatYear[t.category][d.getFullYear()] = (byCatYear[t.category][d.getFullYear()] ?? 0) + ownShare(t);
  }
  const out: Record<string, number> = {};
  for (const [cat, perYear] of Object.entries(byCatYear)) {
    const vals = Object.values(perYear);
    if (vals.length) out[cat] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

export interface SeasonalHint { categoryId: string; monthAvg: number; overallAvg: number; ratio: number; }

/** Top category that historically spikes in the current calendar month. */
export function seasonalHint(
  transactions: Transaction[],
  now: Date = new Date(),
): SeasonalHint | null {
  const monthIdx = now.getMonth();
  const curKey = now.toISOString().slice(0, 7);
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 18, 1);
  const monthAvg = seasonalMonthlyAverage(transactions, monthIdx, now);
  const overallSum: Record<string, number> = {};
  const monthsByCat: Record<string, Set<string>> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) === curKey) continue;
    if (new Date(t.date) < cutoff) continue; // only the last ~18 months
    overallSum[t.category] = (overallSum[t.category] ?? 0) + ownShare(t);
    (monthsByCat[t.category] ??= new Set()).add(t.date.slice(0, 7));
  }
  let best: SeasonalHint | null = null;
  for (const [cat, ma] of Object.entries(monthAvg)) {
    const overallAvg = (overallSum[cat] ?? 0) / Math.max(1, monthsByCat[cat]?.size ?? 1);
    if (overallAvg <= 0 || ma < 30) continue;
    const ratio = ma / overallAvg;
    if (ratio >= 1.4 && (!best || ratio > best.ratio)) best = { categoryId: cat, monthAvg: ma, overallAvg, ratio };
  }
  return best;
}

/**
 * Suggest a monthly budget per expense category from the average monthly
 * spend over the last ~3 calendar months, raised to the seasonal level when
 * the current calendar month historically runs higher (e.g. December gifts).
 */
export function suggestBudgets(
  transactions: Transaction[],
  expenseCategories: CategoryDef[],
  now: Date = new Date(),
): Record<string, number> {
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1); // start of 3-month window
  const months = new Set<string>();
  const byCat: Record<string, number> = {};

  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const d = new Date(t.date);
    if (d < cutoff) continue;
    months.add(t.date.slice(0, 7));
    byCat[t.category] = (byCat[t.category] ?? 0) + ownShare(t);
  }

  const monthCount = Math.max(1, months.size);
  const seasonal = seasonalMonthlyAverage(transactions, now.getMonth(), now);
  const out: Record<string, number> = {};
  for (const c of expenseCategories) {
    const recentAvg = (byCat[c.id] ?? 0) / monthCount;
    const seasonalAvg = seasonal[c.id] ?? 0;
    // Use the seasonal level if this month is historically heavier for the category.
    const value = Math.max(recentAvg, seasonalAvg);
    if (value > 0) out[c.id] = round10(value);
  }
  return out;
}

/**
 * Average variable (non-recurring) expense for a given calendar month (0–11)
 * across past years, plus how many prior years back it. The current (partial)
 * month and recurring-origin transactions are excluded. Used as the seasonal
 * signal in the end-of-month forecast.
 */
export function seasonalVariableMonthly(
  transactions: Transaction[],
  monthIdx: number,
  now: Date = new Date(),
): { avg: number; years: number } {
  const curKey = now.toISOString().slice(0, 7);
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 18, 1);
  const perYear: Record<number, number> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.seriesId || t.recurring) continue; // variable spending only
    if (t.date.slice(0, 7) === curKey) continue;
    const d = new Date(t.date);
    if (d < cutoff) continue; // only the last ~18 months
    if (d.getMonth() !== monthIdx) continue;
    perYear[d.getFullYear()] = (perYear[d.getFullYear()] ?? 0) + ownShare(t);
  }
  const vals = Object.values(perYear);
  const years = vals.length;
  return { avg: years ? robustAvg(vals) : 0, years };
}

export interface MonthForecast {
  expectedIncome: number;
  projectedExpenses: number;
  expectedInvest: number;
  savings: number;
}

// Forecast tunables.
const SEASONAL_MAX_WEIGHT = 0.4;   // max weight given to the seasonal signal
const SEASONAL_FULL_YEARS = 2;     // years of history needed for full seasonal weight
const EARLY_MONTH_MIN_PROG = 0.15; // below this, don't project from current pace alone

/**
 * Single source of truth for the end-of-month forecast, used by BOTH the
 * Insights engine and the Budget screen so they never contradict each other.
 *
 * Expenses are split into VARIABLE and RECURRING, then projected as:
 *   projected = spent_this_month + variable_remaining + recurring_remaining
 *   (clamped: never below what's already been spent)
 *
 *   - variable_remaining = (1 − prog) × [ w·thisMonthPace + (1−w)·variableAvg ]
 *       w = elapsed fraction of the month, so the estimate leans on the
 *       historical average early on and increasingly on THIS month's actual
 *       pace as days pass.
 *   - variableAvg blends recent months with the same-month-prior-years average,
 *       weighting the seasonal part only as far as real years of data back it.
 *   - recurring_remaining = known recurring occurrences still due this month,
 *       added explicitly (the variable averages exclude recurring entries).
 *
 * Income/investments use the higher of "already recorded" and "historical
 * average", since salaries/contributions usually land as a single lump sum.
 */
export function forecastSavings(o: {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  /** Variable (non-recurring) expenses already recorded this month. */
  variableSpent?: number;
  /** Average monthly variable expense over recent months. */
  recentVariableAvg?: number;
  /** Average variable expense for this same calendar month in prior years. */
  seasonalVariableAvg?: number;
  /** Number of prior years backing seasonalVariableAvg (confidence). */
  seasonalYears?: number;
  /** Sum of recurring expense occurrences still due this month (after today). */
  upcomingRecurring?: number;
  /** Known income still to come this month (recurring due + planned one-offs). */
  upcomingIncome?: number;
  /** Known investments still to come this month (recurring due + planned one-offs). */
  upcomingInvest?: number;
  avgIncome?: number;
  avgInvest?: number;
  now?: Date;
}): MonthForecast {
  const now = o.now ?? new Date();
  const prog = monthProgress(now);

  const recentVar = Math.max(0, o.recentVariableAvg ?? 0);
  const seasVar = Math.max(0, o.seasonalVariableAvg ?? 0);
  const seasYears = Math.max(0, o.seasonalYears ?? 0);

  // (1) Adaptive blend: the seasonal weight grows with how many prior years
  // back it (capped), and is zero when there's no seasonal signal.
  let variableAvg: number;
  if (recentVar > 0 && seasVar > 0) {
    const sw = SEASONAL_MAX_WEIGHT * Math.min(1, seasYears / SEASONAL_FULL_YEARS);
    variableAvg = recentVar * (1 - sw) + seasVar * sw;
  } else {
    variableAvg = recentVar > 0 ? recentVar : seasVar;
  }

  const variableSpent = Math.max(0, o.variableSpent ?? 0);
  const paceMonthly = prog > 0 ? variableSpent / prog : 0;

  let variableRemaining: number;
  if (variableAvg > 0) {
    // (3) Trust this month's actual pace more as the month progresses, but ramp
    // it in QUADRATICALLY. Pace = spent / elapsed-fraction, so a linear weight
    // would let a single early purchase enter at near-full strength on day 2-3
    // (the elapsed fraction cancels out), badly over-projecting the month. The
    // squared weight keeps the first part of the month anchored to history and
    // only leans on live pace once enough of the month has actually elapsed.
    const pc = Math.min(1, prog);
    const w = pc * pc;
    // Only when the pace is plausible (spending is at least roughly on track):
    // a pace near zero mid-month more likely means "no data yet" than an
    // "extremely light month", so scale its influence by spent-vs-expected.
    const expectedSpentSoFar = prog * variableAvg;
    const paceReliability = expectedSpentSoFar > 0
      ? Math.min(1, variableSpent / expectedSpentSoFar)
      : 1;
    const effectiveW = w * paceReliability;
    const projectedVariableMonthly = effectiveW * paceMonthly + (1 - effectiveW) * variableAvg;
    variableRemaining = Math.max(0, 1 - prog) * projectedVariableMonthly;
  } else {
    // No variable history: project the current pace, but only once enough of
    // the month has elapsed to be meaningful.
    variableRemaining = prog >= EARLY_MONTH_MIN_PROG ? Math.max(0, 1 - prog) * paceMonthly : 0;
  }

  // (2) Known recurring commitments still due — added explicitly, not as a floor.
  const recurringRemaining = Math.max(0, o.upcomingRecurring ?? 0);

  const projectedExpenses = Math.round(
    Math.max(o.monthlyExpenses + variableRemaining + recurringRemaining, o.monthlyExpenses),
  );

  // Known committed inflows/investments this month = realized so far + still to
  // come (recurring + planned). Floored at the historical average so a quiet
  // early month doesn't underproject. The max avoids double-counting recurring
  // income that history already reflects.
  const committedIncome = o.monthlyIncome + Math.max(0, o.upcomingIncome ?? 0);
  const committedInvest = o.monthlyInvestments + Math.max(0, o.upcomingInvest ?? 0);
  const expectedIncome = Math.round(Math.max(committedIncome, o.avgIncome ?? 0));
  const expectedInvest = Math.round(Math.max(committedInvest, o.avgInvest ?? 0));
  const savings = expectedIncome - projectedExpenses - expectedInvest;
  return { expectedIncome, projectedExpenses, expectedInvest, savings };
}

export function categoryStatus(spent: number, budget: number): CategoryStatus {
  if (budget <= 0) return 'normal';
  const pct = spent / budget;
  if (pct > 1) return 'over';
  if (pct >= 0.8) return 'warning';
  return 'normal';
}

/** Whether spending is ahead of, on, or behind the expected monthly pace. */
export function paceStatus(spent: number, budget: number, now: Date = new Date()): PaceStatus {
  if (budget <= 0) return 'on';
  const expected = budget * monthProgress(now);
  if (spent > expected * 1.15) return 'ahead';   // ahead = spending faster than planned
  if (spent < expected * 0.85) return 'behind';
  return 'on';
}

/**
 * Per-category end-of-month projection.
 *
 * Returns a map of { categoryId → projected total spend by end of month }.
 * Only categories with a variable spending history are included; categories
 * with only recurring entries (or no history at all) are omitted so the UI
 * shows nothing rather than a misleading number.
 *
 * Uses the same adaptive blend logic as `forecastSavings` (recent 3-month
 * robust avg + seasonal signal + paceReliability), computed per category in
 * a single pass over the transaction list.
 */
export function forecastByCategory(
  transactions: Transaction[],
  categoryIds: string[],
  now: Date = new Date(),
): Record<string, number> {
  const curKey = now.toISOString().slice(0, 7);
  const todayISO = now.toISOString().slice(0, 10);
  const prog = monthProgress(now);
  const monthIdx = now.getMonth();
  const cutoff18 = new Date(now.getFullYear(), now.getMonth() - 18, 1);

  const recentKeys: string[] = [1, 2, 3].map(i => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const recentKeySet = new Set(recentKeys);
  const catIdSet = new Set(categoryIds);

  // One-pass collection across all relevant transactions.
  const totalSpentCurr: Record<string, number> = {};
  const variableSpentCurr: Record<string, number> = {};
  const plannedCurr: Record<string, number> = {};  // future-dated one-offs this month
  const recentVarByMonthCat: Record<string, Record<string, number>> = {};
  const seasonalVarByYearCat: Record<string, Record<number, number>> = {};
  const activeRecentMonths = new Set<string>();  // months with any expense in recent window

  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const tKey = t.date.slice(0, 7);

    if (tKey === curKey) {
      if (catIdSet.has(t.category)) {
        // Planned (future-dated, non-recurring) expense: committed but not yet
        // spent — tracked separately so it doesn't distort the current pace.
        if (!t.seriesId && !t.recurring && t.date > todayISO) {
          plannedCurr[t.category] = (plannedCurr[t.category] ?? 0) + ownShare(t);
          continue;
        }
        totalSpentCurr[t.category] = (totalSpentCurr[t.category] ?? 0) + ownShare(t);
        if (!t.seriesId && !t.recurring) {
          variableSpentCurr[t.category] = (variableSpentCurr[t.category] ?? 0) + ownShare(t);
        }
      }
      continue;
    }

    if (t.seriesId || t.recurring) continue;  // variable history only

    const d = new Date(t.date);
    if (d < cutoff18) continue;

    if (recentKeySet.has(tKey)) {
      activeRecentMonths.add(tKey);
      if (catIdSet.has(t.category)) {
        const catMap = (recentVarByMonthCat[t.category] ??= {});
        catMap[tKey] = (catMap[tKey] ?? 0) + ownShare(t);
      }
    }

    if (d.getMonth() === monthIdx && catIdSet.has(t.category)) {
      const catMap = (seasonalVarByYearCat[t.category] ??= {});
      catMap[d.getFullYear()] = (catMap[d.getFullYear()] ?? 0) + ownShare(t);
    }
  }

  const result: Record<string, number> = {};
  const nActiveMonths = Math.max(1, activeRecentMonths.size);

  for (const catId of categoryIds) {
    const totalSpent = totalSpentCurr[catId] ?? 0;
    const variableSpent = variableSpentCurr[catId] ?? 0;
    const planned = plannedCurr[catId] ?? 0;

    // Recent variable avg: per-month totals (0 for active months with no spending in this category),
    // normalized over active months in the window so lumpy categories get a lower average.
    const monthlyVarTotals = [...activeRecentMonths].map(k => recentVarByMonthCat[catId]?.[k] ?? 0);
    const recentVarAvg = monthlyVarTotals.length > 0
      ? robustAvg(monthlyVarTotals.concat(Array(nActiveMonths - monthlyVarTotals.length).fill(0)))
      : 0;

    // Seasonal variable avg for this calendar month across prior years.
    const seasVals = Object.values(seasonalVarByYearCat[catId] ?? {});
    const seasAvg = seasVals.length > 0 ? robustAvg(seasVals) : 0;
    const seasYears = seasVals.length;

    // Adaptive blend (same constants as forecastSavings).
    let variableAvg: number;
    if (recentVarAvg > 0 && seasAvg > 0) {
      const sw = SEASONAL_MAX_WEIGHT * Math.min(1, seasYears / SEASONAL_FULL_YEARS);
      variableAvg = recentVarAvg * (1 - sw) + seasAvg * sw;
    } else {
      variableAvg = recentVarAvg > 0 ? recentVarAvg : seasAvg;
    }

    if (variableAvg === 0) {
      // No history to project from, but a planned expense is still committed.
      if (planned > 0) result[catId] = Math.round(totalSpent + planned);
      continue;
    }

    const paceMonthly = prog > 0 ? variableSpent / prog : 0;
    const expectedSpentSoFar = prog * variableAvg;
    const paceReliability = expectedSpentSoFar > 0
      ? Math.min(1, variableSpent / expectedSpentSoFar)
      : 1;
    // Quadratic ramp on the pace weight — see forecastSavings for the rationale
    // (avoids a single early-month purchase blowing up the projection).
    const pc = Math.min(1, prog);
    const effectiveW = pc * pc * paceReliability;
    const projectedVariableMonthly = effectiveW * paceMonthly + (1 - effectiveW) * variableAvg;
    const variableRemaining = Math.max(0, 1 - prog) * projectedVariableMonthly;

    // Planned one-offs are committed on top of the pace-based projection.
    const projected = Math.round(Math.max(totalSpent + variableRemaining + planned, totalSpent + planned));
    if (projected > 0) result[catId] = projected;
  }

  return result;
}

// ── Demo data ────────────────────────────────────────────────────────────────
// Used as a fallback so the Budget screen feels alive before real data exists.

export const DEMO_CATEGORY_SPEND: Record<string, number> = {
  casa: 1180,
  spesa: 410,
  ristoranti: 280,
  trasporti: 120,
  shopping: 190,
  altro: 60,
};

export const DEMO_CATEGORY_BUDGETS: Record<string, number> = {
  casa: 1200,
  spesa: 450,
  ristoranti: 250,
  trasporti: 150,
  shopping: 200,
  altro: 100,
};
