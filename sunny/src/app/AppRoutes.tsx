import { lazy, Suspense, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { useSettings } from '../shared/providers/settings';
import { useTransactions } from '../shared/hooks/useTransactions';
import { useBudget } from '../shared/hooks/useBudget';
import { isAdminUser } from '../shared/featureFlags';
import { isFeatureEnabled } from '../shared/featureRollout';
import { isForecastV4EnabledForUser } from '../features/forecast/forecastFeatureGate';
import { DashboardV2 } from '../features/dashboard/DashboardV2';
import { BudgetDisabled } from '../features/budget/BudgetDisabled';
import type { useTransactionEditing } from './useTransactionEditing';

// Non-essential screens load on demand: the home renders immediately while the
// rest of the bundle stays out of the critical path.
const InvestmentsScreen = lazy(() => import('../features/dashboard/InvestmentsScreen').then(m => ({ default: m.InvestmentsScreen })));
const CategorySpendingScreen = lazy(() => import('../features/dashboard/CategorySpendingScreen').then(m => ({ default: m.CategorySpendingScreen })));
const IncomeScreen = lazy(() => import('../features/dashboard/IncomeScreen').then(m => ({ default: m.IncomeScreen })));
const AccountBalanceScreen = lazy(() => import('../features/dashboard/AccountBalanceScreen').then(m => ({ default: m.AccountBalanceScreen })));
const WealthHistoryScreen = lazy(() => import('../features/dashboard/WealthHistoryScreen').then(m => ({ default: m.WealthHistoryScreen })));
const MonthlyRecapScreen = lazy(() => import('../features/recap/MonthlyRecapScreen').then(m => ({ default: m.MonthlyRecapScreen })));
const InsightsScreenV2 = lazy(() => import('../features/insights/InsightsScreenV2').then(m => ({ default: m.InsightsScreenV2 })));
const BudgetScreenV2 = lazy(() => import('../features/budget/BudgetScreenV2').then(m => ({ default: m.BudgetScreenV2 })));
const TransactionList = lazy(() => import('../features/transactions/TransactionList').then(m => ({ default: m.TransactionList })));
const SettingsScreen = lazy(() => import('../features/settings/SettingsScreen').then(m => ({ default: m.SettingsScreen })));
const AICoachScreen = lazy(() => import('../features/aiCoach/AICoachScreen').then(m => ({ default: m.AICoachScreen })));
const ForecastV3Screen = lazy(() => import('../features/forecast/ForecastV3Screen').then(m => ({ default: m.ForecastV3Screen })));
const MetricsScreen = lazy(() => import('../features/metrics/MetricsScreen').then(m => ({ default: m.MetricsScreen })));
const WealthScreen = lazy(() => import('../features/wealth/WealthScreen').then(m => ({ default: m.WealthScreen })));
const WealthV2Screen = lazy(() => import('../features/wealth/WealthV2Screen').then(m => ({ default: m.WealthV2Screen })));
const CommitmentsScreen = lazy(() => import('../features/wealth/CommitmentsScreen').then(m => ({ default: m.CommitmentsScreen })));
const MonthlyPlanScreen = lazy(() => import('../features/budget/MonthlyPlanScreen').then(m => ({ default: m.MonthlyPlanScreen })));
const WrappedScreen = lazy(() => import('../features/wrapped/WrappedScreen').then(m => ({ default: m.WrappedScreen })));

/**
 * Larghezze massime desktop (README parte 2, B1).
 *
 * Fino a ora su desktop il contenuto era il layout mobile allargato: le card
 * si stiravano fino a 1400px e una riga finiva con descrizione e importo agli
 * antipodi dello schermo. Ogni schermata ha ora un tetto, e il contenuto resta
 * centrato: sotto `md` non cambia niente.
 *
 * I numeri non sono arbitrari — seguono cosa contiene la schermata: la home ha
 * due colonne piene, le liste stanno strette per restare leggibili, le
 * impostazioni sono la più stretta di tutte perché sono righe di testo.
 */
const W = {
  home:     'md:max-w-[1360px]',
  wide:     'md:max-w-[1200px]',   // Patrimonio, Piano, Investimenti
  list:     'md:max-w-[1100px]',   // Movimenti, Consigli, analisi, AI Coach
  reading:  'md:max-w-[1040px]',   // Riepilogo mensile, Impegni
  admin:    'md:max-w-[1180px]',   // Previsione V4, Metriche
  settings: 'md:max-w-[900px]',
} as const;

/** Contenitore di una rotta: spaziatura di sempre + tetto e centratura. */
const page = (w: string) => `pt-4 md:pt-6 md:mx-auto ${w}`;

/** In-flow loading placeholder — no layout shift, no white screen. */
function RouteFallback() {
  return (
    <div className="pt-16 flex justify-center" role="status" aria-label="Caricamento">
      <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
    </div>
  );
}

interface AppRoutesProps {
  user: User;
  brand: string;
  tx: ReturnType<typeof useTransactions>;
  budget: ReturnType<typeof useBudget>;
  editing: ReturnType<typeof useTransactionEditing>;
  onLogOut: () => void;
  onDeleteAccount: () => Promise<void>;
  onImport: () => void;
}

export function AppRoutes({ user, brand, tx, budget, editing, onLogOut, onDeleteAccount, onImport }: AppRoutesProps) {
  const navigate = useNavigate();
  const {
    visibleCategories, visibleAccounts, categories, includeInvestments,
    enableInvestments, enableBudget, aiEnabled, insightDepth,
  } = useSettings();

  // Portfolio snapshot for the insight engine: paid-in capital (versato) and
  // current market value (controvalore = each investment category's currentValue,
  // falling back to the deposited capital when no market value is set).
  const portfolio = useMemo(() => {
    if (!enableInvestments || tx.investmentTotal <= 0) return undefined;
    let controvalore = 0;
    for (const c of categories) {
      if (c.kind !== 'investment') continue;
      controvalore += c.currentValue ?? tx.investmentByCategory[c.id] ?? 0;
    }
    return { controvalore, versato: tx.investmentTotal };
  }, [enableInvestments, categories, tx.investmentTotal, tx.investmentByCategory]);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={
          <div className={`md:mx-auto ${W.home}`}>
          <DashboardV2
            greeting={brand}
            netWorth={tx.netWorth} liquidity={tx.liquidity} investmentTotal={tx.investmentTotal}
            monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
            monthlyInvestments={tx.monthlyInvestments}
            monthlyFlow={tx.monthlyFlow}
            investmentByCategory={tx.investmentByCategory}
            accountBalances={tx.accountBalances}
            trend={tx.trend} transactions={tx.transactions}
            projected={editing.projected} userId={user.uid}
            portfolio={portfolio}
            savingsTarget={budget.budget.savingsTarget}
            onSeeInsights={() => navigate('/insights')}
            onSeeInvestments={() => navigate('/investments')}
            onSeeCategories={() => navigate('/category-spending')}
            onSeeAccountBalance={() => navigate('/account-balance')}
            onAddExpense={() => editing.openAddWithType('expense')}
            onAddIncome={() => editing.openAddWithType('income')}
            onImportCSV={onImport}
          />
          </div>
        } />
        {/* Tab Patrimonio — raccoglie saldo per conto e investimenti per
            categoria, che il redesign toglie dalla home. */}
        <Route path="/wealth" element={
          <div className={page(W.wide)}>
            <WealthScreen
              showCommitments={isFeatureEnabled('commitments', user)}
              transactions={tx.transactions}
              netWorth={tx.netWorth} liquidity={tx.liquidity} investmentTotal={tx.investmentTotal}
              accountBalances={tx.accountBalances}
              investmentByCategory={tx.investmentByCategory}
            />
          </div>
        } />
        <Route path="/investments" element={
          !enableInvestments ? <Navigate to="/" replace /> : (
            <div className={page(W.wide)}>
              <InvestmentsScreen
                investmentByCategory={tx.investmentByCategory}
                investmentTotal={tx.investmentTotal}
                monthlyInvestments={tx.monthlyInvestments}
                trend={tx.trend}
                transactions={tx.transactions}
                onAddTransactions={tx.addTransactions}
              />
            </div>
          )
        } />
        <Route path="/insights" element={
          <div className={page(W.list)}>
            {/* isAdmin here only widens the INSIGHT SET (rolled out to everyone
                on 2026-06-16); it grants no data access. */}
            <InsightsScreenV2 user={user} transactions={tx.transactions}
              monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
              monthlyInvestments={tx.monthlyInvestments} portfolio={portfolio}
              isAdmin={true} budgets={budget.budget.categoryBudgets} />
          </div>
        } />
        <Route path="/budget" element={
          <div className={page(W.wide)}>
            {enableBudget ? (
              <BudgetScreenV2
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
          <div className={page(W.list)}>
            {/* Il titolo sta dentro la lista, nell'header da 56px insieme a
                ricerca e selezione multipla. */}
            <TransactionList
              transactions={tx.transactions} projected={editing.projected}
              onEdit={editing.openEdit} onDelete={tx.deleteTransaction}
              onBulkUpdate={tx.updateTransactions} onBulkDelete={tx.deleteTransactions}
              onAdd={editing.openAdd}
            />
          </div>
        } />
        <Route path="/settings/*" element={
          <div className={page(W.settings)}>
            <SettingsScreen user={user} transactions={tx.transactions}
              budgetExport={{ currentMonth: budget.currentMonth, current: budget.monthly, history: budget.budgetHistory, legacy: budget.budget }}
              onLogOut={onLogOut} onDeleteAll={tx.deleteAll} onDeleteAccount={onDeleteAccount} />
          </div>
        } />
        {aiEnabled && (
          <Route path="/ai-coach" element={
            <div className={page(W.list)}>
              <AICoachScreen user={user}
                transactions={tx.transactions} liquidity={tx.liquidity}
                savingsTarget={budget.budget.savingsTarget} />
            </div>
          } />
        )}
        <Route path="/income" element={
          <div className={page(W.list)}>
            <IncomeScreen transactions={tx.transactions} />
          </div>
        } />
        <Route path="/category-spending" element={
          <div className={page(W.list)}>
            <CategorySpendingScreen transactions={tx.transactions} categoryBudgets={budget.budget.categoryBudgets} />
          </div>
        } />
        <Route path="/account-balance" element={
          <div className={page(W.list)}>
            <AccountBalanceScreen transactions={tx.transactions} />
          </div>
        } />
        <Route path="/wealth-history" element={
          <div className={page(W.list)}>
            <WealthHistoryScreen transactions={tx.transactions} />
          </div>
        } />
        {/* Sunny Wrapped — overlay a schermo intero, quindi senza il padding
            delle altre rotte. La guardia della finestra (e l'eccezione admin)
            vive dentro la schermata, che rimanda alla home quando non è
            stagione: così anche un deep link vecchio finisce nel posto giusto. */}
        <Route path="/wrapped/:year" element={
          <WrappedScreen
            transactions={tx.transactions} projected={editing.projected}
            user={user} onSetSavingsTarget={budget.setSavingsTarget} />
        } />
        <Route path="/recap/:ym" element={
          <div className={page(W.reading)}>
            <MonthlyRecapScreen transactions={tx.transactions} />
          </div>
        } />
        <Route path="/forecast-v3" element={
          <div className={page(W.admin)}>
            <ForecastV3Screen
              transactions={tx.transactions}
              expenseCategories={visibleCategories.filter(c => c.kind === 'expense')}
              monthlyIncome={tx.monthlyIncome}
              monthlyInvestments={tx.monthlyInvestments}
              isAdmin={true}
              forecastV4Enabled={isForecastV4EnabledForUser(user)}
              allCategories={visibleCategories}
              accounts={visibleAccounts}
              budget={budget.budget}
              budgetHistoryV4={budget.budgetHistory}
              currentMonthBudgetStatus={budget.monthlyStatus}
              settingsSnapshot={{
                includeInvestments,
                enableBudget,
                enableInvestments,
                aiEnabled,
                analysisDepth: insightDepth,
              }}
              userId={user.uid}
            />
          </div>
        } />
        {/* Gated features (central rollout registry, admin-only for now).
            Data access is additionally enforced by Firestore rules. */}
        <Route path="/wealth-v2" element={
          isFeatureEnabled('wealth_v2', user)
            ? <div className={page(W.wide)}>
                <WealthV2Screen user={user} transactions={tx.transactions} liquidity={tx.liquidity} />
              </div>
            : <Navigate to="/" replace />
        } />
        <Route path="/commitments" element={
          isFeatureEnabled('commitments', user)
            ? <div className={page(W.reading)}>
                <CommitmentsScreen transactions={tx.allTransactions} />
              </div>
            : <Navigate to="/" replace />
        } />
        <Route path="/monthly-plan" element={
          isFeatureEnabled('monthly_plan_v2', user)
            ? <div className={page(W.wide)}>
                <MonthlyPlanScreen user={user} transactions={tx.transactions}
                  monthlyIncome={tx.monthlyIncome} monthlyInvestments={tx.monthlyInvestments} />
              </div>
            : <Navigate to="/" replace />
        } />
        {/* Admin-only metrics dashboard — gated on the admin identity because
            it reads admin-only DATA (metrics/*), not to hide a feature. */}
        <Route path="/metrics" element={
          isAdminUser(user)
            ? <div className={page(W.admin)}><MetricsScreen /></div>
            : <Navigate to="/" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
