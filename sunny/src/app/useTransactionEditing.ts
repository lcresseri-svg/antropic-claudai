import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { Transaction, TransactionType } from '../types';
import { useTransactions } from '../shared/hooks/useTransactions';
import { buildProjectedOccurrences, seriesInstanceUpdates, dissolveSeries } from '../shared/recurrence';
import { buildMerchantIndex, recognizeCategory, Candidate, Recognition } from '../features/transactions/categoryRecognition';
import { isAdminUser } from '../shared/featureFlags';
import { logEvent } from '../shared/analytics/metrics';

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
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [seriesEdit, setSeriesEdit] = useState(false);
  const [seriesDetail, setSeriesDetail] = useState<Transaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<TransactionType | undefined>();

  // Virtual future occurrences of every recurring template — shown ahead of time
  // as "Programmato" rows, up to `until` or a rolling 12-month horizon. These are
  // display-only and never written to Firestore.
  const projected = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const horizon = new Date(); horizon.setFullYear(horizon.getFullYear() + 1);
    return buildProjectedOccurrences(tx.transactions, todayISO, horizon.toISOString().slice(0, 10));
  }, [tx.transactions]);

  // Admin-only category recognizer injected into the transaction form (null for
  // everyone else → the form keeps the unchanged guessCategory behaviour).
  const recognize = useCategoryRecognizer(user, tx.transactions);

  // Resolve the template (series anchor) for any occurrence carrying a seriesId.
  // Searches the FULL set (allTransactions) so an ENDED series — whose template
  // is an expired, hidden doc — is still found and stays editable as a series.
  const findTemplate = (t: Transaction): Transaction | undefined =>
    tx.allTransactions.find(x => x.recurring && (x.seriesId ?? x.id) === (t.seriesId ?? t.id));

  const startEdit = (t: Transaction, asSeries: boolean) => {
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
    if (t.projected || t.recurring || t.seriesId) {
      setSeriesDetail(t);
    } else {
      startEdit(t, false);
    }
  };

  // Group siblings of the doc being edited (storni of a shared expense, or the
  // commission of a transfer/investment). For SERIES members, only siblings on
  // the SAME DATE count: a shared series propagates its groupId to every
  // occurrence (the storno is its own lockstep series), so month N's expense
  // must fold ONLY month N's storno — never another month's transfers.
  const groupTransfers = (editing?.groupId && (editing.type === 'expense' || editing.type === 'transfer' || editing.type === 'investment'))
    ? tx.transactions.filter(t =>
        t.groupId === editing.groupId && t.id !== editing.id &&
        (!editing.seriesId || t.date === editing.date))
    : [];

  const handleSave = (deleteIds: string[], create: Omit<Transaction, 'id'>[]) => {
    const todayISO = new Date().toISOString().slice(0, 10);
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
        tx.replaceInPlace(editing.id, {
          ...create[0], recurring: undefined, seriesId: undefined,
          createdAt: editing.createdAt ?? Date.now(),
        });
        const { unlink, remove } = dissolveSeries(tx.allTransactions, { id: editing.id, seriesId: sid }, todayISO);
        for (const u of unlink) tx.replaceInPlace(u.id, u.data);
        if (remove.length) tx.deleteTransactions(remove);
        return;
      }
      const payload = { ...create[0], createdAt: editing.createdAt ?? Date.now() };
      tx.replaceInPlace(editing.id, payload);
      // Editing the whole SERIES propagates the change to every already-recorded
      // ("contabilizzata") occurrence too — not just the template + future
      // projections. Each occurrence keeps its OWN date/id/link; only the content
      // changes. In place (setDoc, same id), so nothing is ever deleted.
      if (seriesEdit) {
        for (const u of seriesInstanceUpdates(tx.allTransactions, editing, payload)) {
          tx.replaceInPlace(u.id, u.data);
        }
      }
    } else {
      tx.replaceGroup(deleteIds, create);
    }
    // metrics: count brand-new adds only.
    if (!editing) logEvent(user.uid, 'tx_add');
  };

  return {
    editing, seriesEdit, seriesDetail, modalOpen, defaultType,
    projected, recognize, groupTransfers,
    openAdd, openAddWithType, openEdit, startEdit, findTemplate, handleSave,
    closeModal: () => setModalOpen(false),
    closeSeriesDetail: () => setSeriesDetail(null),
  };
}
