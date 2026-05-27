import { useState, useEffect, useCallback } from 'react';
import { Transaction, Category } from './types';
import { demoTransactions } from './demoData';

const STORAGE_KEY = 'sunny_transactions_v1';

function loadFromStorage(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : demoTransactions;
  } catch {
    return demoTransactions;
  }
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>(loadFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    } catch {
      // storage full — silent fail
    }
  }, [transactions]);

  const addTransaction = useCallback((tx: Omit<Transaction, 'id'>) => {
    setTransactions(prev => [{ ...tx, id: `t_${Date.now()}` }, ...prev]);
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, []);

  const now = new Date();
  const cm = now.getMonth();
  const cy = now.getFullYear();

  const currentMonthTx = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d.getMonth() === cm && d.getFullYear() === cy;
  });

  const totalBalance = transactions.reduce(
    (sum, tx) => (tx.type === 'income' ? sum + tx.amount : sum - tx.amount),
    0,
  );

  const monthlyIncome = currentMonthTx
    .filter(tx => tx.type === 'income')
    .reduce((s, tx) => s + tx.amount, 0);

  const monthlyExpenses = currentMonthTx
    .filter(tx => tx.type === 'expense')
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
    deleteTransaction,
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    categoryTotals,
    currentMonthTx,
  };
}
