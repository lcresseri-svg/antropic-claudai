import { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { useBudget } from '../../shared/hooks/useBudget';
import {
  suggestBudgets, forecastSavings, generateBudgetInsights, seasonalHint,
  seasonalMonthlyAverage, DEMO_CATEGORY_SPEND, DEMO_CATEGORY_BUDGETS,
} from './budgetUtils';
import { upcomingRecurringThisMonth } from '../../shared/recurrence';
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

export function BudgetScreen({
  user, transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, categoryTotals,
}: Props) {
  const { categories, enableInvestments } = useSettings();
  const {
    budget, setSavingsTarget, setCategoryBudget, setIncomeBudget, setInvestmentBudget,
    acceptSuggestion, resetAll, hasBudget,
  } = useBudget(user);

  const [editOpen, setEditOpen] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>('expenses');
  const [focusCategory, setFocusCategory] = useState<string | null>(null);

  const expenseCats    = useMemo(() => categories.filter(c => c.kind === 'expense'),    [categories]);
  const incomeCats     = useMemo(() => categories.filter(c => c.kind === 'income'),     [categories]);
  const investmentCats = useMemo(() => categories.filter(c => c.kind === 'investment'), [categories]);

  // Income totals by category (current month)
  const incomeCategoryTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'income') continue;
      if (t.date.slice(0, 7) !== currentMonth) continue;
      out[t.category] = (out[t.category] ?? 0) + t.amount;
    }
    return out;
  }, [transactions]);

  // Investment totals by category (current month)
  const investmentCategoryTotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'investment') continue;
      if (t.date.slice(0, 7) !== currentMonth) continue;
      out[t.category] = (out[t.category] ?? 0) + t.amount;
    }
    return out;
  }, [transactions]);

  const isLearning = transactions.length === 0;
  const expenseSpend = isLearning ? DEMO_CATEGORY_SPEND : categoryTotals;

  const suggested = useMemo(() => {
    if (isLearning) return DEMO_CATEGORY_BUDGETS;
    return suggestBudgets(transactions, expenseCats);
  }, [isLearning, transactions, expenseCats]);

  // Planned income: sum of income budgets if set, otherwise actual monthly income
  const plannedIncome = useMemo(() => {
    const sum = Object.values(budget.incomeBudgets).reduce((s, v) => s + v, 0);
    return sum > 0 ? sum : monthlyIncome;
  }, [budget.incomeBudgets, monthlyIncome]);

  // End-of-month forecast — same engine the Insights use, so the two views
  // never contradict each other.
  const predicted = useMemo(() => {
    if (isLearning) return 420;
    const now = new Date();
    const h = history(transactions, 3);
    const seasonal = seasonalMonthlyAverage(transactions, now.getMonth(), now);
    const seasonalAvgExpense = Object.values(seasonal).reduce((s, v) => s + v, 0);
    const today = now.toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${now.toISOString().slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
    const upcomingRecurring = upcomingRecurringThisMonth(transactions, today, monthEnd);
    return forecastSavings({
      monthlyIncome, monthlyExpenses, monthlyInvestments,
      avgIncome: h.avgIncome, avgExpense: h.avgExpense, avgInvest: h.avgInvest,
      seasonalAvgExpense, upcomingRecurring,
    }).savings;
  }, [isLearning, transactions, monthlyIncome, monthlyExpenses, monthlyInvestments]);

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

  const openEdit = (section: EditSection = 'expenses', catId?: string) => {
    setEditSection(section);
    setFocusCategory(catId ?? null);
    setEditOpen(true);
  };

  return (
    <div className="pb-32 space-y-6">
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Budget</h1>

      {isLearning && (
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5">
          <span className="text-gold">✦</span>
          <p className="text-[13px] text-secondary">Sto imparando le tue abitudini finanziarie.</p>
        </div>
      )}

      {/* Panoramica del mese */}
      <div className="space-y-3">
        <BudgetOverview plannedIncome={plannedIncome} plannedExpenses={plannedExpenses} plannedInvestments={plannedInvestments} showInvest={enableInvestments} />
        <SavingsGoalCard predicted={predicted} target={budget.savingsTarget} onEdit={() => openEdit('savings')} />
      </div>

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

      {!hasBudget && (
        <SuggestedBudgetCard
          categories={expenseCats}
          suggested={suggested}
          onAccept={() => acceptSuggestion(suggested, budget.savingsTarget)}
          onEdit={() => openEdit('expenses')}
        />
      )}

      {/* Entrate previste */}
      <div className="space-y-3">
        <CategoryBudgetList
          categories={incomeCats}
          spend={incomeCategoryTotals}
          budgets={activeIncBudgets}
          mode="income"
          onEditCategory={id => openEdit('income', id)}
        />
        {incomeCats.length > 0 && Object.keys(activeIncBudgets).length === 0 && (
          <button
            onClick={() => openEdit('income')}
            className="w-full glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5 text-left">
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
            onEditCategory={id => openEdit('investments', id)}
          />
          {investmentCats.length > 0 && Object.keys(activeInvBudgets).length === 0 && (
            <button
              onClick={() => openEdit('investments')}
              className="w-full glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5 text-left">
              <span className="text-gold">+</span>
              <p className="text-[13px] text-secondary">Aggiungi obiettivi di investimento mensili</p>
            </button>
          )}
        </div>
      )}

      <BudgetInsights insights={insights} />

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
