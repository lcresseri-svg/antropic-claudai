import { useState } from 'react';
import { useAuth } from './useAuth';
import { useTransactions } from './useTransactions';
import { SettingsProvider } from './settings';
import { Transaction } from './types';
import { LoginScreen } from './components/LoginScreen';
import { Dashboard } from './components/Dashboard';
import { TransactionList } from './components/TransactionList';
import { SettingsScreen } from './components/SettingsScreen';
import { TransactionModal } from './components/TransactionModal';
import { ImportModal } from './components/ImportModal';
import { BottomNav, View } from './components/BottomNav';

function Loader() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-divider border-t-gold animate-spin" />
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading, error: authError, signIn, logOut } = useAuth();

  if (authLoading) return <Loader />;
  if (!user) return <LoginScreen onSignIn={signIn} error={authError} />;

  return (
    <SettingsProvider user={user}>
      <Main user={user} onLogOut={logOut} />
    </SettingsProvider>
  );
}

function Main({ user, onLogOut }: { user: import('firebase/auth').User; onLogOut: () => void }) {
  const tx = useTransactions(user);
  const [view, setView] = useState<View>('home');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  if (tx.loading) return <Loader />;

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (t: Transaction) => { setEditing(t); setModalOpen(true); };

  const handleSave = (data: Omit<Transaction, 'id'>) => {
    if (editing) {
      tx.updateTransaction(editing.id, data);
    } else {
      tx.addTransaction(data);
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 bg-bg/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SunLogo />
            <span className="font-semibold text-primary">Sunny</span>
          </div>
          <button onClick={() => setImportOpen(true)}
            className="text-xs font-medium text-secondary bg-card px-3.5 py-2 rounded-full active:bg-card-hover transition-colors">
            Importa
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-2">
        {view === 'home' && (
          <Dashboard
            user={user}
            netWorth={tx.netWorth} liquidity={tx.liquidity} investmentTotal={tx.investmentTotal}
            monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses} monthlyInvestments={tx.monthlyInvestments}
            categoryTotals={tx.categoryTotals} accountBalances={tx.accountBalances} expenseByAccount={tx.expenseByAccount}
            trend={tx.trend} transactions={tx.transactions} recentTransactions={tx.recentTransactions}
            onSeeAll={() => setView('transactions')} onEditTransaction={openEdit}
          />
        )}
        {view === 'transactions' && (
          <div className="pt-2">
            <h1 className="text-2xl font-bold text-primary mb-4 px-1">Movimenti</h1>
            <TransactionList
              transactions={tx.transactions}
              onEdit={openEdit} onDelete={tx.deleteTransaction}
              onBulkUpdate={tx.updateTransactions} onBulkDelete={tx.deleteTransactions}
              onAdd={openAdd}
            />
          </div>
        )}
        {view === 'settings' && (
          <div className="pt-2">
            <h1 className="text-2xl font-bold text-primary mb-4 px-1">Impostazioni</h1>
            <SettingsScreen user={user} onLogOut={onLogOut} onDeleteAll={tx.deleteAll} />
          </div>
        )}
      </main>

      <BottomNav view={view} onView={setView} onAdd={openAdd} />

      <TransactionModal
        open={modalOpen} editing={editing}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={tx.deleteTransaction}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={tx.addTransactions} />
    </div>
  );
}

function SunLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 200 200">
      <circle cx="100" cy="100" r="36" fill="#E6B95C" />
      <g stroke="#E6B95C" strokeWidth="11" strokeLinecap="round">
        <line x1="100" y1="32" x2="100" y2="50" /><line x1="100" y1="150" x2="100" y2="168" />
        <line x1="32" y1="100" x2="50" y2="100" /><line x1="150" y1="100" x2="168" y2="100" />
        <line x1="52" y1="52" x2="64" y2="64" /><line x1="136" y1="136" x2="148" y2="148" />
        <line x1="148" y1="52" x2="136" y2="64" /><line x1="64" y1="136" x2="52" y2="148" />
      </g>
    </svg>
  );
}
