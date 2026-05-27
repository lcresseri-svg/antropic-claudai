import { useState } from 'react';
import { useTransactions } from './useTransactions';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { TransactionList } from './components/TransactionList';
import { AddTransactionModal } from './components/AddTransactionModal';

type View = 'dashboard' | 'transactions';

export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [modalOpen, setModalOpen] = useState(false);

  const {
    transactions,
    recentTransactions,
    addTransaction,
    deleteTransaction,
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    categoryTotals,
  } = useTransactions();

  return (
    <div className="min-h-screen bg-cream">
      <Header
        view={view}
        onViewChange={setView}
        onAdd={() => setModalOpen(true)}
      />

      <main className="max-w-2xl mx-auto px-4 py-5">
        {view === 'dashboard' ? (
          <Dashboard
            totalBalance={totalBalance}
            monthlyIncome={monthlyIncome}
            monthlyExpenses={monthlyExpenses}
            categoryTotals={categoryTotals}
            recentTransactions={recentTransactions}
            onAdd={() => setModalOpen(true)}
            onDeleteTransaction={deleteTransaction}
          />
        ) : (
          <TransactionList
            transactions={transactions}
            onDelete={deleteTransaction}
            onAdd={() => setModalOpen(true)}
          />
        )}
      </main>

      <AddTransactionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAdd={addTransaction}
      />
    </div>
  );
}
