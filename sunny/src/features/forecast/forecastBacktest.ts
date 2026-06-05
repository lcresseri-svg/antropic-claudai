/**
 * Backtest the V2 forecast engine against historical closed months.
 * For each month in the window, we pretend we're partway through it
 * (at the same fractional progress as the current month) and compare
 * the prediction against the actual final spend.
 */
import { Transaction, CategoryDef, ownShare } from '../../types';
import { computeForecastV2 } from './forecastEngine';
import { BacktestMonth, BacktestResult } from './forecastTypes';
import { median } from './forecastStats';

/**
 * Run a backtest over up to `maxMonths` completed months before `now`.
 *
 * For each historical month M:
 * 1. Pretend `now` is `snapshotDay` days into month M (same day-of-month as current).
 * 2. Feed the engine only transactions from before/during that snapshot.
 * 3. Compare engine prediction with actual full-month spend.
 */
export function runBacktest(
  transactions: Transaction[],
  expenseCategories: CategoryDef[],
  now: Date = new Date(),
  maxMonths = 6,
): BacktestResult {
  const snapshotDay = now.getDate();  // e.g. day 15 of the current month
  const months: BacktestMonth[] = [];

  for (let i = 1; i <= maxMonths; i++) {
    const targetYear = now.getMonth() - i < 0
      ? now.getFullYear() - Math.ceil((i - now.getMonth()) / 12)
      : now.getFullYear();
    const targetMonthRaw = ((now.getMonth() - i) % 12 + 12) % 12;
    const targetDate = new Date(targetYear, targetMonthRaw, snapshotDay);
    const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

    // Actual full-month expense
    const actual = transactions
      .filter(t => t.type === 'expense' && t.date.slice(0, 7) === monthKey)
      .reduce((s, t) => s + ownShare(t), 0);

    if (actual === 0) continue; // skip months with no data

    // Snapshot: only transactions before or at snapshotDay in the target month
    const snapshotISO = `${monthKey}-${String(snapshotDay).padStart(2, '0')}`;
    const snapshotTx = transactions.filter(t => t.date <= snapshotISO);

    // Monthly income/investments at the snapshot point
    const monthlyIncome = snapshotTx
      .filter(t => t.type === 'income' && t.date.slice(0, 7) === monthKey)
      .reduce((s, t) => s + ownShare(t), 0);
    const monthlyInvestments = snapshotTx
      .filter(t => t.type === 'investment' && t.date.slice(0, 7) === monthKey)
      .reduce((s, t) => s + ownShare(t), 0);

    const result = computeForecastV2({
      transactions: snapshotTx,
      expenseCategories,
      monthlyIncome,
      monthlyInvestments,
      now: targetDate,
    });

    const predicted = result.projectedExpenses;
    const error = predicted - actual;
    const absError = Math.abs(error);
    const relError = actual > 0 ? absError / actual : 0;

    months.push({ monthKey, actual: Math.round(actual), predicted: Math.round(predicted), error: Math.round(error), absError: Math.round(absError), relError });
  }

  if (months.length === 0) {
    return { months: [], mae: 0, mape: 0, r2: 0 };
  }

  const mae = months.reduce((s, m) => s + m.absError, 0) / months.length;
  const mape = median(months.map(m => m.relError)) * 100;

  // R² = 1 − SS_res / SS_tot
  const actualMean = months.reduce((s, m) => s + m.actual, 0) / months.length;
  const ssTot = months.reduce((s, m) => s + Math.pow(m.actual - actualMean, 2), 0);
  const ssRes = months.reduce((s, m) => s + Math.pow(m.error, 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  return { months, mae: Math.round(mae), mape: Math.round(mape * 10) / 10, r2: Math.round(r2 * 100) / 100 };
}
