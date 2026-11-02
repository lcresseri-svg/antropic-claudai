import { useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDocFromServer } from 'firebase/firestore';
import { Transaction, TransactionType } from '../types';
import { useTransactions } from '../shared/hooks/useTransactions';
import { useTodayRomeISO } from '../shared/hooks/useTodayRomeISO';
import { buildProjectedOccurrences, seriesInstanceUpdates, futureSeriesPayloads, dissolveSeries } from '../shared/recurrence';
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

  const openSeriesEdit = (t: Transaction) => {
    const template = findTemplate(t);
    // A deleted/absent template must not silently turn "edit series" into
    // an edit of the historical occurrence used to open the detail.
    if (!template) return;
    setSeriesDetail(null);
    startEdit(template, true);
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
        t.date === editing.date && (editing.recurring
          ? !!t.recurring || (t.date > todayISO && t.type === 'expense' && editing.type !== 'expense')
          : !t.recurring))
    : [];

  // Returns a Promise that settles with the underlying writes: the modal AWAITS
  // it for all existing edits and investments so failures keep the draft open.
  // Plain new movements retain their offline-safe path.
  const handleSave = async (deleteIds: string[], create: Omit<Transaction, 'id'>[]): Promise<void> => {
    if (seriesEdit && editing?.recurring) create = futureSeriesPayloads(create, todayISO);
    if (!seriesEdit && editing?.seriesId && !editing.recurring) {
      create = create.map(data => ({ ...data, seriesOverride: data.recurring ? undefined : true }));
    }
    if (seriesEdit && editing?.recurring) {
      const originals = tx.allTransactions.filter(t => deleteIds.includes(t.id));
      const templates = originals.filter(t => t.recurring);
      const pairs = templates.map(template => ({template, next:create.find(data => data.recurring && data.seriesId === (template.seriesId ?? template.id))}));
      // Stable series membership: template(s) and all ordinary instances commit
      // together, so a rejected refund or network failure cannot partially apply.
      if (originals.length === deleteIds.length && templates.length === originals.length && create.length === pairs.length && pairs.every(pair => pair.next)) {
        const changes = pairs.flatMap(({template,next}) => [
          {id:template.id,data:{...next!,createdAt:template.createdAt ?? Date.now()},expectedTemplate:template},
          ...seriesInstanceUpdates(tx.allTransactions,template,next!,todayISO).map(update=>({...update,seriesTemplate:template})),
        ]);
        await tx.replaceSeries(changes);
        return;
      }
      if (deleteIds.length === 1 && deleteIds[0] === editing.id && create.length === 1 && !create[0].recurring) {
        const {unlink,remove} = dissolveSeries(tx.allTransactions,{id:editing.id,seriesId:editing.seriesId ?? editing.id},todayISO);
        await tx.replaceSeries([
          {id:editing.id,data:{...create[0],recurring:undefined,seriesId:undefined,createdAt:editing.createdAt ?? Date.now()},expectedTemplate:editing},
          ...unlink.map(update=>({...update,unlinkSeries:editing.seriesId ?? editing.id})),
          ...remove.map(id=>({id,data:null,seriesTemplate:editing})),
        ]);
        return;
      }
      // Adding/removing linked legs changes the composition of a shared charge
      // or commission. Preserve historical groups as a whole; apply the new
      // composition to the template(s), never to only half an old payment.
      await tx.replaceGroup(deleteIds, create);
      return;
    }
    if (editing && deleteIds.length === 1 && deleteIds[0] === editing.id && create.length === 1) {
      await tx.replaceInPlace(editing.id, {...create[0],createdAt:editing.createdAt ?? Date.now()});
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
    openAdd, openAddWithType, openEdit, startEdit, findTemplate, openSeriesEdit, handleSave,
    refundOpen, refundExpenseId, refundEditing, openRefund, closeRefund, saveRefund,
    multiRefundOpen, multiRefundExpenseIds, multiRefundGroupId, multiRefundLoading, multiRefundError,
    openSelectedRefund, closeMultiRefund, saveMultiRefund, deleteMultiRefund,
    settlementDetail, closeSettlementDetail: () => setSettlementDetail(null),
    closeModal: () => { setModalOpen(false); setScheduledDate(undefined); },
    closeSeriesDetail: () => setSeriesDetail(null),
  };
}
