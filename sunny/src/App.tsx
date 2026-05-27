import { useState } from 'react';
import { useAuth } from './useAuth';
import { useTransactions } from './useTransactions';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { TransactionList } from './components/TransactionList';
import { AddTransactionModal } from './components/AddTransactionModal';
import { LoginScreen } from './components/LoginScreen';

type View = 'dashboard' | 'transactions';

export default function App() {
  const { user, loading: authLoading, error: authError, signIn, logOut } = useAuth();
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
    loading: txLoading,
  } = useTransactions(user);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <span className="text-4xl animate-pulse">☀️</span>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onSignIn={signIn} error={authError} />;
  }

  if (txLoading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <span className="text-4xl animate-pulse">☀️</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <Header
        view={view}
        onViewChange={setView}
        onAdd={() => setModalOpen(true)}
        user={user}
        onLogOut={logOut}
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
