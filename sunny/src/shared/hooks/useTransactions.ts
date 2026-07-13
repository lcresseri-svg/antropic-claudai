import { useState, useEffect, useCallback, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { AccountDef, CategoryDef, Transaction, TransactionPatch, ownShare, investSign } from '../../types';
import { isPending, isExpiredTemplate } from '../recurrence';
import { db } from '../../lib/firebase';
// Every write goes through the controvalore-sync layer: investment movements
// atomically update the category's currentValue (stamped + idempotent), all
// other movements fall through to plain batched writes.
import {
  createTransactionsSynced, replaceTransactionSynced, replaceGroupSynced,
  deleteTransactionsSynced, patchTransactionsSynced,
} from '../../features/investments/investmentValueSync';

export function useTransactions(user: User | null, accounts: AccountDef[] = [], includeInvestments = true, categories: CategoryDef[] = [], enableInvestments = true) {
  const [rawTransactions, setRawTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [synced, setSynced] = useState(false); // true once a SERVER snapshot (not cache) lands
  const [error, setError] = useState<string | null>(null);

  // Expired recurring templates (a series advanced past its `until`) are KEPT in
  // Firestore — never deleted — so an ended series stays resolvable/editable as a
  // series. But they must never appear as a row or feed totals/balances, so the
  // array the whole app consumes hides them. `allTransactions` keeps the full set
  // for series resolution (findTemplate).
  const transactions = useMemo(
    () => rawTransactions.filter(t => !isExpiredTemplate(t)),
    [rawTransactions],
  );

  useEffect(() => {
    if (!user) {
      setRawTransactions([]);
      setLoading(false);
      setSynced(false);
      return;
    }
    setError(null);
    setSynced(false);
    const col = collection(db, 'users', user.uid, 'transactions');
    const q = query(col, orderBy('date', 'desc'));
    return onSnapshot(q, { includeMetadataChanges: true },
      snap => {
        setRawTransactions(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) })));
        setError(null);
        setLoading(false);
        // Only mark "synced" on server-confirmed data — running the recurring
        // catch-up on a stale local cache could duplicate what the server holds.
        if (!snap.metadata.fromCache) setSynced(true);
      },
      err => {
        console.error('Firestore listen error:', err.code, err.message);
        if (err.code === 'permission-denied') {
          setError('Accesso negato da Firestore. Controlla le regole di sicurezza nel progetto Firebase.');
        } else {
          setError('Sincronizzazione non riuscita. I dati mostrati potrebbero non essere aggiornati.');
        }
        setLoading(false);
      },
    );
  // Depend on uid, not the user object — the object reference changes on every
  // token refresh, which would tear down and recreate the listener (and re-read
  // all documents). The listener only needs to restart when the actual user changes.
  }, [user?.uid]);

  // Stamp every newly created document with its creation time — used to break
  // same-date sort ties deterministically (most-recently-added first).
  const withCreatedAt = (tx: Omit<Transaction, 'id'>): Omit<Transaction, 'id'> =>
    ({ ...tx, createdAt: Date.now() });

  const addTransaction = useCallback((tx: Omit<Transaction, 'id'>) => {
    if (!user) return;
    createTransactionsSynced(user.uid, [withCreatedAt(tx)]);
  }, [user]);

  /** Bulk create. `syncInvestments: false` (CSV import) keeps investments
   *  UNMANAGED like legacy data: importing history must never bump the
   *  controvalore the user already reconciled by hand. */
  const addTransactions = useCallback(async (
    txs: Omit<Transaction, 'id'>[],
    opts?: { syncInvestments?: boolean },
  ) => {
    if (!user) return;
    await createTransactionsSynced(user.uid, txs.map(withCreatedAt), opts);
  }, [user]);

  const replaceGroup = useCallback((deleteIds: string[], create: Omit<Transaction, 'id'>[]) => {
    if (!user) return;
    replaceGroupSynced(user.uid, deleteIds, create.map(withCreatedAt));
  }, [user]);

  // Edit a SINGLE document in place: overwrite the SAME doc id (no delete), so
  // an already-inserted transaction is never removed by an edit — only its
  // contents change (and its id/createdAt survive). Investment edits revert the
  // previously applied controvalore delta and apply the new one atomically.
  const replaceInPlace = useCallback((id: string, data: Omit<Transaction, 'id'>) => {
    if (!user) return;
    replaceTransactionSynced(user.uid, id, data);
  }, [user]);

  // Materialize overdue recurring occurrences: create the realized instances and
  // advance their templates to the next date. NON-DESTRUCTIVE — never deletes
  // (an ended series' template is just advanced past `until` → expired/hidden).
  //
  // INDEPENDENT writes (not one all-or-nothing batch): ONE malformed template
  // must not block materialization for EVERY series. Each occurrence is written
  // on its own (with its controvalore effect applied atomically), so a bad row
  // only loses itself. Creates run (and settle) FIRST: templates are only
  // advanced afterwards, so if a create fails the next catch-up retries it
  // (catchUpRecurring dedups already-materialized occurrences → no duplicates).
  const materializeRecurring = useCallback(async (
    creates: Omit<Transaction, 'id'>[],
    advance: { id: string; date: string; seriesId: string }[],
  ) => {
    if (!user || (creates.length === 0 && advance.length === 0)) return;
    const log = (tag: string) => (e: unknown) =>
      console.error(`materializeRecurring: ${tag} failed`, (e as { code?: string })?.code ?? e);

    // 1) Realized instances — each independent so one bad row can't block others.
    await Promise.allSettled(
      creates.map(tx => createTransactionsSynced(user.uid, [withCreatedAt(tx)]).catch(log('create'))),
    );
    // 2) Advance the templates (after the instances exist). No deletions. A
    //    template is a pointer, not a flow: advancing it never touches values,
    //    so the plain (offline-safe) update stays.
    await Promise.allSettled(
      advance.map(a =>
        updateDoc(doc(db, 'users', user.uid, 'transactions', a.id), { date: a.date, seriesId: a.seriesId }).catch(log('advance'))),
    );
  }, [user]);

  const updateTransactions = useCallback((ids: string[], patch: TransactionPatch) => {
    if (!user) return;
    patchTransactionsSynced(user.uid, ids, patch);
  }, [user]);

  const deleteTransaction = useCallback((id: string) => {
    if (!user) return;
    deleteTransactionsSynced(user.uid, [id]);
  }, [user]);

  const deleteTransactions = useCallback((ids: string[]) => {
    if (!user) return;
    deleteTransactionsSynced(user.uid, ids);
  }, [user]);

  const deleteAll = useCallback(async () => {
    if (!user) return;
    // Use the RAW set so a manual "delete everything" also clears expired
    // templates (which are hidden from `transactions`).
    await deleteTransactionsSynced(user.uid, rawTransactions.map(t => t.id));
  }, [user, rawTransactions]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const derived = useMemo(() => {
    const now = new Date();
    const cm = now.getMonth(), cy = now.getFullYear();
    const todayISO = now.toISOString().slice(0, 10);
    const inCurrentMonth = (d: string) => {
      const x = new Date(d);
      return x.getMonth() === cm && x.getFullYear() === cy;
    };

    // Planned (future, non-recurring) movements are forecasts, not realized cash
    // flow: keep them out of month totals, balances and trend until their date.
    const realized = transactions.filter(t => !isPending(t, todayISO));
    const monthTx = realized.filter(t => inCurrentMonth(t.date));

    const monthlyIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthlyExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + ownShare(t), 0);
    // Net invested this month: deposits − withdrawals (direction-aware).
    const monthlyInvestments = enableInvestments
      ? monthTx.filter(t => t.type === 'investment').reduce((s, t) => s + investSign(t) * t.amount, 0)
      : 0;

    // NET deposited capital by category (all-time): initial balance + deposits
    // − withdrawals, floored at 0 per category. Zeroed when the feature is off.
    const investmentByCategory: Record<string, number> = {};
    let investmentTotal = 0;
    if (enableInvestments) {
      for (const c of categories) {
        if (c.kind === 'investment' && c.initialBalance) {
          investmentByCategory[c.id] = (investmentByCategory[c.id] ?? 0) + c.initialBalance;
        }
      }
      for (const t of realized) {
        if (t.type !== 'investment') continue;
        investmentByCategory[t.category] = (investmentByCategory[t.category] ?? 0) + investSign(t) * t.amount;
      }
      for (const id of Object.keys(investmentByCategory)) {
        investmentByCategory[id] = Math.max(0, investmentByCategory[id]);
        investmentTotal += investmentByCategory[id];
      }
    }

    // Per-account balance (initial balance + cash flow through the account)
    const accountBalances: Record<string, number> = {};
    for (const a of accounts) {
      if (a.initialBalance) accountBalances[a.id] = a.initialBalance;
    }
    for (const t of realized) {
      // Ignore an empty account id: a source-less investment (TFR / employer
      // contribution) adds to invested capital without drawing from any account.
      const bal = (id: string, delta: number) => { if (!id) return; accountBalances[id] = (accountBalances[id] ?? 0) + delta; };
      if (t.type === 'income') bal(t.account, t.amount);
      // Deposit debits the source account; withdrawal CREDITS the destination.
      else if (t.type === 'investment') bal(t.account, -investSign(t) * t.amount);
      else if (t.type === 'expense') bal(t.account, -ownShare(t));
      else if (t.type === 'transfer') { bal(t.account, -t.amount); if (t.toAccount) bal(t.toAccount, t.amount); }
    }
    const liquidity = Object.values(accountBalances).reduce((s, v) => s + v, 0);
    const netWorth = includeInvestments ? liquidity + investmentTotal : liquidity;

    // Spending by category (current month, expenses)
    const categoryTotals: Record<string, number> = {};
    for (const t of monthTx) {
      if (t.type !== 'expense') continue;
      categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + ownShare(t);
    }

    // Spending by account (current month, expenses)
    const expenseByAccount: Record<string, number> = {};
    for (const t of monthTx) {
      if (t.type !== 'expense') continue;
      expenseByAccount[t.account] = (expenseByAccount[t.account] ?? 0) + ownShare(t);
    }

    // 12-month trend
    const trend: { key: string; income: number; expense: number; invest: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(cy, cm - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trend.push({ key, income: 0, expense: 0, invest: 0 });
    }
    for (const t of realized) {
      const key = t.date.slice(0, 7);
      const slot = trend.find(s => s.key === key);
      if (!slot) continue;
      if (t.type === 'income') slot.income += t.amount;
      else if (t.type === 'expense') slot.expense += ownShare(t);
      else if (t.type === 'investment' && enableInvestments) slot.invest += investSign(t) * t.amount;
    }

    const recent = [...realized]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    return {
      monthlyIncome, monthlyExpenses, monthlyInvestments, investmentTotal, investmentByCategory,
      accountBalances, liquidity, netWorth, categoryTotals, expenseByAccount, trend,
      recentTransactions: recent, monthTx,
    };
  }, [transactions, accounts, includeInvestments, categories, enableInvestments]);

  return {
    transactions, allTransactions: rawTransactions, loading, synced, error,
    addTransaction, addTransactions, replaceGroup, replaceInPlace, materializeRecurring,
    updateTransactions,
    deleteTransaction, deleteTransactions, deleteAll,
    ...derived,
  };
}
