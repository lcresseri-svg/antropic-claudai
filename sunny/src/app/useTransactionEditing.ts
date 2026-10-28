import { useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { Transaction, TransactionType } from '../types';
import { useTransactions } from '../shared/hooks/useTransactions';
import { useTodayRomeISO } from '../shared/hooks/useTodayRomeISO';
import { buildProjectedOccurrences, seriesInstanceUpdates, dissolveSeries } from '../shared/recurrence';
import { buildMerchantIndex, recognizeCategory, Candidate, Recognition } from '../features/transactions/categoryRecognition';
import { isAdminUser } from '../shared/featureFlags';
import { logEvent } from '../shared/analytics/metrics';
import { db } from '../lib/firebase';
import { isCreditCardSettlement } from '../../../functions/src/domain/creditCards';
import { allocateRefundReceipt, refundGroupIdOf, type RefundReceiptDraft } from '../shared/multiRefunds';
import { saveSingleRefund, saveRefundReceipt, deleteRefundReceipt } from '../features/transactions/refundReceiptStore';

type Tx = ReturnType<typeof useTransactions>;

/** Admin-only category recognizer for the transaction form. Builds the merchant
 *  index (memoized on the transaction list) and returns a (description,
 *  candidates) => Recognition|null function — or null for non-admin users, so the
 *  form falls back to the unchanged `guessCategory` path. */
function useCategoryRecognizer(
  user: User,
  transactions: Transaction[],
): ((description: string, candidates: Candidate[]) => Recognition | null) | null {
  const isAdmin = isAdminUser(user);
  const index = useMemo(
    () => (isAdmin ? buildMerchantIndex(transactions) : null),
    [isAdmin, transactions],
  );
  return useMemo(() => {
    if (!isAdmin || !index) return null;
    return (description: string, candidates: Candidate[]) =>
      recognizeCategory({ description, candidates, index });
  }, [isAdmin, index]);
}

/**
 * All the state + handlers behind the transaction modal, the series-detail
 * sheet and the projected ("Programmato") rows. Extracted from App.tsx so the
 * shell stays bootstrap + providers + routing only.
 */
export function useTransactionEditing(user: User, tx: Tx) {
  const todayISO = useTodayRomeISO();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [seriesEdit, setSeriesEdit] = useState(false);
  const [seriesDetail, setSeriesDetail] = useState<Transaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<TransactionType | undefined>();
  const [scheduledDate, setScheduledDate] = useState<string | undefined>();
  // Sheet "Registra storno". `expenseId` = spesa già scelta (dal suo dettaglio);
  // assente = la sheet la fa scegliere (accesso da "+"). `refundEditing` = storno
  // esistente in modifica.
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundExpenseId, setRefundExpenseId] = useState<string | undefined>();
  const [refundEditing, setRefundEditing] = useState<Transaction | undefined>();
  const singleRefundId = useRef('');
  const [multiRefundOpen, setMultiRefundOpen] = useState(false);
  const [multiRefundExpenseIds, setMultiRefundExpenseIds] = useState<string[]>([]);
  const [multiRefundGroupId, setMultiRefundGroupId] = useState<string | undefined>();
  const [multiRefundLoading, setMultiRefundLoading] = useState(false);
  const [multiRefundError, setMultiRefundError] = useState('');
  const receiptRequest = useRef(0);
  const [settlementDetail, setSettlementDetail] = useState<Transaction | null>(null);

  // Virtual future occurrences of every recurring template — shown ahead of time
  // as "Programmato" rows, up to `until` or a rolling 12-month horizon. These are
  // display-only and never written to Firestore.
  const projected = useMemo(() => {
    const horizon = new Date(`${todayISO}T12:00:00Z`);
    horizon.setUTCFullYear(horizon.getUTCFullYear() + 1);
    return buildProjectedOccurrences(tx.transactions, todayISO, horizon.toISOString().slice(0, 10));
  }, [tx.transactions, todayISO]);

  // Admin-only category recognizer injected into the transaction form (null for
  // everyone else → the form keeps the unchanged guessCategory behaviour).
  const recognize = useCategoryRecognizer(user, tx.transactions);

  // Resolve the template (series anchor) for any occurrence carrying a seriesId.
  // Searches the FULL set (allTransactions) so an ENDED series — whose template
  // is an expired, hidden doc — is still found and stays editable as a series.
  const findTemplate = (t: Transaction): Transaction | undefined =>
    tx.allTransactions.find(x => x.recurring && (x.seriesId ?? x.id) === (t.seriesId ?? t.id));

  const startEdit = (t: Transaction, asSeries: boolean) => {
    if (isCreditCardSettlement(t)) { setSettlementDetail(t); return; }
    if (refundGroupIdOf(t) || t.type === 'refund') { openRefund(undefined, t); return; }
    setEditing(t); setSeriesEdit(asSeries); setModalOpen(true);
  };

  const openAdd = () => { setEditing(null); setSeriesEdit(false); setDefaultType(undefined); setModalOpen(true); };

  // Quick-add from the Dashboard: pre-set the transaction type.
  const openAddWithType = (type: TransactionType) => {
    setEditing(null); setSeriesEdit(false); setDefaultType(type); setModalOpen(true);
  };

  // Tapping anything that belongs to a series (template, recorded occurrence,
  // projected row) opens the SERIES DETAIL sheet — summary + actions. Plain
  // one-off movements go straight to the edit modal as before.
  const openEdit = (t: Transaction) => {
    // Uno storno si modifica dalla SUA sheet: lì vive il vincolo sul massimo
    // stornabile e il legame con la spesa, che la modale generica non conosce.
    if (isCreditCardSettlement(t)) {
      setSettlementDetail(t);
    } else if (refundGroupIdOf(t) || t.type === 'refund') {
      openRefund(undefined, t);
    } else if (t.projected || t.recurring || t.seriesId) {
      setSeriesDetail(t);
    } else {
      startEdit(t, false);
    }
  };

  /** Apre la sheet storno: su una spesa specifica, in modifica, o "scegli spesa". */
  const openRefund = (expenseId?: string, editingRefund?: Transaction) => {
    const groupId = editingRefund && refundGroupIdOf(editingRefund);
    if (groupId) { void openMultiRefundReceipt(groupId); return; }
    singleRefundId.current = editingRefund?.id ?? crypto.randomUUID();
    setRefundExpenseId(expenseId);
    setRefundEditing(editingRefund);
    setRefundOpen(true);
  };

  const openMultiRefundReceipt = async (groupId: string) => {
    const request = ++receiptRequest.current;
    setMultiRefundGroupId(groupId); setMultiRefundExpenseIds([]);
    setMultiRefundLoading(true); setMultiRefundError(''); setMultiRefundOpen(true);
    try {
      const header = await getDocFromServer(doc(db, 'users', user.uid, 'refundReceipts', groupId));
      const expenseIds = header.data()?.expenseIds;
      if (!header.exists() || !Array.isArray(expenseIds) || !expenseIds.length || expenseIds.some(id => typeof id !== 'string')) {
        throw new Error('Ricevuta non disponibile. Aggiorna i dati e riaprila.');
      }
      if (request === receiptRequest.current) setMultiRefundExpenseIds(expenseIds);
    } catch (error) {
      if (request === receiptRequest.current) setMultiRefundError(error instanceof Error ? error.message : 'Impossibile caricare la ricevuta. Riaprila per riprovare.');
    } finally {
      if (request === receiptRequest.current) setMultiRefundLoading(false);
    }
  };

  const openSelectedRefund = (expenseIds: string[]) => {
    const sources = expenseIds.map(id => tx.transactions.find(t => t.id === id));
    if (sources.some(t => !t)) throw new Error('Una spesa non è più disponibile.');
    allocateRefundReceipt(sources as Transaction[], tx.transactions, 0.01);
    if (expenseIds.length === 1) { openRefund(expenseIds[0]); return; }
    receiptRequest.current++;
    setMultiRefundExpenseIds(expenseIds); setMultiRefundGroupId(undefined);
    setMultiRefundLoading(false); setMultiRefundError(''); setMultiRefundOpen(true);
  };

  const closeMultiRefund = () => {
    receiptRequest.current++; setMultiRefundOpen(false); setMultiRefundExpenseIds([]);
    setMultiRefundGroupId(undefined); setMultiRefundLoading(false); setMultiRefundError('');
  };

  const saveMultiRefund = async (draft: RefundReceiptDraft) => {
    await saveRefundReceipt(db, user.uid, draft);
    if (!multiRefundGroupId) logEvent(user.uid, 'tx_add');
  };

  const deleteMultiRefund = async () => {
    if (!multiRefundGroupId) return;
    await deleteRefundReceipt(db, user.uid, multiRefundGroupId);
  };

  const closeRefund = () => {
    setRefundOpen(false);
    setRefundExpenseId(undefined);
    setRefundEditing(undefined);
    singleRefundId.current = '';
  };

  /** Salva/aggiorna uno storno. La modifica avviene IN PLACE (stesso doc), così
   *  saldo e statistiche si ricalcolano da soli al prossimo snapshot. */
  const saveRefund = async (data: Omit<Transaction, 'id'>, editingId?: string) => {
    // Identity belongs to the open flow, so failed writes/retries target the
    // same document and contend with multi receipts on the source control.
    const id = editingId ?? (singleRefundId.current ||= crypto.randomUUID());
    await saveSingleRefund(db, user.uid, id, data);
    if (!editingId) logEvent(user.uid, 'tx_add');
  };

  // Group siblings of the doc being edited (the SETTLEMENT transfers of a shared
  // expense — i.e. the others' share coming back — or the commission of a
  // transfer/investment). NB: unrelated to `type: 'refund'` (storno di una
  // spesa), which is linked via refundOf, not groupId. For SERIES members, only
  // siblings on the SAME DATE count: a shared series propagates its groupId to
  // every occurrence (each settlement is its own lockstep series), so month N's
  // expense must fold ONLY month N's settlement — never another month's.
  const groupTransfers = (editing?.groupId && (editing.type === 'expense' || editing.type === 'transfer' || editing.type === 'investment'))
    ? tx.transactions.filter(t =>
        t.groupId === editing.groupId && t.id !== editing.id &&
        (!editing.seriesId || t.date === editing.date))
    : [];

  // Returns a Promise that settles with the underlying writes: the modal AWAITS
  // it for all existing edits and investments so failures keep the draft open.
  // Plain new movements retain their offline-safe path.
  const handleSave = async (deleteIds: string[], create: Omit<Transaction, 'id'>[]): Promise<void> => {
    // Simple single-document edit → update IN PLACE (same id, no delete), so an
    // already-inserted transaction is never removed by the code. Group restructures
    // (split expense / commission → multiple docs) still go through replaceGroup.
    if (editing && deleteIds.length === 1 && deleteIds[0] === editing.id && create.length === 1) {
      // DISSOLVE: editing the whole series and turning OFF "ricorrente". The edited
      // template becomes a normal one-off (no rule, no series link); future
      // occurrences are deleted and past recorded ones are unlinked (→ normal, no
      // recurring badge). User-initiated, so the future-delete is intended here.
      if (seriesEdit && editing.recurring && !create[0].recurring) {
        const sid = editing.seriesId ?? editing.id;
        await tx.replaceInPlace(editing.id, {
          ...create[0], recurring: undefined, seriesId: undefined,
          createdAt: editing.createdAt ?? Date.now(),
        });
        const { unlink, remove } = dissolveSeries(tx.allTransactions, { id: editing.id, seriesId: sid }, todayISO);
        for (const u of unlink) await tx.replaceInPlace(u.id, u.data);
        if (remove.length) await tx.deleteTransactions(remove);
        return;
      }
      const payload = { ...create[0], createdAt: editing.createdAt ?? Date.now() };
      await tx.replaceInPlace(editing.id, payload);
      // Editing the whole SERIES propagates the change to every already-recorded
      // ("contabilizzata") occurrence too — not just the template + future
      // projections. Each occurrence keeps its OWN date/id/link; only the content
      // changes. In place (setDoc, same id), so nothing is ever deleted.
      if (seriesEdit) {
        for (const u of seriesInstanceUpdates(tx.allTransactions, editing, payload)) {
          await tx.replaceInPlace(u.id, u.data);
        }
      }
    } else {
      await tx.replaceGroup(deleteIds, create);
    }
    // metrics: count brand-new adds only.
    if (!editing) logEvent(user.uid, 'tx_add');
  };

  return {
    scheduledDate,
    openScheduledExpense: (date: string) => { setScheduledDate(date); openAddWithType('expense'); },
    editing, seriesEdit, seriesDetail, modalOpen, defaultType,
    projected, recognize, groupTransfers,
    openAdd, openAddWithType, openEdit, startEdit, findTemplate, handleSave,
    refundOpen, refundExpenseId, refundEditing, openRefund, closeRefund, saveRefund,
    multiRefundOpen, multiRefundExpenseIds, multiRefundGroupId, multiRefundLoading, multiRefundError,
    openSelectedRefund, closeMultiRefund, saveMultiRefund, deleteMultiRefund,
    settlementDetail, closeSettlementDetail: () => setSettlementDetail(null),
    closeModal: () => { setModalOpen(false); setScheduledDate(undefined); },
    closeSeriesDetail: () => setSeriesDetail(null),
  };
}
