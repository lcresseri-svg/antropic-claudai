/**
 * Historical aggregation helpers.
 * Collects per-month per-category spending signals needed by the V2 engine.
 */
import { Transaction, ownShare } from '../../types';
import { robustMean, median } from './forecastStats';

export interface MonthCatHistory {
  /** YYYY-MM */
  monthKey: string;
  /** Total variable (non-recurring) spend in this month for this category. */
  variableTotal: number;
  /** Number of distinct variable transactions. */
  variableCount: number;
  /** Total recurring spend in this month for this category. */
  recurringTotal: number;
}

/**
 * Collect full history up to (but not including) `currentKey` for a set of category IDs.
 * Returns a nested map: `result[categoryId][monthKey]`.
 */
export function buildCategoryHistory(
  transactions: Transaction[],
  categoryIds: Set<string>,
  currentKey: string,
  cutoffDate: Date,
): Record<string, Record<string, MonthCatHistory>> {
  const result: Record<string, Record<string, MonthCatHistory>> = {};

  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (!categoryIds.has(t.category)) continue;
    const key = t.date.slice(0, 7);
    if (key >= currentKey) continue;
    if (new Date(t.date) < cutoffDate) continue;

    const catMap = (result[t.category] ??= {});
    const entry = (catMap[key] ??= { monthKey: key, variableTotal: 0, variableCount: 0, recurringTotal: 0 });
    const share = ownShare(t);

    if (t.seriesId || t.recurring) {
      entry.recurringTotal += share;
    } else {
      entry.variableTotal += share;
      entry.variableCount += 1;
    }
  }

  return result;
}

export interface CatStats {
  /** Robust mean of monthly variable totals over the recent window. */
  recentVarMean: number;
  /** Robust mean of monthly variable transaction counts. */
  recentCountMean: number;
  /** Median ticket (median of per-transaction amounts in recent window). */
  medianTicket: number;
  /** Seasonal variable mean for this same calendar month, across available prior years. */
  seasonalMean: number;
  /** Number of prior years backing the seasonal signal. */
  seasonalYears: number;
  /** Number of months in the recent window that had any spending in this category. */
  recentActiveMonths: number;
}

/**
 * Compute per-category statistics from the historical maps.
 *
 * `recentKeys`  — the 3 (or fewer) months immediately before `currentKey`.
 * `allKeys`     — all historical months available (for seasonal calc).
 * `monthIdx`    — current month index (0–11) for seasonal matching.
 */
export function computeCatStats(
  catHistory: Record<string, MonthCatHistory>,
  recentKeys: string[],
  currentMonth: number,
  allTickets: number[],   // raw per-transaction amounts in recent window for this cat
): CatStats {
  const recentVarTotals = recentKeys.map(k => catHistory[k]?.variableTotal ?? 0);
  const recentCounts = recentKeys.map(k => catHistory[k]?.variableCount ?? 0);
  const recentActiveMonths = recentKeys.filter(k => (catHistory[k]?.variableTotal ?? 0) > 0).length;

  // Median is more robust than robustMean(k=3.0) for a 3-point window:
  // a single spike has 33% weight and passes winsorization substantially,
  // anchoring the estimate to the spike month for the next 3 months.
  // Median (L1-optimal estimator) gives the middle value — it only "suppresses"
  // a value when it is the unique outlier in the window (1-of-3), and naturally
  // follows a genuine trend because median == mean for any arithmetic progression.
  const recentVarMean = median(recentVarTotals);
  const recentCountMean = robustMean(recentCounts);
  const medianTicket = computeMedianTicket(allTickets);

  // Seasonal: same calendar month across prior years
  const seasonalValues = Object.values(catHistory).filter(h => {
    const m = parseInt(h.monthKey.slice(5, 7), 10) - 1;
    return m === currentMonth;
  }).map(h => h.variableTotal);
  const seasonalMean = seasonalValues.length > 0 ? robustMean(seasonalValues) : 0;
  const seasonalYears = seasonalValues.length;

  return { recentVarMean, recentCountMean, medianTicket, seasonalMean, seasonalYears, recentActiveMonths };
}

function computeMedianTicket(tickets: number[]): number {
  if (tickets.length === 0) return 0;
  const s = [...tickets].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}
