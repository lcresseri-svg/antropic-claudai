import type { Transaction } from '../../types';
import { localISO, type PeriodRange } from '../dashboard/categoryAnalytics';
import { r2 } from './investmentTransactionBuilder';

/** Actual contributions, without statistical spread or opening balances. */
export function investmentPeriodSummary(transactions: Transaction[], range: PeriodRange) {
  const start = localISO(range.start);
  const end = localISO(range.end);
  let deposits = 0;
  let tfr = 0;
  let returnedCapital = 0;
  for (const tx of transactions) {
    if (tx.type !== 'investment' || tx.projected || tx.recurring || tx.date < start || tx.date > end) continue;
    if (tx.direction === 'out') returnedCapital += tx.amount;
    else {
      deposits += tx.amount;
      tfr += Math.min(tx.amount, Math.max(0, tx.tfr ?? 0));
    }
  }
  return { deposits: r2(deposits), returnedCapital: r2(returnedCapital), tfr: r2(tfr), netDeposits: r2(deposits - returnedCapital - tfr) };
}
