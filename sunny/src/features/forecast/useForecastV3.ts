import { useMemo, useState, useEffect } from 'react';
import { Transaction, CategoryDef } from '../../types';
import { computeForecastV3, medianMonthlyFlowV3 } from './forecastEngineV3';
import { runBacktestV3 } from './forecastBacktestV3';
import { TotalForecastV3, BacktestResultV3 } from './forecastTypesV3';
import { saveBacktestSnapshotsV3 } from './forecastSnapshotsV3';

interface UseForecastV3Options {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  /** If true, run the multi-snapshot backtest and return bias metrics. */
  withBacktest?: boolean;
  /** If true, apply bias correction from backtest to the main forecast. */
  withBiasCorrection?: boolean;
  now?: Date;
  /** If true, persist each backtest snapshot to Firestore (write-once). Requires uid. */
  persistSnapshots?: boolean;
  /** Firebase UID of the current user — required when persistSnapshots is true. */
  uid?: string;
}

interface UseForecastV3Result {
  forecast: TotalForecastV3;
  backtest: BacktestResultV3 | null;
  /** Number of snapshots newly written on the last persist run. Null when persistSnapshots is off. */
  savedSnapshotCount: number | null;
}

export function useForecastV3({
  transactions,
  expenseCategories,
  monthlyIncome,
  monthlyInvestments,
  withBacktest = false,
  withBiasCorrection = false,
  now,
  persistSnapshots = false,
  uid,
}: UseForecastV3Options): UseForecastV3Result {
  const [savedSnapshotCount, setSavedSnapshotCount] = useState<number | null>(null);

  const backtest = useMemo(() => {
    if (!withBacktest && !withBiasCorrection) return null;
    return runBacktestV3(transactions, expenseCategories, now ?? new Date());
  }, [transactions, expenseCategories, withBacktest, withBiasCorrection, now]);

  const forecast = useMemo(() => {
    const ref = now ?? new Date();
    const avgIncome = medianMonthlyFlowV3(transactions, 'income', ref);
    const avgInvest = medianMonthlyFlowV3(transactions, 'investment', ref);
    const biasFactor = withBiasCorrection && backtest ? backtest.biasFactor : 1.0;
    return computeForecastV3({
      transactions,
      expenseCategories,
      monthlyIncome,
      monthlyInvestments,
      avgIncome,
      avgInvest,
      biasFactor,
      now: ref,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, expenseCategories, monthlyIncome, monthlyInvestments, now, backtest, withBiasCorrection]);

  useEffect(() => {
    if (!persistSnapshots || !uid || !backtest || backtest.snapshots.length === 0) return;
    let cancelled = false;
    saveBacktestSnapshotsV3(uid, backtest.snapshots)
      .then(count => { if (!cancelled) setSavedSnapshotCount(count); })
      .catch(() => { /* persistence errors don't affect forecast quality */ });
    return () => { cancelled = true; };
  }, [backtest, persistSnapshots, uid]);

  return { forecast, backtest, savedSnapshotCount };
}
