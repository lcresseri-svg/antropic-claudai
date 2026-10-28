/** Pure allocation for a real receipt. Original expenses/dates are never rewritten. */
import { grossOwnShare, type Transaction } from '../types';

export const MAX_REFUND_SOURCES = 100;
export const REFUND_GAIN_CATEGORY = '__refund_gain__';
export interface RefundReceiptDraft {
  receiptId: string;
  expenseIds: string[];
  amount: number;
  date: string;
  account: string;
  notes?: string;
}
export interface RefundAllocation {
  expenseId: string;
  availableCents: number;
  allocatedCents: number;
  remainingCents: number;
}
export interface RefundReceiptAllocation {
  allocations: RefundAllocation[];
  availableCents: number;
  receivedCents: number;
  refundedCents: number;
  gainCents: number;
  remainingCents: number;
}

export function refundAllocationRowId(receiptId: string, expenseId: string): string {
  return `${receiptId}__refund__${expenseId}`;
}

export function refundGroupIdOf(t: Transaction): string | undefined {
  return (t as Transaction & { refundGroupId?: string }).refundGroupId;
}
export function toRefundCents(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) throw new Error('Importo non valido.');
  return Math.round((amount + Number.EPSILON) * 100);
}
export function isRefundableSource(t: Transaction): boolean {
  return t.type === 'expense' && !t.projected && !t.recurring
    && !('creditCardSettlement' in t && t.creditCardSettlement);
}

/** Used by both the preview and the transactional repository's authoritative inputs. */
export function allocateRefundCents(
  available: { expenseId: string; availableCents: number }[], receivedCents: number,
): RefundReceiptAllocation {
  if (!available.length || available.length > MAX_REFUND_SOURCES || new Set(available.map(a => a.expenseId)).size !== available.length) {
    throw new Error(`Seleziona da 1 a ${MAX_REFUND_SOURCES} spese diverse.`);
  }
  if (!Number.isSafeInteger(receivedCents) || receivedCents <= 0 || receivedCents > 100_000_000_000
      || available.some(a => !Number.isSafeInteger(a.availableCents) || a.availableCents <= 0)) {
    throw new Error('Una spesa non ha più un importo rimborsabile. Aggiorna la selezione.');
  }
  const total = available.reduce((sum, a) => sum + a.availableCents, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Importo totale non valido.');
  const covered = Math.min(total, receivedCents);
  // Integer products can exceed Number.MAX_SAFE_INTEGER even for valid individual
  // amounts. BigInt preserves cents and remainder ordering across the full range.
  const denominator = BigInt(total);
  const work = available.map(a => {
    const numerator = BigInt(a.availableCents) * BigInt(covered);
    return { ...a, allocatedCents: Number(numerator / denominator), remainder: numerator % denominator };
  });
  let unassigned = covered - work.reduce((sum, a) => sum + a.allocatedCents, 0);
  const ranked = [...work].sort((a, b) => a.remainder === b.remainder
    ? (a.expenseId < b.expenseId ? -1 : a.expenseId > b.expenseId ? 1 : 0)
    : a.remainder > b.remainder ? -1 : 1);
  for (const row of ranked) { if (unassigned-- <= 0) break; row.allocatedCents++; }
  return {
    allocations: work.map(({ remainder: _, ...a }) => ({ ...a, remainingCents: a.availableCents - a.allocatedCents })),
    availableCents: total, receivedCents, refundedCents: covered,
    gainCents: receivedCents - covered, remainingCents: total - covered,
  };
}

export function allocateRefundReceipt(
  sources: Transaction[], transactions: Transaction[], amount: number, excludeGroupId?: string,
): RefundReceiptAllocation {
  if (sources.some(t => !isRefundableSource(t))) throw new Error('Seleziona soltanto spese reali, senza proiezioni o serie.');
  const refunded = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'refund' || !t.refundOf || t.projected || (excludeGroupId && refundGroupIdOf(t) === excludeGroupId)) continue;
    refunded.set(t.refundOf, (refunded.get(t.refundOf) ?? 0) + toRefundCents(t.amount));
  }
  return allocateRefundCents(sources.map(t => ({ expenseId: t.id,
    availableCents: Math.max(0, toRefundCents(grossOwnShare(t)) - (refunded.get(t.id) ?? 0)),
  })), toRefundCents(amount));
}
