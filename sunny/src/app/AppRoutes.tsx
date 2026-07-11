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
const WealthV2Screen = lazy(() => import('../features/wealth/WealthV2Screen').then(m => ({ default: m.WealthV2Screen })));
const CommitmentsScreen = lazy(() => import('../features/wealth/CommitmentsScreen').then(m => ({ default: m.CommitmentsScreen })));

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
          <DashboardV2
            greeting={brand}
            netWorth={tx.netWorth} liquidity={tx.liquidity} investmentTotal={tx.investmentTotal}
            monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
            monthlyInvestments={tx.monthlyInvestments}
            investmentByCategory={tx.investmentByCategory}
            accountBalances={tx.accountBalances}
            trend={tx.trend} transactions={tx.transactions}
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
                onAddTransactions={tx.addTransactions}
              />
            </div>
          )
        } />
        <Route path="/insights" element={
          <div className="pt-4 md:pt-6">
            {/* isAdmin here only widens the INSIGHT SET (rolled out to everyone
                on 2026-06-16); it grants no data access. */}
            <InsightsScreenV2 user={user} transactions={tx.transactions}
              monthlyIncome={tx.monthlyIncome} monthlyExpenses={tx.monthlyExpenses}
              monthlyInvestments={tx.monthlyInvestments} portfolio={portfolio}
              isAdmin={true} budgets={budget.budget.categoryBudgets} />
          </div>
        } />
        <Route path="/budget" element={
          <div className="pt-4 md:pt-6">
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
          <div className="pt-4 md:pt-6">
            <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-6">Movimenti</h1>
            <TransactionList
              transactions={tx.transactions} projected={editing.projected}
              onEdit={editing.openEdit} onDelete={tx.deleteTransaction}
              onBulkUpdate={tx.updateTransactions} onBulkDelete={tx.deleteTransactions}
              onAdd={editing.openAdd}
            />
          </div>
        } />
        <Route path="/settings/*" element={
          <div className="pt-4 md:pt-6 md:max-w-3xl">
            <SettingsScreen user={user} transactions={tx.transactions}
              budgetExport={{ currentMonth: budget.currentMonth, current: budget.monthly, history: budget.budgetHistory, legacy: budget.budget }}
              onLogOut={onLogOut} onDeleteAll={tx.deleteAll} onDeleteAccount={onDeleteAccount} />
          </div>
        } />
        {aiEnabled && (
          <Route path="/ai-coach" element={
            <div className="pt-4 md:pt-6">
              <AICoachScreen user={user} />
            </div>
          } />
        )}
        <Route path="/category-spending" element={
          <div className="pt-4 md:pt-6">
            <CategorySpendingScreen transactions={tx.transactions} categoryBudgets={budget.budget.categoryBudgets} />
          </div>
        } />
        <Route path="/account-balance" element={
          <div className="pt-4 md:pt-6">
            <AccountBalanceScreen transactions={tx.transactions} />
          </div>
        } />
        <Route path="/wealth-history" element={
          <div className="pt-4 md:pt-6">
            <WealthHistoryScreen transactions={tx.transactions} />
          </div>
        } />
        <Route path="/recap/:ym" element={
          <div className="pt-4 md:pt-6">
            <MonthlyRecapScreen transactions={tx.transactions} />
          </div>
        } />
        <Route path="/forecast-v3" element={
          <div className="pt-4 md:pt-6">
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
            ? <div className="pt-4 md:pt-6">
                <WealthV2Screen user={user} transactions={tx.transactions} liquidity={tx.liquidity} />
              </div>
            : <Navigate to="/" replace />
        } />
        <Route path="/commitments" element={
          isFeatureEnabled('commitments', user)
            ? <div className="pt-4 md:pt-6">
                <CommitmentsScreen transactions={tx.allTransactions} />
              </div>
            : <Navigate to="/" replace />
        } />
        {/* Admin-only metrics dashboard — gated on the admin identity because
            it reads admin-only DATA (metrics/*), not to hide a feature. */}
        <Route path="/metrics" element={
          isAdminUser(user)
            ? <div className="pt-4 md:pt-6"><MetricsScreen /></div>
            : <Navigate to="/" replace />
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
