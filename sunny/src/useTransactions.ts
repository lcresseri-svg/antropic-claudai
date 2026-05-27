import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, deleteDoc, doc, writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { Transaction, Category } from './types';
import { demoTransactions } from './demoData';
import { db } from './firebase';

export function useTransactions(user: User | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTransactions(demoTransactions);
      setLoading(false);
      return;
    }

    const col = collection(db, 'users', user.uid, 'transactions');
    const q = query(col, orderBy('date', 'desc'));
    let seeded = false;

    const unsub = onSnapshot(q, async snapshot => {
      if (snapshot.empty && !seeded) {
        seeded = true;
        const batch = writeBatch(db);
        demoTransactions.forEach(({ id: _id, ...data }) => {
          batch.set(doc(col), data);
        });
        await batch.commit();
        return;
      }
      setTransactions(
        snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Transaction, 'id'>) })),
      );
      setLoading(false);
    });

    return unsub;
  }, [user]);

  const addTransaction = useCallback(
    (tx: Omit<Transaction, 'id'>) => {
      if (!user) return;
      addDoc(collection(db, 'users', user.uid, 'transactions'), tx);
    },
    [user],
  );

  const addTransactions = useCallback(
    (txs: Omit<Transaction, 'id'>[]) => {
      if (!user) return;
      const col = collection(db, 'users', user.uid, 'transactions');
      const batch = writeBatch(db);
      txs.forEach(tx => batch.set(doc(col), tx));
      batch.commit();
    },
    [user],
  );

  const deleteTransaction = useCallback(
    (id: string) => {
      if (!user) return;
      deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
    },
    [user],
  );

  // ── Derived values ────────────────────────────────────────────────────────
  const now = new Date();
  const cm = now.getMonth();
  const cy = now.getFullYear();

  const currentMonthTx = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === cm && d.getFullYear() === cy;
  });

  const totalBalance = transactions.reduce((s, tx) => {
    if (tx.type === 'income') return s + tx.amount;
    if (tx.type === 'expense') return s - tx.amount;
    if (tx.type === 'investment') return s - tx.amount;
    return s; // transfer: neutral
  }, 0);

  const investmentTotal = transactions
    .filter(tx => tx.type === 'investment')
    .reduce((s, tx) => s + tx.amount, 0);

  const monthlyIncome = currentMonthTx
    .filter(tx => tx.type === 'income')
    .reduce((s, tx) => s + tx.amount, 0);

  const monthlyExpenses = currentMonthTx
    .filter(tx => tx.type === 'expense')
    .reduce((s, tx) => s + tx.amount, 0);

  const monthlyInvestments = currentMonthTx
    .filter(tx => tx.type === 'investment')
    .reduce((s, tx) => s + tx.amount, 0);

  const categoryTotals = currentMonthTx
    .filter(tx => tx.type === 'expense')
    .reduce<Partial<Record<Category, number>>>((acc, tx) => {
      acc[tx.category] = (acc[tx.category] ?? 0) + tx.amount;
      return acc;
    }, {});

  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);

  return {
    transactions,
    recentTransactions,
    addTransaction,
    addTransactions,
    deleteTransaction,
    totalBalance,
    investmentTotal,
    monthlyIncome,
    monthlyExpenses,
    monthlyInvestments,
    categoryTotals,
    loading,
  };
}
