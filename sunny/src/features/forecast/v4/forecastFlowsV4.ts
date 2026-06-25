/**
 * Forecast V4 — income & investment monthly-total forecasting.
 *
 * V4's engine (`computeForecastV4`) models EXPENSES only. To let V4 fully own the
 * Piano "risparmio previsto" number (income − expenses − investments) we add the
 * income/investment flow estimate here, with NO import from the V3 engine.
 *
 * The estimate intentionally mirrors the long-standing committed-vs-historical
 * rule so these two flows behave exactly as before:
 *
 *   committed      = realizedThisMonth + max(0, upcomingThisMonth)
 *   expectedFlow   = round(max(committed, historicalMedian))
 *
 * `realizedThisMonth` is what already happened this month, `upcomingThisMonth` is
 * the committed-but-not-yet part (recurring + planned occurrences still to come),
 * and `historicalMedian` is the trailing median monthly flow — a floor so a month
 * whose salary/contribution hasn't landed yet still forecasts the usual amount.
 */
import { Transaction, ownShare } from '../../../types';
import { median } from './forecastV4Common';

/**
 * Trailing median of net monthly flow for `type`, over the `months` most recent
 * COMPLETE months (strictly before the month of `now`). Investments are netted
 * (deposits − withdrawals) so a withdrawal can't inflate the projected flow.
 */
export function medianMonthlyFlowV4(
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
    if (key >= curKey) continue; // only complete months before the target
    const sign = type === 'investment' && t.direction === 'out' ? -1 : 1;
    byMonth[key] = (byMonth[key] ?? 0) + sign * ownShare(t);
  }
  const recent = Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, months)
    .map(([, v]) => v);
  return median(recent);
}

/**
 * End-of-month expected total for an income/investment flow:
 * round(max(realizedThisMonth + max(0, upcoming), historicalMedian)).
 * `avg` (historical median) is computed from `transactions` when omitted.
 */
export function forecastFlowV4(input: {
  transactions: Transaction[];
  type: 'income' | 'investment';
  /** Already realized this (target) month — monthlyIncome / monthlyInvestments. */
  realizedThisMonth: number;
  /** Committed-but-not-yet this month (recurring + planned occurrences to come). */
  upcoming?: number;
  /** Historical median flow; computed via medianMonthlyFlowV4 when omitted. */
  avg?: number;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const avg = input.avg ?? medianMonthlyFlowV4(input.transactions, input.type, now);
  const committed = input.realizedThisMonth + Math.max(0, input.upcoming ?? 0);
  return Math.round(Math.max(committed, avg));
}
