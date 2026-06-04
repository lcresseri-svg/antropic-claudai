import { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from './shared/hooks/useAuth';
import { useTransactions } from './shared/hooks/useTransactions';
import { SettingsProvider, useSettings } from './shared/providers/settings';
import { Transaction } from './types';
import { greeting } from './utils';
import { buildProjectedOccurrences } from './shared/recurrence';
import { db } from './lib/firebase';
import { useOnboarding } from './features/onboarding/useOnboarding';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { ONBOARDING_VERSION } from './features/onboarding/onboardingTypes';
import { LoginScreen } from './shared/components/LoginScreen';
import { Dashboard } from './features/dashboard/Dashboard';
import { InvestmentsScreen } from './features/dashboard/InvestmentsScreen';
import { InsightsScreen } from './features/insights/InsightsScreen';
import { BudgetScreen } from './features/budget/BudgetScreen';
import { BudgetDisabled } from './features/budget/BudgetDisabled';
import { TransactionList } from './features/transactions/TransactionList';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { AICoachScreen } from './features/aiCoach/AICoachScreen';
import { AICoachWidget } from './features/aiCoach/AICoachWidget';
import { TransactionModal } from './features/transactions/TransactionModal';
import { SeriesEditChoiceSheet } from './features/transactions/SeriesEditChoiceSheet';
import { ImportModal } from './features/transactions/ImportModal';
import { BottomNav } from './shared/components/BottomNav';
import { SideNav } from './shared/components/SideNav';
import { isAdminUser } from './shared/featureFlags';
import { PushPromoSheet } from './shared/components/PushPromoSheet';
import { pushSupported, hasLocalToken } from './shared/push';

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
      <OnboardingGate user={user} onLogOut={logOut} onDeleteAccount={deleteAccount} />
    </SettingsProvider>
  );
}

/** Decides whether to show the guided onboarding or go straight to Main.
 *  Existing users (detected synchronously via localStorage OR via transaction
 *  check in useOnboarding) bypass onboarding completely with zero flash. */
function OnboardingGate({ user, onLogOut, onDeleteAccount }: {
  user: import('firebase/auth').User;
  onLogOut: () => void;
  onDeleteAccount: () => Promise<void>;
}) {
  // --- Synchronous bypass: any localStorage key set by prior app usage ---
  const hasLocalData = useMemo(
    () => Object.keys(localStorage).some(k => k.startsWith('sunny:') && k.includes(user.uid)),
    [user.uid],
  );

  const { onboarding, loading, updateOnboarding, completeOnboarding, skipOnboarding } = useOnboarding(user.uid);

  // Fire-and-forget: write completed doc for existing users detected via localStorage
  useEffect(() => {
    if (!hasLocalData) return;
    setDoc(
      doc(db, 'users', user.uid, 'meta', 'onboarding'),
      { completed: true, version: ONBOARDING_VERSION, currentStep: 0, goals: [], dataMode: null },
      { merge: true },
    );
  }, [hasLocalData, user.uid]);

  // Existing user with local data → Main immediately (zero latency)
  if (hasLocalData) {
    return <Main user={user} onLogOut={onLogOut} onDeleteAccount={onDeleteAccount} />;
  }

  if (loading) return <Loader phase="Caricamento" />;

  if (!onboarding || !onboarding.completed) {
    return (
      <OnboardingScreen
        uid={user.uid}
        onboarding={onboarding ?? { completed: false, version: ONBOARDING_VERSION, currentStep: 0, goals: [], dataMode: null }}
        updateOnboarding={updateOnboarding}
        completeOnboarding={completeOnboarding}
        skipOnboarding={skipOnboarding}
      />
    );
  }

  return <Main user={user} onLogOut={onLogOut} onDeleteAccount={onDeleteAccount} />;
}

function Main({ user, onLogOut, onDeleteAccount }: {
  user: import('firebase/auth').User;
  onLogOut: () => void;
  onDeleteAccount: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { accounts, categories, includeInvestments, enableInvestments, enableBudget, aiCoachWidgetEnabled, settingsLoaded } = useSettings();
  const tx = useTransactions(user, accounts, includeInvestments, categories, enableInvestments);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [seriesEdit, setSeriesEdit] = useState(false);
  const [seriesChoice, setSeriesChoice] = useState<Transaction | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPushPromo, setShowPushPromo] = useState(false);

  const isSettings = location.pathname.startsWith('/settings');
  const firstName = user.displayName?.split(' ')[0] ?? 'utente';

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  // Show the push promo sheet once to iOS PWA users who haven't enabled push.
  useEffect(() => {
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!isIOS || !isStandalone) return;
    const key = `sunny:pushPromo:${user.uid}`;
    if (localStorage.getItem(key)) return;
    const alreadyEnabled =
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      hasLocalToken();
    if (alreadyEnabled) return;
    let cancelled = false;
    const t = setTimeout(() => {
      pushSupported().then(ok => { if (!cancelled && ok) setShowPushPromo(true); });
    }, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [user?.uid]);

  const dismissPushPromo = () => {
    try { localStorage.setItem(`sunny:pushPromo:${user.uid}`, '1'); } catch { /* ignore */ }
    setShowPushPromo(false);
  };
  const brand = `${greeting()}, ${firstName}`;

  // Virtual future occurrences of every recurring template — shown ahead of time
  // as "Programmato" rows, up to `until` or a rolling 12-month horizon. These are
  // display-only and never written to Firestore.
  const projected = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const horizon = new Date(); horizon.setFullYear(horizon.getFullYear() + 1);
    return buildProjectedOccurrences(tx.transactions, todayISO, horizon.toISOString().slice(0, 10));
  }, [tx.transactions]);

  // Resolve the template (series anchor) for any occurrence carrying a seriesId.
  const findTemplate = (t: Transaction): Transaction | undefined =>
    tx.transactions.find(x => x.recurring && (x.seriesId ?? x.id) === (t.seriesId ?? t.id));

  const startEdit = (t: Transaction, asSeries: boolean) => {
    setEditing(t); setSeriesEdit(asSeries); setModalOpen(true);
  };

  const openAdd = () => { setEditing(null); setSeriesEdit(false); setModalOpen(true); };

  // Outlook-style: opening an occurrence opens the series.
  const openEdit = (t: Transaction) => {
    if (t.projected) {
      // Virtual occurrence → edit the underlying series (template). Only the
      // template is a real doc; if it can't be resolved, do nothing (a projected
      // row's synthetic id must never reach a write path).
      const tpl = findTemplate(t);
      if (tpl) startEdit(tpl, true);
    } else if (t.recurring) {
      // The template row itself → series edit.
      startEdit(t, true);
    } else if (t.seriesId) {
      // A past, already-recorded instance → ask "just this one" or "the series".
      setSeriesChoice(t);
    } else {
      startEdit(t, false);
    }
  };

  const groupTransfers = (editing?.groupId && (editing.type === 'expense' || editing.type === 'transfer'))
    ? tx.transactions.filter(t => t.groupId === editing.groupId && t.id !== editing.id)
    : [];

  const handleSave = (deleteIds: string[], create: Omit<Transaction, 'id'>[]) =>
    tx.replaceGroup(deleteIds, create);

  return (
    <div className="min-h-screen md:flex">
      {/* Global backdrop for settings dropdown — outside the header stacking context */}
      {settingsOpen && !isSettings && (
        <div className="fixed inset-0 z-[35]" onClick={() => setSettingsOpen(false)} />
      )}

      {/* Desktop sidebar */}
      <SideNav loading={tx.loading} onAdd={openAdd} onImport={() => setImportOpen(true)} isAdmin={isAdminUser(user)} />

      {/* Content (shifted right by sidebar on desktop) */}
      <div className="flex-1 md:ml-[220px] min-w-0">

        {/* Mobile-only header — z-[40] so it sits above the z-[35] backdrop */}
        <header className="sticky top-0 z-[40] glass-header md:hidden">
          <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <ArcLogo size={28} />
              <span className="font-semibold text-primary tracking-[-0.02em] truncate">{brand}</span>
              {tx.loading && <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse flex-shrink-0" />}
            </div>
            {!isSettings && (
              <div className="relative">
                <button onClick={() => setSettingsOpen(s => !s)}
                  className="w-9 h-9 flex items-center justify-center text-secondary hover:text-primary transition-colors rounded-full">
                  <HeaderGearIcon />
                </button>
                {settingsOpen && (
                  <div className="absolute right-0 top-10 z-[50] rounded-2xl py-1 w-44 animate-fade-in-fast border border-divider shadow-float glass-elevated">
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
                )}
              </div>
            )}
          </div>
        </header>

        {tx.error && (
          <div className="max-w-2xl mx-auto md:max-w-none px-5 md:px-8 pt-2">
            <div className="bg-[#E08B8B]/12 border border-[#E08B8B]/25 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5">
              <span className="text-[#E08B8B] text-sm">⚠</span>
              <p className="text-xs text-[#E08B8B] flex-1">{tx.error}</p>
            </div>
          </div>
        )}

        <main className="max-w-2xl mx-auto md:max-w-none px-5 md:px-8 pt-2">
          <Routes>
            <Route path="/" element={
              <Dashboard
                greeting={brand}
                netWorth={tx.netWorth} liquidity={tx.liquidity} investmentTotal={tx.investmentTotal}
                monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
                monthlyInvestments={tx.monthlyInvestments}
                investmentByCategory={tx.investmentByCategory}
                accountBalances={tx.accountBalances}
                trend={tx.trend} transactions={tx.transactions}
                onSeeInsights={() => navigate('/insights')}
                onSeeInvestments={() => navigate('/investments')}
              />
            } />
            <Route path="/investments" element={
              !enableInvestments ? <Navigate to="/" replace /> : (
                <div className="pt-4 md:pt-6">
                  <InvestmentsScreen
                    investmentByCategory={tx.investmentByCategory}
                    investmentTotal={tx.investmentTotal}
                    monthlyInvestments={tx.monthlyInvestments}
                    trend={tx.trend}
                    transactions={tx.transactions}
                  />
                </div>
              )
            } />
            <Route path="/insights" element={
              <div className="pt-4 md:pt-6">
                <InsightsScreen transactions={tx.transactions}
                  monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
                  monthlyInvestments={tx.monthlyInvestments} />
              </div>
            } />
            <Route path="/budget" element={
              <div className="pt-4 md:pt-6">
                {enableBudget ? (
                  <BudgetScreen
                    user={user}
                    transactions={tx.transactions}
                    monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
                    monthlyInvestments={tx.monthlyInvestments} categoryTotals={tx.categoryTotals}
                  />
                ) : (
                  <BudgetDisabled onActivate={() => navigate('/settings?section=generali')} />
                )}
              </div>
            } />
            <Route path="/transactions" element={
              <div className="pt-4 md:pt-6">
                <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-6">Movimenti</h1>
                <TransactionList
                  transactions={tx.transactions} projected={projected}
                  onEdit={openEdit} onDelete={tx.deleteTransaction}
                  onBulkUpdate={tx.updateTransactions} onBulkDelete={tx.deleteTransactions}
                  onAdd={openAdd}
                />
              </div>
            } />
            <Route path="/settings/*" element={
              <div className="pt-4 md:pt-6 md:max-w-3xl">
                <SettingsScreen user={user} transactions={tx.transactions}
                  onLogOut={onLogOut} onDeleteAll={tx.deleteAll} onDeleteAccount={onDeleteAccount} />
              </div>
            } />
            {isAdminUser(user) && (
              <Route path="/ai-coach" element={
                <div className="pt-4 md:pt-6">
                  <AICoachScreen />
                </div>
              } />
            )}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Mobile-only bottom nav */}
        {!isSettings && <BottomNav onAdd={openAdd} />}
      </div>

      {settingsLoaded && isAdminUser(user) && aiCoachWidgetEnabled && <AICoachWidget />}

      <TransactionModal
        open={modalOpen} editing={editing} groupTransfers={groupTransfers} seriesEdit={seriesEdit}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
      <SeriesEditChoiceSheet
        open={!!seriesChoice}
        onClose={() => setSeriesChoice(null)}
        onChoose={scope => {
          const inst = seriesChoice;
          setSeriesChoice(null);
          if (!inst) return;
          if (scope === 'single') { startEdit(inst, false); return; }
          const tpl = findTemplate(inst);
          startEdit(tpl ?? inst, !!tpl);
        }}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={tx.addTransactions} />
      <PushPromoSheet
        open={showPushPromo}
        onClose={dismissPushPromo}
        onGoToSettings={() => { dismissPushPromo(); navigate('/settings'); }}
      />
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
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5"
        stroke="rgb(200,160,90)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="40.06 13.35"
        transform="rotate(135 12 12)"
      />
    </svg>
  );
}

