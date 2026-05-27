import { useState } from 'react';
import { useAuth } from './useAuth';
import { useTransactions } from './useTransactions';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { TransactionList } from './components/TransactionList';
import { AddTransactionModal } from './components/AddTransactionModal';
import { ImportModal } from './components/ImportModal';
import { LoginScreen } from './components/LoginScreen';

type View = 'dashboard' | 'transactions';

export default function App() {
  const { user, loading: authLoading, error: authError, signIn, logOut } = useAuth();
  const [view, setView] = useState<View>('dashboard');
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const {
    transactions, recentTransactions,
    addTransaction, addTransactions, deleteTransaction,
    totalBalance, investmentTotal,
    monthlyIncome, monthlyExpenses, monthlyInvestments,
    categoryTotals, loading: txLoading,
  } = useTransactions(user);

  if (authLoading || (user && txLoading)) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <span className="text-4xl animate-pulse">☀️</span>
      </div>
    );
  }

  if (!user) return <LoginScreen onSignIn={signIn} error={authError} />;

  return (
    <div className="min-h-screen bg-cream">
      <Header
        view={view} onViewChange={setView}
        onAdd={() => setAddOpen(true)}
        onImport={() => setImportOpen(true)}
        user={user} onLogOut={logOut}
      />

      <main className="max-w-2xl mx-auto px-4 py-5">
        {view === 'dashboard' ? (
          <Dashboard
            totalBalance={totalBalance}
            investmentTotal={investmentTotal}
            monthlyIncome={monthlyIncome}
            monthlyExpenses={monthlyExpenses}
            monthlyInvestments={monthlyInvestments}
            categoryTotals={categoryTotals}
            recentTransactions={recentTransactions}
            onAdd={() => setAddOpen(true)}
            onDeleteTransaction={deleteTransaction}
          />
        ) : (
          <TransactionList
            transactions={transactions}
            onDelete={deleteTransaction}
            onAdd={() => setAddOpen(true)}
          />
        )}
      </main>

      <AddTransactionModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={addTransaction}
      />

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={addTransactions}
      />
    </div>
  );
}
