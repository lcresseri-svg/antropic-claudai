/**
 * Backtest for Forecast Engine V3.
 *
 * Multi-snapshot: tests each historical month at days 5, 10, 15, 20, 25.
 *
 * Component decomposition (non-circular):
 *   error = deterministicFutureError + variableError
 *   where:
 *     deterministicFutureError = sum(c.scheduledFuture + c.plannedFuture)
 *                               − Σ(recurring/scheduled txs AFTER snapshot date)
 *     variableError            = sum(c.predictedVariableRemaining)
 *                               − Σ(variable txs AFTER snapshot date)
 *
 * "AFTER snapshot date" = transactions in the month with date > snapshotISO.
 * These are what the engine must predict; transactions already present in the
 * snapshot cancel from both sides and don't affect the error.
 *
 * biasFactor is computed from the variable component only (actualVariableAfterD /
 * predictedVariable), so it corrects statistical estimation without touching
 * deterministic scheduled/fixed amounts.
 */
import { Transaction, CategoryDef, ownShare } from '../../types';
import { computeForecastV3 } from './forecastEngineV3';
import { BacktestResultV3, BacktestSnapshotV3, BacktestComponentMetrics } from './forecastTypesV3';
import { median } from './forecastStats';

const SNAPSHOT_DAYS = [5, 10, 15, 20, 25];

/**
 * Run a multi-snapshot backtest over up to `maxMonths` completed months.
 *
 * For each historical month M and each snapshot day D:
 *  1. Pretend `now` is day D of month M.
 *  2. Feed the engine transactions on or before that snapshot date PLUS any
 *     future-dated expense transactions in month M that have seriesId/recurring set
 *     (matching production: the recurring Cloud Function pre-inserts scheduled items).
 *  3. Compare prediction against actual full-month spend and decompose error.
 *
 * Returns metrics + a variable-only bias factor to apply to future forecasts.
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

    const actualFullMonth = Math.round(
      transactions
        .filter(t => t.type === 'expense' && t.date.slice(0, 7) === monthKey)
        .reduce((s, t) => s + ownShare(t), 0),
    );
    if (actualFullMonth === 0) continue;

    for (const day of SNAPSHOT_DAYS) {
      // Use <= so day-5 snapshot INCLUDES transactions dated exactly on day 5
      const snapshotISO = `${monthKey}-${String(day).padStart(2, '0')}`;

      // Snapshot transactions:
      //   - All transactions up to and including snapshot date, PLUS
      //   - Future-dated recurring/scheduled expense transactions in this month
      //     (matching production: Cloud Function pre-inserts them on day 1)
      const snapshotTx = transactions.filter(t =>
        t.date <= snapshotISO ||
        (
          t.date.slice(0, 7) === monthKey &&
          t.date > snapshotISO &&
          (t.seriesId || t.recurring) &&
          t.type === 'expense'
        ),
      );

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

      // ── Engine component split ───────────────────────────────────────────
      // predictedVariable: what the engine statistically estimates for the future
      const predictedVariable = Math.round(
        result.categories.reduce((s, c) => s + c.predictedVariableRemaining, 0),
      );
      // forecastDeterministicFuture: what the engine deterministically committed to
      // for future items (scheduled recurring + planned items)
      const forecastDeterministicFuture = Math.round(
        result.categories.reduce((s, c) => s + c.scheduledFuture + c.plannedFuture, 0),
      );

      // ── Actual after-snapshot split (from full-month truth) ──────────────
      // These are the transactions that ACTUALLY happened AFTER the snapshot date —
      // exactly what the engine had to predict. Transactions before the snapshot are
      // already in actualSoFar on both sides and cancel out.
      const actualDeterministicAfterD = Math.round(
        transactions.filter(t =>
          t.type === 'expense' &&
          t.date.slice(0, 7) === monthKey &&
          t.date > snapshotISO &&
          (t.seriesId || t.recurring),
        ).reduce((s, t) => s + ownShare(t), 0),
      );
      const actualVariableAfterD = Math.round(
        transactions.filter(t =>
          t.type === 'expense' &&
          t.date.slice(0, 7) === monthKey &&
          t.date > snapshotISO &&
          !t.seriesId && !t.recurring,
        ).reduce((s, t) => s + ownShare(t), 0),
      );

      // ── Component errors ─────────────────────────────────────────────────
      const error = Math.round(predicted - actualFullMonth);
      const absError = Math.abs(error);
      const relError = actualFullMonth > 0 ? absError / actualFullMonth : 0;

      // variableError: engine over-predicted tail → positive; under-predicted → negative
      const variableError = Math.round(predictedVariable - actualVariableAfterD);
      // deterministicFutureError: engine missed future scheduled → negative; over-counted → positive
      const deterministicFutureError = Math.round(forecastDeterministicFuture - actualDeterministicAfterD);
      // missedDeterministic: scheduled/recurring items that arrived after snapshot but
      // were NOT in the engine's forecastDeterministicFuture (the engine was blind to them)
      const missedDeterministic = Math.round(
        Math.max(0, actualDeterministicAfterD - forecastDeterministicFuture),
      );

      snapshots.push({
        monthKey,
        snapshotDay: day,
        actual: actualFullMonth,
        predicted,
        error,
        absError,
        relError,
        predictedVariable,
        forecastDeterministicFuture,
        actualDeterministicAfterD,
        actualVariableAfterD,
        variableError,
        deterministicFutureError,
        missedDeterministic,
      });
    }
  }

  if (snapshots.length === 0) {
    const emptyMetrics: BacktestComponentMetrics = {
      mae: 0, medAE: 0, bias: 0, wape: 0, wapeReliable: false, sampleCount: 0,
    };
    return {
      snapshots: [], mae: 0, medAE: 0, wape: 0, bias: 0,
      biasFactor: 1.0, r2: 0, byDay: [],
      variableTail: emptyMetrics,
      deterministic: emptyMetrics,
      missedDeterministicMean: 0,
    };
  }

  // ── Overall quality metrics ───────────────────────────────────────────────
  const mae = snapshots.reduce((s, m) => s + m.absError, 0) / snapshots.length;
  const medAE = median(snapshots.map(m => m.absError));
  const totalActual = snapshots.reduce((s, m) => s + m.actual, 0);
  const wape = totalActual > 0
    ? (snapshots.reduce((s, m) => s + m.absError, 0) / totalActual) * 100
    : 0;
  const bias = snapshots.reduce((s, m) => s + m.error, 0) / snapshots.length;

  // ── Variable-only bias factor ─────────────────────────────────────────────
  // Bias correction must only apply to the statistical variable component.
  // biasFactor = mean(actualVariableAfterD) / mean(predictedVariable)
  //   > 1 → engine under-predicted variable → scale up
  //   < 1 → engine over-predicted variable → scale down
  const varSnapsForBias = snapshots.filter(s => s.predictedVariable > 0 || s.actualVariableAfterD > 0);
  let biasFactor = 1.0;
  if (varSnapsForBias.length > 0) {
    const meanActualVar = varSnapsForBias.reduce((s, m) => s + m.actualVariableAfterD, 0) / varSnapsForBias.length;
    const meanPredictedVar = varSnapsForBias.reduce((s, m) => s + m.predictedVariable, 0) / varSnapsForBias.length;
    const rawFactor = meanPredictedVar > 0 ? meanActualVar / meanPredictedVar : 1.0;
    biasFactor = Math.max(0.75, Math.min(1.25, rawFactor));
  }

  // R²
  const actualMean = totalActual / snapshots.length;
  const ssTot = snapshots.reduce((s, m) => s + Math.pow(m.actual - actualMean, 2), 0);
  const ssRes = snapshots.reduce((s, m) => s + Math.pow(m.error, 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  // ── Component metrics: variable tail ─────────────────────────────────────
  // Only snapshots where either side had variable activity
  const varSnaps = snapshots.filter(s => s.predictedVariable > 0 || s.actualVariableAfterD > 0);
  const totalActualVarAfterD = varSnaps.reduce((s, m) => s + m.actualVariableAfterD, 0);
  const varWapeReliable = totalActualVarAfterD > 50;
  const variableTail: BacktestComponentMetrics = {
    mae: varSnaps.length > 0
      ? Math.round(varSnaps.reduce((s, m) => s + Math.abs(m.variableError), 0) / varSnaps.length)
      : 0,
    medAE: Math.round(median(varSnaps.map(m => Math.abs(m.variableError)))),
    bias: varSnaps.length > 0
      ? Math.round(varSnaps.reduce((s, m) => s + m.variableError, 0) / varSnaps.length)
      : 0,
    wape: varWapeReliable
      ? Math.round(varSnaps.reduce((s, m) => s + Math.abs(m.variableError), 0) / totalActualVarAfterD * 1000) / 10
      : 0,
    wapeReliable: varWapeReliable,
    sampleCount: varSnaps.length,
  };

  // ── Component metrics: deterministic future ───────────────────────────────
  // Only snapshots where either side had deterministic future activity
  const detSnaps = snapshots.filter(s => s.forecastDeterministicFuture > 0 || s.actualDeterministicAfterD > 0);
  const totalActualDetAfterD = detSnaps.reduce((s, m) => s + m.actualDeterministicAfterD, 0);
  const detWapeReliable = totalActualDetAfterD > 50;
  const deterministic: BacktestComponentMetrics = {
    mae: detSnaps.length > 0
      ? Math.round(detSnaps.reduce((s, m) => s + Math.abs(m.deterministicFutureError), 0) / detSnaps.length)
      : 0,
    medAE: Math.round(median(detSnaps.map(m => Math.abs(m.deterministicFutureError)))),
    bias: detSnaps.length > 0
      ? Math.round(detSnaps.reduce((s, m) => s + m.deterministicFutureError, 0) / detSnaps.length)
      : 0,
    wape: detWapeReliable
      ? Math.round(detSnaps.reduce((s, m) => s + Math.abs(m.deterministicFutureError), 0) / totalActualDetAfterD * 1000) / 10
      : 0,
    wapeReliable: detWapeReliable,
    sampleCount: detSnaps.length,
  };

  // ── Missed deterministic mean ─────────────────────────────────────────────
  const missedDeterministicMean = Math.round(
    snapshots.reduce((s, m) => s + m.missedDeterministic, 0) / snapshots.length,
  );

  // ── Per-snapshot-day breakdown ────────────────────────────────────────────
  const byDay = SNAPSHOT_DAYS.map(day => {
    const daySnaps = snapshots.filter(s => s.snapshotDay === day);
    if (daySnaps.length === 0) return { day, mae: 0, bias: 0, count: 0, variableMae: 0, variableBias: 0 };
    const varDaySnaps = daySnaps.filter(s => s.predictedVariable > 0 || s.actualVariableAfterD > 0);
    return {
      day,
      mae: Math.round(daySnaps.reduce((s, m) => s + m.absError, 0) / daySnaps.length),
      bias: Math.round(daySnaps.reduce((s, m) => s + m.error, 0) / daySnaps.length),
      count: daySnaps.length,
      variableMae: varDaySnaps.length > 0
        ? Math.round(varDaySnaps.reduce((s, m) => s + Math.abs(m.variableError), 0) / varDaySnaps.length)
        : 0,
      variableBias: varDaySnaps.length > 0
        ? Math.round(varDaySnaps.reduce((s, m) => s + m.variableError, 0) / varDaySnaps.length)
        : 0,
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
    variableTail,
    deterministic,
    missedDeterministicMean,
    byDay,
  };
}
