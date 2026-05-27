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
      <div className="animate-spin" style={{ animationDuration: '1.2s' }}>
        <ArcLogo size={28} />
      </div>
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
  // r=9, circ≈56.55 | 320°=50.27 | 40°gap=6.28 | gap centred at top
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9"
        stroke="#E6B95C" strokeWidth="2.5" strokeLinecap="round"
        strokeDasharray="50.27 6.28"
        transform="rotate(-70 12 12)"
      />
    </svg>
  );
}
