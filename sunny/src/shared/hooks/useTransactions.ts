import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { Transaction, TransactionPatch, ownShare } from '../../types';
import { db } from '../../lib/firebase';

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export function useTransactions(user: User | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    setError(null);
    const col = collection(db, 'users', user.uid, 'transactions');
    const q = query(col, orderBy('date', 'desc'));
    return onSnapshot(q,
      snap => {
        setTransactions(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) })));
        setError(null);
        setLoading(false);
      },
      err => {
        console.error('Firestore listen error:', err.code, err.message);
        // 'permission-denied' is expected during account deletion — don't alarm the user.
        if (err.code !== 'permission-denied') {
          setError('Sincronizzazione non riuscita. I dati mostrati potrebbero non essere aggiornati.');
        }
        setLoading(false);
      },
    );
  }, [user]);

  const colRef = useCallback(() => collection(db, 'users', user!.uid, 'transactions'), [user]);

  const addTransaction = useCallback((tx: Omit<Transaction, 'id'>) => {
    if (!user) return;
    addDoc(colRef(), stripUndefined(tx));
  }, [user, colRef]);

  const addTransactions = useCallback((txs: Omit<Transaction, 'id'>[]) => {
    if (!user) return;
    const batch = writeBatch(db);
    txs.forEach(tx => batch.set(doc(colRef()), stripUndefined(tx)));
    batch.commit();
  }, [user, colRef]);

  const replaceGroup = useCallback((deleteIds: string[], create: Omit<Transaction, 'id'>[]) => {
    if (!user) return;
    const batch = writeBatch(db);
    deleteIds.forEach(id => batch.delete(doc(db, 'users', user.uid, 'transactions', id)));
    create.forEach(tx => batch.set(doc(colRef()), stripUndefined(tx)));
    batch.commit();
  }, [user, colRef]);

  const updateTransaction = useCallback((id: string, patch: Partial<Omit<Transaction, 'id'>>) => {
    if (!user) return;
    updateDoc(doc(db, 'users', user.uid, 'transactions', id), stripUndefined(patch));
  }, [user]);

  const updateTransactions = useCallback((ids: string[], patch: TransactionPatch) => {
    if (!user) return;
    const batch = writeBatch(db);
    const clean = stripUndefined(patch);
    ids.forEach(id => batch.update(doc(db, 'users', user.uid, 'transactions', id), clean));
    batch.commit();
  }, [user]);

  const deleteTransaction = useCallback((id: string) => {
    if (!user) return;
    deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
  }, [user]);

  const deleteTransactions = useCallback((ids: string[]) => {
    if (!user) return;
    const batch = writeBatch(db);
    ids.forEach(id => batch.delete(doc(db, 'users', user.uid, 'transactions', id)));
    batch.commit();
  }, [user]);

  const deleteAll = useCallback(async () => {
    if (!user) return;
    const ids = transactions.map(t => t.id);
    for (let i = 0; i < ids.length; i += 450) {
      const batch = writeBatch(db);
      ids.slice(i, i + 450).forEach(id => batch.delete(doc(db, 'users', user.uid, 'transactions', id)));
      await batch.commit();
    }
  }, [user, transactions]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const derived = useMemo(() => {
    const now = new Date();
    const cm = now.getMonth(), cy = now.getFullYear();
    const inCurrentMonth = (d: string) => {
      const x = new Date(d);
      return x.getMonth() === cm && x.getFullYear() === cy;
    };

    const monthTx = transactions.filter(t => inCurrentMonth(t.date));

    const monthlyIncome = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthlyExpenses = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + ownShare(t), 0);
    const monthlyInvestments = monthTx.filter(t => t.type === 'investment').reduce((s, t) => s + t.amount, 0);

    const investmentTotal = transactions.filter(t => t.type === 'investment').reduce((s, t) => s + t.amount, 0);

    // Per-account balance (cash flow through the account)
    const accountBalances: Record<string, number> = {};
    for (const t of transactions) {
      const bal = (id: string, delta: number) => { accountBalances[id] = (accountBalances[id] ?? 0) + delta; };
      if (t.type === 'income') bal(t.account, t.amount);
      else if (t.type === 'investment') bal(t.account, -t.amount);
      else if (t.type === 'expense') bal(t.account, -ownShare(t));
      else if (t.type === 'transfer') { bal(t.account, -t.amount); if (t.toAccount) bal(t.toAccount, t.amount); }
    }
    const liquidity = Object.values(accountBalances).reduce((s, v) => s + v, 0);
    const netWorth = liquidity + investmentTotal;

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

    // 6-month trend
    const trend: { key: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(cy, cm - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      trend.push({ key, income: 0, expense: 0 });
    }
    for (const t of transactions) {
      const key = t.date.slice(0, 7);
      const slot = trend.find(s => s.key === key);
      if (!slot) continue;
      if (t.type === 'income') slot.income += t.amount;
      else if (t.type === 'expense') slot.expense += ownShare(t);
    }

    const recent = [...transactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    return {
      monthlyIncome, monthlyExpenses, monthlyInvestments, investmentTotal,
      accountBalances, liquidity, netWorth, categoryTotals, expenseByAccount, trend,
      recentTransactions: recent, monthTx,
    };
  }, [transactions]);

  return {
    transactions, loading, error,
    addTransaction, addTransactions, replaceGroup,
    updateTransaction, updateTransactions,
    deleteTransaction, deleteTransactions, deleteAll,
    ...derived,
  };
}
