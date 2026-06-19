/**
 * Backtest for Forecast Engine V4.
 *
 * Compares four models on the same historical snapshots:
 *   1. "V3"               — current V3 engine (no bias correction)
 *   2. "V3.5 (bias)"      — V3 engine with its variable-only bias factor applied
 *   3. "V4 planned-aware" — V4 without the budget signal
 *   4. "V4 + budget"      — V4 with the budget signal applied
 *
 * Snapshots: days 1, 5, 10, 15, 20, 25 of each target month.
 * Target months: from `fromMonth` (default 2025-01) to the last complete month.
 *
 * The backtest never throws on missing budget history — it falls back to
 * per-category reliability inside the engine.
 */
import { Transaction, CategoryDef, ownShare } from '../../../types';
import { computeForecastV3 } from '../forecastEngineV3';
import { runBacktestV3 } from '../forecastBacktestV3';
import { computeForecastV4 } from './forecastEngineV4';
import {
  ForecastBacktestV4Result, ForecastV4Metrics, BudgetHistoryEntryV4,
  SeasonalExpenseCandidateV4, CategoryImpactV4,
} from './forecastTypesV4';

const DEFAULT_SNAPSHOT_DAYS = [1, 5, 10, 15, 20, 25];
const DEFAULT_FROM_MONTH = '2025-01';

export interface BacktestV4Options {
  fromMonth?: string;
  snapshotDays?: number[];
  categoryBudgets?: Record<string, number>;
  budgetHistory?: BudgetHistoryEntryV4[];
  now?: Date;
}

interface Pair { actual: number; predicted: number; }
interface KeyedPair extends Pair { month: string; day: number; categoryId?: string; }

function computeMetrics(pairs: Pair[]): ForecastV4Metrics {
  const n = pairs.length;
  if (n === 0) return { mae: 0, wape: 0, bias: 0, rmse: 0, r2: 0, sampleCount: 0 };
  let absSum = 0, signedSum = 0, sqSum = 0, actualSum = 0;
  for (const p of pairs) {
    const err = p.predicted - p.actual;
    absSum += Math.abs(err);
    signedSum += err;
    sqSum += err * err;
    actualSum += p.actual;
  }
  const mae = absSum / n;
  const wape = actualSum > 0 ? (absSum / actualSum) * 100 : 0;
  const bias = signedSum / n;
  const rmse = Math.sqrt(sqSum / n);
  const actualMean = actualSum / n;
  const ssTot = pairs.reduce((s, p) => s + (p.actual - actualMean) ** 2, 0);
  const ssRes = pairs.reduce((s, p) => s + (p.predicted - p.actual) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  return {
    mae: Math.round(mae),
    wape: Math.round(wape * 10) / 10,
    bias: Math.round(bias),
    rmse: Math.round(rmse),
    r2: Math.round(r2 * 100) / 100,
    sampleCount: n,
  };
}

/** Enumerate YYYY-MM keys from `fromMonth` up to (but excluding) the month of `now`. */
function monthRange(fromMonth: string, now: Date): { key: string; year: number; monthIdx: number }[] {
  const [fy, fm] = fromMonth.split('-').map(Number);
  const out: { key: string; year: number; monthIdx: number }[] = [];
  const cur = new Date(fy, fm - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1); // first of current month (exclusive)
  while (cur < end) {
    out.push({
      key: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`,
      year: cur.getFullYear(),
      monthIdx: cur.getMonth(),
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

interface ModelAccumulator {
  modelName: string;
  total: Pair[];
  byDay: Map<number, Pair[]>;
  byMonth: Map<string, Pair[]>;
  byCategory: Map<string, Pair[]>;
}

function newAccumulator(modelName: string): ModelAccumulator {
  return { modelName, total: [], byDay: new Map(), byMonth: new Map(), byCategory: new Map() };
}

function pushSample(acc: ModelAccumulator, s: KeyedPair) {
  const pair = { actual: s.actual, predicted: s.predicted };
  if (s.categoryId) {
    const arr = acc.byCategory.get(s.categoryId) ?? [];
    arr.push(pair);
    acc.byCategory.set(s.categoryId, arr);
    return;
  }
  acc.total.push(pair);
  const dayArr = acc.byDay.get(s.day) ?? []; dayArr.push(pair); acc.byDay.set(s.day, dayArr);
  const monArr = acc.byMonth.get(s.month) ?? []; monArr.push(pair); acc.byMonth.set(s.month, monArr);
}

function finalize(
  acc: ModelAccumulator,
  diagnostics: ForecastBacktestV4Result['diagnostics'],
): ForecastBacktestV4Result {
  const totals = computeMetrics(acc.total);
  const bySnapshotDay: Record<number, ForecastV4Metrics> = {};
  for (const [day, pairs] of acc.byDay) bySnapshotDay[day] = computeMetrics(pairs);
  const byMonth: Record<string, ForecastV4Metrics> = {};
  for (const [m, pairs] of acc.byMonth) byMonth[m] = computeMetrics(pairs);
  const byCategory: Record<string, ForecastV4Metrics> = {};
  for (const [c, pairs] of acc.byCategory) byCategory[c] = computeMetrics(pairs);
  return {
    modelName: acc.modelName,
    mae: totals.mae, wape: totals.wape, bias: totals.bias, rmse: totals.rmse, r2: totals.r2,
    bySnapshotDay, byMonth, byCategory,
    diagnostics,
  };
}

export function runBacktestV4(
  transactions: Transaction[],
  expenseCategories: CategoryDef[],
  options: BacktestV4Options = {},
): ForecastBacktestV4Result[] {
  const now = options.now ?? new Date();
  const snapshotDays = options.snapshotDays ?? DEFAULT_SNAPSHOT_DAYS;
  const fromMonth = options.fromMonth ?? DEFAULT_FROM_MONTH;
  const budgetHistory = options.budgetHistory ?? [];
  const labelOf = (id: string) => expenseCategories.find(c => c.id === id)?.label ?? id;
  // CRITICAL: historical months must NEVER borrow the current month's budget.
  // The budget signal is driven solely by budgetHistory[targetMonth].
  const budgetMonthKeys = new Set(budgetHistory.map(b => b.month));
  const confirmedBudgetMonthKeys = new Set(
    budgetHistory.filter(b => b.status === 'confirmed').map(b => b.month),
  );

  // V3.5 bias factor (variable-only) from the existing V3 backtest machinery.
  const v3Backtest = runBacktestV3(transactions, expenseCategories, now, 18);
  const biasFactor = v3Backtest.biasFactor;

  const accV3 = newAccumulator('V3');
  const accV35 = newAccumulator('V3.5 (bias)');
  const accV4 = newAccumulator('V4 planned-aware');
  const accV4b = newAccumulator('V4 + budget');

  // Diagnostics aggregation (V4-side).
  const seasonalSeen = new Map<string, SeasonalExpenseCandidateV4>();
  const coverageRatios: number[] = [];
  const targetMonthsWithBudget = new Set<string>();
  const targetMonthsWithoutBudget = new Set<string>();
  // Per-category abs error to measure budget signal impact.
  const v4AbsErr = new Map<string, number>();
  const v4bAbsErr = new Map<string, number>();
  const v4SampleCount = new Map<string, number>();

  const months = monthRange(fromMonth, now);

  for (const m of months) {
    const monthTx = transactions.filter(t => t.type === 'expense' && t.date.slice(0, 7) === m.key);
    const actualFull = Math.round(monthTx.reduce((s, t) => s + ownShare(t), 0));
    if (actualFull === 0) continue;

    // Per-category full-month actual.
    const catActual = new Map<string, number>();
    for (const t of monthTx) {
      catActual.set(t.category, (catActual.get(t.category) ?? 0) + ownShare(t));
    }

    // Did this historical target month have its own budget snapshot?
    if (budgetMonthKeys.has(m.key)) targetMonthsWithBudget.add(m.key);
    else targetMonthsWithoutBudget.add(m.key);

    for (const day of snapshotDays) {
      const snapshotISO = `${m.key}-${String(day).padStart(2, '0')}`;
      // Snapshot input: everything up to snapshot date + future-dated recurring
      // expenses in this month (matches production's pre-inserted recurrences).
      const snapshotTx = transactions.filter(t =>
        t.date <= snapshotISO ||
        (t.date.slice(0, 7) === m.key && t.date > snapshotISO &&
          (t.seriesId || t.recurring) && t.type === 'expense'),
      );
      const snapshotDate = new Date(m.year, m.monthIdx, day);

      // ── V3 / V3.5 ─────────────────────────────────────────────────────────
      const v3 = computeForecastV3({
        transactions: snapshotTx, expenseCategories,
        monthlyIncome: 0, monthlyInvestments: 0, biasFactor: 1, now: snapshotDate,
      });
      const v35 = computeForecastV3({
        transactions: snapshotTx, expenseCategories,
        monthlyIncome: 0, monthlyInvestments: 0, biasFactor, now: snapshotDate,
      });
      pushSample(accV3, { month: m.key, day, actual: actualFull, predicted: v3.projectedExpenses });
      pushSample(accV35, { month: m.key, day, actual: actualFull, predicted: v35.projectedExpenses });
      for (const c of v3.categories) {
        pushSample(accV3, { month: m.key, day, actual: Math.round(catActual.get(c.categoryId) ?? 0), predicted: c.projected, categoryId: c.categoryId });
      }
      for (const c of v35.categories) {
        pushSample(accV35, { month: m.key, day, actual: Math.round(catActual.get(c.categoryId) ?? 0), predicted: c.projected, categoryId: c.categoryId });
      }

      // ── V4 (no budget) / V4 + budget ──────────────────────────────────────
      // No `categoryBudgets`: the engine's budget signal is driven only by
      // budgetHistory[targetMonth], so historical months never see the current
      // budget. Months absent from budgetHistory → budgetMonthStatus 'missing'
      // → no budget signal.
      const v4 = computeForecastV4({
        transactions: snapshotTx, expenseCategories,
        budgetHistory, applyBudgetSignal: false, now: snapshotDate,
      });
      const v4b = computeForecastV4({
        transactions: snapshotTx, expenseCategories,
        budgetHistory, applyBudgetSignal: true, now: snapshotDate,
      });
      pushSample(accV4, { month: m.key, day, actual: actualFull, predicted: v4.totalForecast });
      pushSample(accV4b, { month: m.key, day, actual: actualFull, predicted: v4b.totalForecast });

      for (const c of expenseCategories) {
        const a = Math.round(catActual.get(c.id) ?? 0);
        const p4 = v4.byCategory[c.id]?.totalForecast ?? 0;
        const p4b = v4b.byCategory[c.id]?.totalForecast ?? 0;
        if (a === 0 && p4 === 0 && p4b === 0) continue;
        pushSample(accV4, { month: m.key, day, actual: a, predicted: p4, categoryId: c.id });
        pushSample(accV4b, { month: m.key, day, actual: a, predicted: p4b, categoryId: c.id });
        v4AbsErr.set(c.id, (v4AbsErr.get(c.id) ?? 0) + Math.abs(p4 - a));
        v4bAbsErr.set(c.id, (v4bAbsErr.get(c.id) ?? 0) + Math.abs(p4b - a));
        v4SampleCount.set(c.id, (v4SampleCount.get(c.id) ?? 0) + 1);
      }

      coverageRatios.push(v4.diagnostics.plannedCoverageRatio);
      for (const s of v4.diagnostics.seasonalDetected) {
        seasonalSeen.set(`${s.categoryId}:${s.expectedMonth}`, s);
      }
    }
  }

  // ── Budget-signal impact (V4+budget vs V4) ──────────────────────────────────
  const helped: CategoryImpactV4[] = [];
  const hurt: CategoryImpactV4[] = [];
  for (const [catId, n] of v4SampleCount) {
    const delta = (v4bAbsErr.get(catId) ?? 0) - (v4AbsErr.get(catId) ?? 0);
    if (Math.abs(delta) < 1) continue; // no meaningful change
    const impact: CategoryImpactV4 = {
      categoryId: catId, categoryLabel: labelOf(catId),
      errorDelta: Math.round(delta), sampleCount: n,
    };
    if (delta < 0) helped.push(impact); else hurt.push(impact);
  }
  helped.sort((a, b) => a.errorDelta - b.errorDelta);
  hurt.sort((a, b) => b.errorDelta - a.errorDelta);

  const avgCoverage = coverageRatios.length
    ? Math.round((coverageRatios.reduce((a, b) => a + b, 0) / coverageRatios.length) * 100) / 100
    : 0;
  const seasonalDetected = [...seasonalSeen.values()];

  const sampleCountBudgetMonths = targetMonthsWithBudget.size;
  const sampleCountWithoutBudget = targetMonthsWithoutBudget.size;
  const totalTargetMonths = sampleCountBudgetMonths + sampleCountWithoutBudget;
  const budgetHistoryCoverageRatio = totalTargetMonths > 0
    ? Math.round((sampleCountBudgetMonths / totalTargetMonths) * 100) / 100
    : 0;
  // Validatable only with ≥3 CONFIRMED historical budget months among the targets.
  const confirmedTargets = [...targetMonthsWithBudget].filter(k => confirmedBudgetMonthKeys.has(k)).length;
  const budgetWarning = confirmedTargets < 3
    ? 'Budget signal non ancora validabile: storico budget insufficiente.'
    : undefined;

  const v4Diagnostics: ForecastBacktestV4Result['diagnostics'] = {
    budgetSignalHelped: [], budgetSignalHurt: [],
    seasonalDetected, plannedCoverageRatio: avgCoverage,
    sampleCountBudgetMonths, sampleCountWithoutBudget, budgetHistoryCoverageRatio,
  };
  const v4bDiagnostics: ForecastBacktestV4Result['diagnostics'] = {
    budgetSignalHelped: helped, budgetSignalHurt: hurt,
    seasonalDetected, plannedCoverageRatio: avgCoverage,
    sampleCountBudgetMonths, sampleCountWithoutBudget, budgetHistoryCoverageRatio,
    warning: budgetWarning,
  };
  const emptyDiagnostics: ForecastBacktestV4Result['diagnostics'] = {
    budgetSignalHelped: [], budgetSignalHurt: [],
    seasonalDetected: [], plannedCoverageRatio: 0,
    sampleCountBudgetMonths: 0, sampleCountWithoutBudget: 0, budgetHistoryCoverageRatio: 0,
  };

  return [
    finalize(accV3, emptyDiagnostics),
    finalize(accV35, emptyDiagnostics),
    finalize(accV4, v4Diagnostics),
    finalize(accV4b, v4bDiagnostics),
  ];
}
