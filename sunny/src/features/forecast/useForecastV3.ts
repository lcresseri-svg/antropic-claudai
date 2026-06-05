import { useMemo } from 'react';
import { Transaction, CategoryDef } from '../../types';
import { computeForecastV3, medianMonthlyFlowV3 } from './forecastEngineV3';
import { runBacktestV3 } from './forecastBacktestV3';
import { TotalForecastV3, BacktestResultV3 } from './forecastTypesV3';

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
}

interface UseForecastV3Result {
  forecast: TotalForecastV3;
  backtest: BacktestResultV3 | null;
}

export function useForecastV3({
  transactions,
  expenseCategories,
  monthlyIncome,
  monthlyInvestments,
  withBacktest = false,
  withBiasCorrection = false,
  now,
}: UseForecastV3Options): UseForecastV3Result {
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

  return { forecast, backtest };
}
