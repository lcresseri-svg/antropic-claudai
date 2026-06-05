import { useMemo } from 'react';
import { Transaction, CategoryDef } from '../../types';
import { computeForecastV2, medianMonthlyFlow } from './forecastEngine';
import { runBacktest } from './forecastBacktest';
import { TotalForecastV2, BacktestResult } from './forecastTypes';

interface UseForecastV2Options {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  withBacktest?: boolean;
  now?: Date;
}

interface UseForecastV2Result {
  forecast: TotalForecastV2;
  backtest: BacktestResult | null;
}

export function useForecastV2({
  transactions,
  expenseCategories,
  monthlyIncome,
  monthlyInvestments,
  withBacktest = false,
  now,
}: UseForecastV2Options): UseForecastV2Result {
  const forecast = useMemo(() => {
    const ref = now ?? new Date();
    const avgIncome = medianMonthlyFlow(transactions, 'income', ref);
    const avgInvest = medianMonthlyFlow(transactions, 'investment', ref);
    return computeForecastV2({
      transactions,
      expenseCategories,
      monthlyIncome,
      monthlyInvestments,
      avgIncome,
      avgInvest,
      now: ref,
    });
  }, [transactions, expenseCategories, monthlyIncome, monthlyInvestments, now]);

  const backtest = useMemo(() => {
    if (!withBacktest) return null;
    return runBacktest(transactions, expenseCategories, now ?? new Date());
  }, [transactions, expenseCategories, withBacktest, now]);

  return { forecast, backtest };
}
