/**
 * Backtest for Forecast Engine V3.
 *
 * Improvement over V2 backtest:
 *   - Multi-snapshot: tests each historical month at days 5, 10, 15, 20, 25
 *     (5 data points per month instead of 1) → more robust bias estimate
 *   - Additional metrics: medAE, WAPE, per-day breakdown
 *   - Bias correction factor: mean(actual)/mean(predicted), clamped [0.75, 1.25]
 */
import { Transaction, CategoryDef, ownShare } from '../../types';
import { computeForecastV3 } from './forecastEngineV3';
import { BacktestResultV3, BacktestSnapshotV3 } from './forecastTypesV3';
import { median } from './forecastStats';

const SNAPSHOT_DAYS = [5, 10, 15, 20, 25];

/**
 * Run a multi-snapshot backtest over up to `maxMonths` completed months.
 *
 * For each historical month M and each snapshot day D:
 *  1. Pretend `now` is day D of month M.
 *  2. Feed the engine only transactions on or before that snapshot date.
 *  3. Compare prediction against actual full-month spend.
 *
 * Returns metrics + a bias correction factor to apply to future forecasts.
 */
export function runBacktestV3(
  transactions: Transaction[],
  expenseCategories: CategoryDef[],
  now: Date = new Date(),
  maxMonths = 6,
): BacktestResultV3 {
  const snapshots: BacktestSnapshotV3[] = [];

  for (let i = 1; i <= maxMonths; i++) {
    const targetYear = now.getMonth() - i < 0
      ? now.getFullYear() - Math.ceil((i - now.getMonth()) / 12)
      : now.getFullYear();
    const targetMonthRaw = ((now.getMonth() - i) % 12 + 12) % 12;
    const monthKey = `${targetYear}-${String(targetMonthRaw + 1).padStart(2, '0')}`;

    const actual = transactions
      .filter(t => t.type === 'expense' && t.date.slice(0, 7) === monthKey)
      .reduce((s, t) => s + ownShare(t), 0);

    if (actual === 0) continue;

    for (const day of SNAPSHOT_DAYS) {
      const snapshotISO = `${monthKey}-${String(day).padStart(2, '0')}`;
      const snapshotTx = transactions.filter(t => t.date <= snapshotISO);
      const snapshotDate = new Date(targetYear, targetMonthRaw, day);

      const monthlyIncome = snapshotTx
        .filter(t => t.type === 'income' && t.date.slice(0, 7) === monthKey)
        .reduce((s, t) => s + ownShare(t), 0);
      const monthlyInvestments = snapshotTx
        .filter(t => t.type === 'investment' && t.date.slice(0, 7) === monthKey)
        .reduce((s, t) => s + ownShare(t), 0);

      const result = computeForecastV3({
        transactions: snapshotTx,
        expenseCategories,
        monthlyIncome,
        monthlyInvestments,
        now: snapshotDate,
      });

      const predicted = result.projectedExpenses;
      const error = predicted - actual;
      const absError = Math.abs(error);
      const relError = actual > 0 ? absError / actual : 0;

      snapshots.push({
        monthKey,
        snapshotDay: day,
        actual: Math.round(actual),
        predicted: Math.round(predicted),
        error: Math.round(error),
        absError: Math.round(absError),
        relError,
      });
    }
  }

  if (snapshots.length === 0) {
    return {
      snapshots: [], mae: 0, medAE: 0, wape: 0, bias: 0,
      biasFactor: 1.0, r2: 0, byDay: [],
    };
  }

  // ── Overall metrics ───────────────────────────────────────────────────────
  const mae = snapshots.reduce((s, m) => s + m.absError, 0) / snapshots.length;
  const medAE = median(snapshots.map(m => m.absError));
  const totalActual = snapshots.reduce((s, m) => s + m.actual, 0);
  const wape = totalActual > 0
    ? (snapshots.reduce((s, m) => s + m.absError, 0) / totalActual) * 100
    : 0;
  const bias = snapshots.reduce((s, m) => s + m.error, 0) / snapshots.length;

  // Bias factor: mean(actual) / mean(predicted), clamped to [0.75, 1.25]
  const meanActual = totalActual / snapshots.length;
  const meanPredicted = snapshots.reduce((s, m) => s + m.predicted, 0) / snapshots.length;
  const rawBiasFactor = meanPredicted > 0 ? meanActual / meanPredicted : 1.0;
  const biasFactor = Math.max(0.75, Math.min(1.25, rawBiasFactor));

  // R²
  const actualMean = meanActual;
  const ssTot = snapshots.reduce((s, m) => s + Math.pow(m.actual - actualMean, 2), 0);
  const ssRes = snapshots.reduce((s, m) => s + Math.pow(m.error, 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  // ── Per-snapshot-day breakdown ────────────────────────────────────────────
  const byDay = SNAPSHOT_DAYS.map(day => {
    const daySnaps = snapshots.filter(s => s.snapshotDay === day);
    if (daySnaps.length === 0) return { day, mae: 0, bias: 0, count: 0 };
    return {
      day,
      mae: Math.round(daySnaps.reduce((s, m) => s + m.absError, 0) / daySnaps.length),
      bias: Math.round(daySnaps.reduce((s, m) => s + m.error, 0) / daySnaps.length),
      count: daySnaps.length,
    };
  }).filter(d => d.count > 0);

  return {
    snapshots,
    mae: Math.round(mae),
    medAE: Math.round(medAE),
    wape: Math.round(wape * 10) / 10,
    bias: Math.round(bias),
    biasFactor: Math.round(biasFactor * 100) / 100,
    r2: Math.round(r2 * 100) / 100,
    byDay,
  };
}
