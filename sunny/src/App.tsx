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
      <ArcLogo size={28} />
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

  const openAdd  = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (t: Transaction) => { setEditing(t); setModalOpen(true); };

  const handleSave = (data: Omit<Transaction, 'id'>) => {
    if (editing) tx.updateTransaction(editing.id, data);
    else         tx.addTransaction(data);
  };

  const pageTitle: Record<Exclude<View, 'home'>, string> = {
    transactions: 'Movimenti',
    settings:     'Impostazioni',
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-bg/85 backdrop-blur-2xl">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ArcLogo size={22} />
            <span className="font-semibold text-primary tracking-[-0.02em]">Sunny</span>
          </div>
          <button onClick={() => setImportOpen(true)}
            className="label-caps text-secondary hover:text-primary transition-colors py-2 px-1">
            Importa
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 pt-2">
        {view === 'home' && (
          <Dashboard
            user={user}
            netWorth={tx.netWorth} liquidity={tx.liquidity} investmentTotal={tx.investmentTotal}
            monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
            monthlyInvestments={tx.monthlyInvestments}
            categoryTotals={tx.categoryTotals} accountBalances={tx.accountBalances}
            expenseByAccount={tx.expenseByAccount}
            trend={tx.trend} transactions={tx.transactions} recentTransactions={tx.recentTransactions}
            onSeeAll={() => setView('transactions')} onEditTransaction={openEdit}
          />
        )}
        {view !== 'home' && (
          <div className="pt-4">
            <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-6">
              {pageTitle[view]}
            </h1>
            {view === 'transactions' && (
              <TransactionList
                transactions={tx.transactions}
                onEdit={openEdit} onDelete={tx.deleteTransaction}
                onBulkUpdate={tx.updateTransactions} onBulkDelete={tx.deleteTransactions}
                onAdd={openAdd}
              />
            )}
            {view === 'settings' && (
              <SettingsScreen user={user} onLogOut={onLogOut} onDeleteAll={tx.deleteAll} />
            )}
          </div>
        )}
      </main>

      <BottomNav view={view} onView={setView} onAdd={openAdd} />

      <TransactionModal
        open={modalOpen} editing={editing}
        onClose={() => setModalOpen(false)}
        onSave={handleSave} onDelete={tx.deleteTransaction}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={tx.addTransactions} />
    </div>
  );
}

// ── Brand mark — thin golden arc ────────────────────────────────────────────

export function ArcLogo({ size = 22 }: { size?: number }) {
  const id = `al${size}`;
  // r=9.5 circumference≈59.69 | 300°=49.7 | 60°gap=9.95
  // r=5.5 circumference≈34.56 | 240°=23.0 | 120°gap=11.5
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <filter id={id} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="12" cy="12" r="9.5"
        stroke="#E6B95C" strokeWidth="1.3" strokeLinecap="round"
        strokeDasharray="49.7 9.95"
        transform="rotate(-108 12 12)"
        filter={`url(#${id})`}
      />
      <circle cx="12" cy="12" r="5.5"
        stroke="#E6B95C" strokeWidth="0.8" strokeLinecap="round"
        strokeDasharray="23.0 11.5"
        transform="rotate(-50 12 12)"
        opacity="0.38"
      />
    </svg>
  );
}
