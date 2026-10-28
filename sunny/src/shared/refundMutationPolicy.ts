import { grossOwnShare, type Transaction } from '../types';
import { isCreditCardSettlement } from '../../../functions/src/domain/creditCards';
/** Snapshot guard for legacy refunds; the writer also checks authoritative
 * allocation controls in its source transaction to serialize concurrent edits. */
export function assertOrdinaryMutation(before:Transaction, next:Omit<Transaction,'id'>|null, transactions:readonly Transaction[]) {
  if (isCreditCardSettlement(before) || next?.creditCardSettlement) throw new Error('Gli addebiti carta sono automatici: modifica i movimenti originali.');
  if (before.refundGroupId || next?.refundGroupId) throw new Error('Modifica o elimina la ricevuta di rimborso completa.');
  if (before.type !== 'expense') return;
  const refunds = transactions.filter(t=>t.type==='refund' && t.refundOf===before.id && !t.projected);
  if (!refunds.length) return;
  if (!next && refunds.some(t=>t.refundGroupId)) throw new Error('La spesa è collegata a un rimborso multiplo: modifica o elimina prima il rimborso.');
  if (next && (next.type!=='expense' || next.recurring || next.projected || grossOwnShare({...next,id:before.id}) + 0.005 < refunds.reduce((s,t)=>s+t.amount,0))) {
    throw new Error('La spesa è collegata a rimborsi: il suo importo non può essere inferiore alla quota già rimborsata.');
  }
}
