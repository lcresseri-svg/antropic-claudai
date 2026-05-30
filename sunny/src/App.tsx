import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './shared/hooks/useAuth';
import { useTransactions } from './shared/hooks/useTransactions';
import { SettingsProvider, useSettings } from './shared/providers/settings';
import { Transaction } from './types';
import { LoginScreen } from './shared/components/LoginScreen';
import { Dashboard } from './features/dashboard/Dashboard';
import { TransactionList } from './features/transactions/TransactionList';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { TransactionModal } from './features/transactions/TransactionModal';
import { ImportModal } from './features/transactions/ImportModal';
import { BottomNav } from './shared/components/BottomNav';

function Loader({ phase }: { phase: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs(s => s + 1), 1000);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearInterval(t); document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center gap-4 overflow-hidden overscroll-none">
      <div className="animate-spin" style={{ animationDuration: '1.2s' }}>
        <ArcLogo size={28} />
      </div>
      <p className={`text-xs text-secondary transition-opacity duration-300 ${secs >= 3 ? 'opacity-100' : 'opacity-0'}`}>{phase} · {secs}s</p>
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading, error: authError, signIn, logOut, deleteAccount } = useAuth();
  if (authLoading) return <Loader phase="Accesso" />;
  if (!user) return <LoginScreen onSignIn={signIn} error={authError} />;
  return (
    <SettingsProvider user={user}>
      <Main user={user} onLogOut={logOut} onDeleteAccount={deleteAccount} />
    </SettingsProvider>
  );
}

function Main({ user, onLogOut, onDeleteAccount }: {
  user: import('firebase/auth').User;
  onLogOut: () => void;
  onDeleteAccount: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { accounts } = useSettings();
  const tx = useTransactions(user, accounts);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const isSettings = location.pathname.startsWith('/settings');

  const openAdd  = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (t: Transaction) => { setEditing(t); setModalOpen(true); };

  const groupTransfers = (editing?.type === 'expense' && editing.groupId)
    ? tx.transactions.filter(t => t.groupId === editing.groupId && t.id !== editing.id)
    : [];

  const handleSave = (deleteIds: string[], create: Omit<Transaction, 'id'>[]) =>
    tx.replaceGroup(deleteIds, create);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-20 glass-header">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ArcLogo size={28} />
            <span className="font-semibold text-primary tracking-[-0.02em]">Sunny</span>
            {tx.loading && (
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
            )}
          </div>
          {!isSettings && (
            <div className="relative">
              <button onClick={() => setSettingsOpen(s => !s)}
                className="w-9 h-9 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-full">
                <HeaderGearIcon />
              </button>
              {settingsOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSettingsOpen(false)} />
                  <div className="absolute right-0 top-10 z-50 rounded-2xl py-1 w-44 animate-fade-in-fast border border-divider shadow-float glass-elevated">
                    <button onClick={() => { navigate('/settings'); setSettingsOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-card-hover transition-colors text-left rounded-t-2xl">
                      <HeaderGearIcon /> Impostazioni
                    </button>
                    <div className="h-px bg-divider mx-3" />
                    <button onClick={() => { setImportOpen(true); setSettingsOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-card-hover transition-colors text-left rounded-b-2xl">
                      <FolderIcon /> Importa
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {tx.error && (
        <div className="max-w-2xl mx-auto px-5 pt-2">
          <div className="bg-[#E08B8B]/12 border border-[#E08B8B]/25 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
            <span className="text-[#E08B8B] text-sm">⚠</span>
            <p className="text-xs text-[#E08B8B] flex-1">{tx.error}</p>
          </div>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-5 pt-2">
        <Routes>
          <Route path="/" element={
            <Dashboard
              user={user}
              netWorth={tx.netWorth} liquidity={tx.liquidity} investmentTotal={tx.investmentTotal}
              monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
              monthlyInvestments={tx.monthlyInvestments}
              categoryTotals={tx.categoryTotals} accountBalances={tx.accountBalances}
              expenseByAccount={tx.expenseByAccount}
              trend={tx.trend} transactions={tx.transactions} recentTransactions={tx.recentTransactions}
              onSeeAll={() => navigate('/transactions')} onEditTransaction={openEdit}
            />
          } />
          <Route path="/transactions" element={
            <div className="pt-4">
              <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-6">Movimenti</h1>
              <TransactionList
                transactions={tx.transactions}
                onEdit={openEdit} onDelete={tx.deleteTransaction}
                onBulkUpdate={tx.updateTransactions} onBulkDelete={tx.deleteTransactions}
                onAdd={openAdd}
              />
            </div>
          } />
          <Route path="/settings/*" element={
            <div className="pt-4">
              <SettingsScreen user={user} transactions={tx.transactions}
                onLogOut={onLogOut} onDeleteAll={tx.deleteAll} onDeleteAccount={onDeleteAccount} />
            </div>
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {!isSettings && <BottomNav onAdd={openAdd} />}

      <TransactionModal
        open={modalOpen} editing={editing} groupTransfers={groupTransfers}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={tx.addTransactions} />
    </div>
  );
}

// ── Header icons ────────────────────────────────────────────────────────────

function HeaderGearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

// ── Brand mark ───────────────────────────────────────────────────────────────

export function ArcLogo({ size = 28 }: { size?: number }) {
  const id = `al${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${id}g`} x1="12" y1="3" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F5C842" />
          <stop offset="100%" stopColor="#B8720C" />
        </linearGradient>
        <filter id={id} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <circle cx="12" cy="12" r="8.5"
        stroke={`url(#${id}g)`} strokeWidth="3.2" strokeLinecap="round"
        strokeDasharray="40.06 13.35"
        transform="rotate(135 12 12)"
        filter={`url(#${id})`}
      />
    </svg>
  );
}
