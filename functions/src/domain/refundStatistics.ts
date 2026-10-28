/** Statistical expense view for backend consumers; never changes cash dates. */
export interface RefundStatisticsTransaction {
  id: string;
  type?: string;
  amount?: number;
  shared?: number;
  date?: string;
  refundOf?: string;
  projected?: boolean;
  recurring?: unknown;
  refundedTotal?: number;
}

const cents = (value?: number) => Math.round(((Number(value) || 0) + Number.EPSILON) * 100);

export function withExpenseRefundStatistics<T extends RefundStatisticsTransaction>(transactions: readonly T[], todayISO: string): T[] {
  const refunded = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.type !== 'refund' || !transaction.refundOf || transaction.projected || transaction.recurring
        || !transaction.date || transaction.date > todayISO || !Number.isFinite(transaction.amount) || transaction.amount! <= 0) continue;
    refunded.set(transaction.refundOf, (refunded.get(transaction.refundOf) ?? 0) + cents(transaction.amount));
  }
  return transactions.map(transaction => {
    const { refundedTotal: _derived, ...rest } = transaction;
    const total = transaction.type === 'expense' ? refunded.get(transaction.id) : undefined;
    return { ...rest, ...(total ? { refundedTotal: total / 100 } : {}) } as T;
  });
}

export function refundAdjustedOwnShare(transaction: Pick<RefundStatisticsTransaction,'type'|'amount'|'shared'|'refundedTotal'>): number {
  if (transaction.type !== 'expense') return (Number(transaction.amount) || 0) - (Number(transaction.shared) || 0);
  return Math.max(0, cents(transaction.amount) - cents(transaction.shared) - cents(transaction.refundedTotal)) / 100;
}
