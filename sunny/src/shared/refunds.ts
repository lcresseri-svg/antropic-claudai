/**
 * Storni / rimborsi — PURE helper (no React, no Firestore).
 *
 * Uno storno (`type: 'refund'`) è SEMPRE collegato a una spesa esistente via
 * `refundOf`. Su una stessa spesa possono esisterne più d'uno, totali o parziali.
 *
 * DUE VISTE, una sola verità:
 *
 *   CASSA      la spesa originale resta INTATTA (esce tutto il suo importo alla
 *              sua data) e lo storno accredita il conto alla SUA data reale.
 *              Non è un'entrata: nel flusso ha un componente suo
 *              (`refundsReceived`), che confluisce in cashIn senza inquinare le
 *              entrate ordinarie. Vedi `financialFlow.ts`.
 *
 *   STATISTICA lo storno riduce la spesa NEL MESE DELLA SPESA, anche quando
 *              arriva mesi dopo: `applyRefunds` scrive `refundedTotal` sulla
 *              spesa e `ownShare` lo sottrae. Così categorie, budget, insight,
 *              forecast, recap e trend vedono la spesa netta senza che nessuno
 *              di loro debba sapere che gli storni esistono.
 *
 * `refundedTotal` è un campo DERIVATO client-side, mai persistito: il documento
 * della spesa non viene mai toccato, lo storico reale resta fedele.
 */
import { Transaction, grossOwnShare } from '../types';

/** True per i movimenti di storno. */
export function isRefund(t: Pick<Transaction, 'type'>): boolean {
  return t.type === 'refund';
}

/**
 * Totale stornato per ogni spesa. Esclude le righe `projected` (occorrenze
 * virtuali) e, se `todayISO` è dato, gli storni con data futura: un rimborso
 * non ancora incassato non può ridurre una spesa.
 */
export function buildRefundIndex(transactions: Iterable<Transaction>, todayISO?: string): Map<string, number> {
  const byExpense = new Map<string, number>();
  for (const t of transactions) {
    if (!isRefund(t) || t.projected || !t.refundOf) continue;
    if (todayISO && t.date > todayISO) continue;
    byExpense.set(t.refundOf, (byExpense.get(t.refundOf) ?? 0) + t.amount);
  }
  return byExpense;
}

/**
 * Restituisce le transazioni con `refundedTotal` valorizzato sulle spese
 * stornate — l'unico punto in cui gli storni entrano nelle statistiche.
 * Le spese senza storni tornano per riferimento (nessuna copia inutile).
 */
export function applyRefunds(transactions: Transaction[], todayISO?: string): Transaction[] {
  const index = buildRefundIndex(transactions, todayISO);
  if (index.size === 0) return transactions;
  return transactions.map(t => {
    const refunded = t.type === 'expense' ? index.get(t.id) : undefined;
    return refunded ? { ...t, refundedTotal: refunded } : t;
  });
}

/** Gli storni collegati a una spesa, dal più recente. */
export function refundsFor(transactions: Transaction[], expenseId: string): Transaction[] {
  return transactions
    .filter(t => isRefund(t) && t.refundOf === expenseId && !t.projected)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** Stato di rimborso di una spesa. */
export interface RefundSummary {
  /** Quota di tua competenza al lordo degli storni (la base stornabile). */
  gross: number;
  /** Totale già stornato. */
  refunded: number;
  /** Spesa effettiva dopo gli storni (mai negativa). */
  net: number;
  /** Quanto si può ancora stornare (mai negativo). */
  remaining: number;
  /** True quando la spesa è stata stornata per intero. */
  fullyRefunded: boolean;
}

/**
 * Riepilogo degli storni di una spesa. `excludeRefundId` serve in modifica:
 * lo storno che si sta modificando non deve contare contro sé stesso nel
 * calcolo del massimo stornabile.
 */
export function summarizeRefunds(
  expense: Transaction, refunds: Transaction[], excludeRefundId?: string,
): RefundSummary {
  const gross = grossOwnShare(expense);
  const refunded = refunds
    .filter(r => r.id !== excludeRefundId && !r.projected)
    .reduce((s, r) => s + r.amount, 0);
  const net = Math.max(0, gross - refunded);
  return {
    gross,
    refunded,
    net,
    remaining: Math.max(0, gross - refunded),
    fullyRefunded: refunded >= gross - 0.005,
  };
}

/** Le spese stornabili (quota residua > 0), dalla più recente. */
export function refundableExpenses(transactions: Transaction[]): Transaction[] {
  const index = buildRefundIndex(transactions);
  return transactions
    .filter(t => t.type === 'expense' && !t.projected && !t.recurring
      && grossOwnShare(t) - (index.get(t.id) ?? 0) > 0.005)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
