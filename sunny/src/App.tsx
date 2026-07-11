import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { useAuth } from './shared/hooks/useAuth';
import { useTransactions } from './shared/hooks/useTransactions';
import { SettingsProvider, useSettings } from './shared/providers/settings';
import { useBudget } from './shared/hooks/useBudget';
import { greeting } from './utils';
import { catchUpRecurring } from './shared/recurrence';
import { db } from './lib/firebase';
import { useOnboarding } from './features/onboarding/useOnboarding';
import { OnboardingScreen } from './features/onboarding/OnboardingScreen';
import { ONBOARDING_VERSION } from './features/onboarding/onboardingTypes';
import { LoginScreen } from './shared/components/LoginScreen';
import { BudgetSetupBanner } from './features/budget/BudgetSetupBanner';
import { RecapPrompt } from './features/recap/RecapPrompt';
import { TransactionModal } from './features/transactions/TransactionModal';
import { SeriesDetailSheet } from './features/transactions/SeriesDetailSheet';
import { ImportModal } from './features/transactions/ImportModal';
import { BottomNav } from './shared/components/BottomNav';
import { SideNav } from './shared/components/SideNav';
import { SplashScreen } from './shared/components/SplashScreen';
import { ArcLogo } from './shared/components/ArcLogo';
import { AICoachWidget } from './features/aiCoach/AICoachWidget';
import { PushPromoSheet } from './shared/components/PushPromoSheet';
import { WhatsNewModal } from './shared/components/WhatsNewModal';
import { ReleaseNotice } from './features/notifications/ReleaseNotice';
import { pushSupported, hasLocalToken } from './shared/push';
import { recordActivity, logEvent } from './shared/analytics/metrics';
import { ErrorBoundary } from './app/ErrorBoundary';
import { SyncStatusBanner } from './app/SyncStatusBanner';
import { AppHeader } from './app/AppHeader';
import { AppRoutes } from './app/AppRoutes';
import { useTransactionEditing } from './app/useTransactionEditing';

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

/** Bootstrap only: splash, auth gate, providers. Everything else lives in Main. */
export default function App() {
  const { user, loading: authLoading, error: authError, signIn, logOut, deleteAccount } = useAuth();
  const [splashReady, setSplashReady] = useState(false);

  // Auth state resolved (logged in or not) → let the splash fade out.
  useEffect(() => {
    if (!authLoading) setSplashReady(true);
  }, [authLoading]);

  return (
    <ErrorBoundary>
      <SplashScreen isReady={splashReady} />
      {authLoading ? (
        <Loader phase="Accesso" />
      ) : !user ? (
        <LoginScreen onSignIn={signIn} error={authError} />
      ) : (
        <SettingsProvider user={user}>
          <OnboardingGate user={user} onLogOut={logOut} onDeleteAccount={deleteAccount} />
        </SettingsProvider>
      )}
    </ErrorBoundary>
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
  const { accounts, categories, includeInvestments, enableInvestments, enableBudget, aiCoachWidgetEnabled, settingsLoaded, aiEnabled } = useSettings();
  const tx = useTransactions(user, accounts, includeInvestments, categories, enableInvestments);
  const budget = useBudget(user);
  const editing = useTransactionEditing(user, tx);

  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showPushPromo, setShowPushPromo] = useState(false);

  const isSettings = location.pathname.startsWith('/settings');
  const firstName = user.displayName?.split(' ')[0] ?? 'utente';
  const brand = `${greeting()}, ${firstName}`;

  // Reset scroll to top on every route change. The real scroller is the
  // #app-scroll container (the body/window never scrolls — see its overflow
  // setup below), so window.scrollTo alone is a no-op on desktop: reset that
  // element too.
  useEffect(() => {
    document.getElementById('app-scroll')?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [location.pathname]);

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

  // Self-hosted metrics: record presence + app_open once per browser session.
  // Fire-and-forget (recordActivity is debounced via sessionStorage); never
  // blocks render and never surfaces an error to the UI.
  useEffect(() => {
    recordActivity(user.uid);
    logEvent(user.uid, 'app_open');
  }, [user.uid]);

  // metrics: if the app was opened from a notification (push link carries
  // ?notif=1), log notif_open once and strip the param from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('notif') !== '1') return;
    logEvent(user.uid, 'notif_open');
    params.delete('notif');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  }, [user.uid]);

  // On login (first server-confirmed snapshot): move anything "Programmato" whose
  // date is already due (<= today) into "Fatto" by materializing overdue recurring
  // occurrences right away, instead of waiting for the nightly Cloud Function.
  // Gated on `synced` so it only runs on real server data (never on stale cache).
  const caughtUp = useRef(false);
  useEffect(() => {
    if (!tx.synced || caughtUp.current) return;
    caughtUp.current = true;
    const todayISO = new Date().toISOString().slice(0, 10);
    const { creates, advance } = catchUpRecurring(tx.transactions, todayISO);
    if (creates.length || advance.length) tx.materializeRecurring(creates, advance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tx.synced]);

  return (
    <div className="h-full md:flex ui-v2">
      {/* Global backdrop for settings dropdown — outside the header stacking context */}
      {settingsOpen && !isSettings && (
        <div className="fixed inset-0 z-[35]" onClick={() => setSettingsOpen(false)} />
      )}

      {/* Desktop sidebar */}
      <SideNav loading={tx.loading} onAdd={editing.openAdd} onImport={() => setImportOpen(true)} aiEnabled={aiEnabled} />

      {/* Content (shifted right by sidebar on desktop) */}
      <div className="flex-1 md:ml-[220px] min-w-0 flex flex-col h-full overflow-hidden">

        <AppHeader
          brand={brand} loading={tx.loading} isSettings={isSettings}
          settingsOpen={settingsOpen} onToggleSettings={setSettingsOpen}
          onImport={() => setImportOpen(true)}
        />

        {/* Scroll container — the ONLY element that scrolls; body stays still.
            id lets sheets lock THIS scroller (not body) while open. */}
        <div id="app-scroll" className="flex-1 overflow-y-auto overscroll-contain">

        <SyncStatusBanner error={tx.error} />

        {/* New-month recap nudge — once per month per device (localStorage) */}
        <RecapPrompt transactions={tx.transactions} />

        {/* Budget month-setup prompt — shown until the current month is confirmed */}
        {enableBudget && budget.showBudgetPrompt && !isSettings && (
          <div className="max-w-2xl mx-auto md:max-w-none px-5 md:px-8 pt-3">
            <BudgetSetupBanner
              month={budget.currentMonth}
              copiedFromPrevious={budget.monthlySource === 'copied_from_previous_month'}
              onConfirm={budget.confirmCurrentMonth}
              onEdit={() => navigate('/budget')}
            />
          </div>
        )}

        <main className="max-w-2xl mx-auto md:max-w-none px-5 md:px-8 pt-4 md:pt-2 pb-24 md:pb-2">
          <AppRoutes
            user={user} brand={brand} tx={tx} budget={budget} editing={editing}
            onLogOut={onLogOut} onDeleteAccount={onDeleteAccount}
            onImport={() => setImportOpen(true)}
          />
        </main>

        </div>{/* end scroll container */}

        {/* Mobile-only bottom nav */}
        {!isSettings && <BottomNav onAdd={editing.openAdd} />}
      </div>

      {settingsLoaded && aiEnabled && aiCoachWidgetEnabled && <AICoachWidget />}

      <TransactionModal
        open={editing.modalOpen} editing={editing.editing} groupTransfers={editing.groupTransfers} seriesEdit={editing.seriesEdit}
        defaultType={editing.defaultType} recognize={editing.recognize ?? undefined}
        onClose={editing.closeModal}
        onSave={editing.handleSave}
      />
      <SeriesDetailSheet
        open={!!editing.seriesDetail}
        anchor={editing.seriesDetail}
        allTransactions={tx.allTransactions}
        onClose={editing.closeSeriesDetail}
        onEditSingle={t => { editing.closeSeriesDetail(); editing.startEdit(t, false); }}
        onEditSeries={t => {
          editing.closeSeriesDetail();
          const tpl = editing.findTemplate(t);
          editing.startEdit(tpl ?? t, !!tpl);
        }}
        onViewMovements={sid => { editing.closeSeriesDetail(); navigate(`/transactions?series=${sid}`); }}
      />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={tx.addTransactions} />
      <PushPromoSheet
        open={showPushPromo}
        onClose={dismissPushPromo}
        onGoToSettings={() => { dismissPushPromo(); navigate('/settings'); }}
      />

      {/* "Novità" popup — shown once per highlighted release, to all users. */}
      <WhatsNewModal />

      {/* One-shot release notice — once per user per notice id, only after the
          initial data load (never over the loading state). */}
      {!tx.loading && <ReleaseNotice userId={user.uid} />}
    </div>
  );
}
