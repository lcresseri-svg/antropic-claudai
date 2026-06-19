import { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Transaction, ownShare } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { useBudget } from '../../shared/hooks/useBudget';
import {
  suggestBudgets, generateBudgetInsights, seasonalHint,
  DEMO_CATEGORY_SPEND, DEMO_CATEGORY_BUDGETS,
} from './budgetUtils';
import { forecastSavingsV3, forecastByCategoryV3 } from '../forecast/forecastEngineV3';
import { upcomingRecurringThisMonth, upcomingPlannedThisMonth, buildProjectedOccurrences, isPending } from '../../shared/recurrence';
import { history } from '../insights/insightsEngine';
import { SavingsGoalCard } from './SavingsGoalCard';
import { SuggestedBudgetCard } from './SuggestedBudgetCard';
import { CategoryBudgetList } from './CategoryBudgetList';
import { BudgetInsights } from './BudgetInsights';
import { BudgetOverview } from './BudgetOverview';
import { BudgetEditSheet } from './BudgetEditSheet';
import { formatCurrency, currentMonthLabel, capitalize } from '../../utils';

type EditSection = 'savings' | 'income' | 'expenses' | 'investments';

interface Props {
  user: User;
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  categoryTotals: Record<string, number>;   // expense totals (current month)
}

const currentMonth = new Date().toISOString().slice(0, 7);

export function BudgetScreenV2({
  user, transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, categoryTotals,
}: Props) {
  const { categories, visibleCategories, enableInvestments } = useSettings();
  const {
    budget, setSavingsTarget, setCategoryBudget, setIncomeBudget, setInvestmentBudget,
    acceptSuggestion, resetAll, hasBudget,
    monthlyStatus, monthlySource, confirmCurrentMonth, copyFromPreviousMonth,
  } = useBudget(user);

  const [editOpen, setEditOpen] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>('expenses');
  const [focusCategory, setFocusCategory] = useState<string | null>(null);

  const expenseCats    = useMemo(() => visibleCategories.filter(c => c.kind === 'expense'),    [visibleCategories]);
  const incomeCats     = useMemo(() => visibleCategories.filter(c => c.kind === 'income'),     [visibleCategories]);
  const investmentCats = useMemo(() => visibleCategories.filter(c => c.kind === 'investment'), [visibleCategories]);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Income totals by category (current month, REALIZED only — date <= today).
  // The "programmato" (future-dated) is shown separately as its own bar segment
  // via `scheduledByCategory`, so it must not be folded into the realized spend.
  const incomeCategoryTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'income') continue;
      if (t.date.slice(0, 7) !== currentMonth || t.date > todayISO) continue;
      out[t.category] = (out[t.category] ?? 0) + t.amount;
    }
    return out;
  }, [transactions, todayISO]);

  // Investment totals by category (current month, realized only).
  const investmentCategoryTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'investment') continue;
      if (t.date.slice(0, 7) !== currentMonth || t.date > todayISO) continue;
      out[t.category] = (out[t.category] ?? 0) + t.amount;
    }
    return out;
  }, [transactions, todayISO]);

  const isLearning = transactions.length === 0;
  const expenseSpend = isLearning ? DEMO_CATEGORY_SPEND : categoryTotals;

  const suggested = useMemo(() => {
    if (isLearning) return DEMO_CATEGORY_BUDGETS;
    return suggestBudgets(transactions, expenseCats);
  }, [isLearning, transactions, expenseCats]);

  // End-of-month projection per expense category (variable spend only; same
  // adaptive engine as the global forecast). Empty in demo mode.
  const projectedSpend = useMemo(() => {
    if (isLearning) return {};
    return forecastByCategoryV3(transactions, expenseCats);
  }, [isLearning, transactions, expenseCats]);

  // "Programmato" per category: committed this month but not yet spent —
  // future-dated movements + upcoming recurring occurrences. Shown in the budget
  // bars so you can see they already occupy part of the limit. Covers all types.
  const scheduledByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${currentMonth}-${String(lastDay).padStart(2, '0')}`;
    const add = (id: string, amt: number) => { out[id] = (out[id] ?? 0) + amt; };
    // Real future-dated movements this month (one-offs + recurring templates).
    for (const t of transactions) {
      if (!isPending(t, today) || t.date.slice(0, 7) !== currentMonth) continue;
      add(t.category, ownShare(t));
    }
    // Virtual upcoming recurring occurrences still to come this month.
    for (const t of buildProjectedOccurrences(transactions, today, monthEnd)) {
      if (t.date.slice(0, 7) !== currentMonth) continue;
      add(t.category, ownShare(t));
    }
    return out;
  }, [transactions, currentMonth]);

  // Planned income: sum of income budgets if set, otherwise actual monthly income
  const plannedIncome = useMemo(() => {
    const sum = Object.values(budget.incomeBudgets).reduce((s, v) => s + v, 0);
    return sum > 0 ? sum : monthlyIncome;
  }, [budget.incomeBudgets, monthlyIncome]);

  // End-of-month forecast — Forecast Engine V3. Expenses come from the
  // behavior-aware model; income/investment expectations are unchanged.
  const forecastObj = useMemo(() => {
    if (isLearning) {
      return { expectedIncome: monthlyIncome, projectedExpenses: monthlyExpenses, expectedInvest: monthlyInvestments, savings: 420 };
    }
    const now = new Date();
    const h = history(transactions, 3);
    const today = now.toISOString().slice(0, 10);
    const curKey = now.toISOString().slice(0, 7);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${curKey}-${String(lastDay).padStart(2, '0')}`;
    const upcomingIncome = upcomingRecurringThisMonth(transactions, today, monthEnd, 'income')
      + upcomingPlannedThisMonth(transactions, today, monthEnd, 'income');
    const upcomingInvest = upcomingRecurringThisMonth(transactions, today, monthEnd, 'investment')
      + upcomingPlannedThisMonth(transactions, today, monthEnd, 'investment');
    return forecastSavingsV3({
      transactions,
      expenseCategories: expenseCats,
      monthlyIncome, monthlyInvestments,
      avgIncome: h.avgIncome, avgInvest: h.avgInvest,
      upcomingIncome, upcomingInvest,
      now,
    });
  }, [isLearning, transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, expenseCats]);

  const predicted = useMemo(() => forecastObj.savings, [forecastObj]);

  const activeExpBudgets  = hasBudget ? budget.categoryBudgets  : (isLearning ? DEMO_CATEGORY_BUDGETS : {});
  const activeIncBudgets  = budget.incomeBudgets;
  const activeInvBudgets  = budget.investmentBudgets;

  const plannedExpenses = useMemo(() => {
    const sum = Object.values(activeExpBudgets).reduce((s, v) => s + v, 0);
    // Only fall back to actual spending in demo mode (no real transactions).
    // When the user has real data but hasn't set a budget, show 0 — actual
    // spending is "what happened", not "what was planned".
    return sum > 0 ? sum : (isLearning ? monthlyExpenses : 0);
  }, [activeExpBudgets, monthlyExpenses, isLearning]);

  const plannedInvestments = useMemo(() => {
    const sum = Object.values(activeInvBudgets).reduce((s, v) => s + v, 0);
    return sum > 0 ? sum : (isLearning ? monthlyInvestments : 0);
  }, [activeInvBudgets, monthlyInvestments, isLearning]);

  // Seasonal heads-up: a category that historically spikes this calendar month.
  const season = useMemo(() => (isLearning ? null : seasonalHint(transactions)), [isLearning, transactions]);
  const seasonCat = season ? categories.find(c => c.id === season.categoryId) : null;

  const insights = useMemo(
    () => generateBudgetInsights({
      expenseCategories: expenseCats,
      categorySpend: expenseSpend,
      categoryBudgets: activeExpBudgets,
      predicted,
      savingsTarget: budget.savingsTarget,
    }),
    [expenseCats, expenseSpend, activeExpBudgets, predicted, budget.savingsTarget],
  );

  // Complete (past) months with at least one expense — V3 needs ~3 of them
  // before its statistical signals (tail, pace, counts) become reliable.
  const completedExpenseMonths = useMemo(() => {
    const curKey = new Date().toISOString().slice(0, 7);
    const months = new Set<string>();
    for (const t of transactions) {
      if (t.type === 'expense' && t.date.slice(0, 7) < curKey) {
        months.add(t.date.slice(0, 7));
      }
    }
    return months.size;
  }, [transactions]);

  const openEdit = (section: EditSection = 'expenses', catId?: string) => {
    setEditSection(section);
    setFocusCategory(catId ?? null);
    setEditOpen(true);
  };

  const monthLabel = `${capitalize(currentMonthLabel())} ${new Date().getFullYear()}`;
  const statusMeta: Record<string, { label: string; cls: string }> = {
    confirmed:        { label: 'Confermato',                  cls: 'text-[#8A9270] bg-[#8A9270]/15' },
    draft:            { label: 'Da confermare',               cls: 'text-gold bg-gold/10' },
    auto_initialized: { label: 'Copiato dal mese precedente', cls: 'text-gold bg-gold/10' },
    missing:          { label: 'Non impostato',               cls: 'text-tertiary bg-elevated' },
  };
  const sm = statusMeta[monthlyStatus] ?? statusMeta.missing;

  return (
    <div className="pb-32 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Piano</h1>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sm.cls}`}>{sm.label}</span>
      </div>

      {/* Month + confirm/copy controls */}
      <div className="glass-card rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] text-tertiary uppercase tracking-wide">Budget di</p>
          <p className="text-sm font-semibold text-primary">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {monthlySource === 'copied_from_previous_month' && monthlyStatus !== 'confirmed' && (
            <button onClick={copyFromPreviousMonth}
              className="text-[12px] px-3 py-1.5 rounded-xl bg-elevated text-secondary font-medium hover:bg-card-hover transition-colors">
              Ricopia mese prec.
            </button>
          )}
          {monthlyStatus !== 'confirmed' && (
            <button onClick={confirmCurrentMonth}
              className="text-[12px] px-3 py-1.5 rounded-xl bg-gold/15 text-gold font-medium hover:bg-gold/25 transition-colors">
              Conferma budget
            </button>
          )}
        </div>
      </div>

      {isLearning && (
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5">
          <span className="text-gold">✦</span>
          <p className="text-[13px] text-secondary">Sto imparando le tue abitudini finanziarie.</p>
        </div>
      )}

      {!isLearning && completedExpenseMonths < 3 && (
        <div className="glass-card rounded-2xl px-4 py-3.5 flex items-start gap-3">
          <span className="text-gold mt-0.5">📊</span>
          <p className="text-[13px] text-secondary leading-snug">
            La previsione migliora con più dati. Aggiungi almeno{' '}
            <span className="text-primary font-medium">3 mesi</span> di movimenti
            per stime più affidabili
            {completedExpenseMonths > 0
              ? ` (${completedExpenseMonths} ${completedExpenseMonths === 1 ? 'mese disponibile' : 'mesi disponibili'} su 3).`
              : '.'}
          </p>
        </div>
      )}

      {/* Sunny consiglia */}
      <BudgetInsights insights={insights} />

      {/* 3 — Suggerimento se non ha ancora budget */}
      {!hasBudget && (
        <SuggestedBudgetCard
          categories={expenseCats}
          suggested={suggested}
          onAccept={() => acceptSuggestion(suggested, budget.savingsTarget)}
          onEdit={() => openEdit('expenses')}
        />
      )}

      {/* Banner stagionale */}
      {season && seasonCat && (
        <div className="glass-card rounded-2xl px-4 py-3.5 flex items-start gap-3 border border-gold/15">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: 'rgba(230,185,92,0.12)' }}>🗓️</span>
          <p className="text-[13px] text-primary/90 leading-snug">
            A <span className="font-medium">{capitalize(currentMonthLabel())}</span> di solito spendi di più in{' '}
            <span className="font-medium">{seasonCat.label}</span> (~{formatCurrency(season.monthAvg)} contro {formatCurrency(season.overallAvg)}/mese).
            Ne ho tenuto conto nel budget suggerito.
          </p>
        </div>
      )}

      {/* Panoramica */}
      <div className="space-y-3">
        <BudgetOverview
          plannedIncome={plannedIncome} plannedExpenses={plannedExpenses} plannedInvestments={plannedInvestments}
          showInvest={enableInvestments}
          forecastIncome={forecastObj.expectedIncome}
          forecastExpenses={forecastObj.projectedExpenses}
          forecastInvestments={forecastObj.expectedInvest}
          forecastSavings={forecastObj.savings}
        />
        <SavingsGoalCard predicted={predicted} target={budget.savingsTarget} onEdit={() => openEdit('savings')} />
      </div>

      {/* Entrate previste */}
      <div className="space-y-3">
        <CategoryBudgetList
          categories={incomeCats}
          spend={incomeCategoryTotals}
          budgets={activeIncBudgets}
          mode="income"
          scheduled={scheduledByCategory}
          onEditCategory={id => openEdit('income', id)}
        />
        {incomeCats.length > 0 && Object.keys(activeIncBudgets).length === 0 && (
          <button
            onClick={() => openEdit('income')}
            className="w-full bg-elevated rounded-2xl px-4 py-3 flex items-center gap-2.5 text-left">
            <span className="text-gold">+</span>
            <p className="text-[13px] text-secondary">Aggiungi entrate previste per categoria</p>
          </button>
        )}
      </div>

      {/* Uscite */}
      <CategoryBudgetList
        categories={expenseCats}
        spend={expenseSpend}
        budgets={activeExpBudgets}
        mode="expense"
        projected={projectedSpend}
        scheduled={scheduledByCategory}
        onEditCategory={id => openEdit('expenses', id)}
      />

      {/* Investimenti */}
      {enableInvestments && (
        <div className="space-y-3">
          <CategoryBudgetList
            categories={investmentCats}
            spend={investmentCategoryTotals}
            budgets={activeInvBudgets}
            mode="investment"
            scheduled={scheduledByCategory}
            onEditCategory={id => openEdit('investments', id)}
          />
          {investmentCats.length > 0 && Object.keys(activeInvBudgets).length === 0 && (
            <button
              onClick={() => openEdit('investments')}
              className="w-full bg-elevated rounded-2xl px-4 py-3 flex items-center gap-2.5 text-left">
              <span className="text-gold">+</span>
              <p className="text-[13px] text-secondary">Aggiungi obiettivi di investimento mensili</p>
            </button>
          )}
        </div>
      )}

      <BudgetEditSheet
        open={editOpen}
        expenseCategories={expenseCats}
        incomeCategories={incomeCats}
        investmentCategories={investmentCats}
        savingsTarget={budget.savingsTarget}
        categoryBudgets={budget.categoryBudgets}
        incomeBudgets={budget.incomeBudgets}
        investmentBudgets={budget.investmentBudgets}
        defaultTab={editSection}
        focusCategory={focusCategory}
        onSetTarget={setSavingsTarget}
        onSetCategory={setCategoryBudget}
        onSetIncome={setIncomeBudget}
        onSetInvestment={setInvestmentBudget}
        hasBudget={hasBudget}
        onResetAll={resetAll}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
