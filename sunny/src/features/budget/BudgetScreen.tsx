import { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { useBudget } from '../../shared/hooks/useBudget';
import {
  suggestBudgets, predictedSavings, generateBudgetInsights,
  DEMO_CATEGORY_SPEND, DEMO_CATEGORY_BUDGETS,
} from './budgetUtils';
import { SavingsGoalCard } from './SavingsGoalCard';
import { SuggestedBudgetCard } from './SuggestedBudgetCard';
import { CategoryBudgetList } from './CategoryBudgetList';
import { BudgetInsights } from './BudgetInsights';
import { BudgetEditSheet } from './BudgetEditSheet';

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
  const { categories } = useSettings();
  const {
    budget, setSavingsTarget, setCategoryBudget, setIncomeBudget, setInvestmentBudget,
    acceptSuggestion, hasBudget,
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

  const predicted = isLearning
    ? 420
    : predictedSavings(plannedIncome, monthlyExpenses, monthlyInvestments);

  const activeExpBudgets  = hasBudget ? budget.categoryBudgets  : (isLearning ? DEMO_CATEGORY_BUDGETS : {});
  const activeIncBudgets  = budget.incomeBudgets;
  const activeInvBudgets  = budget.investmentBudgets;

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
    <div className="pb-32 space-y-3">
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-1">Budget</h1>

      {isLearning && (
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5">
          <span className="text-gold">✦</span>
          <p className="text-[13px] text-secondary">Sto imparando le tue abitudini finanziarie.</p>
        </div>
      )}

      <SavingsGoalCard predicted={predicted} target={budget.savingsTarget} onEdit={() => openEdit('savings')} />

      {!hasBudget && (
        <SuggestedBudgetCard
          categories={expenseCats}
          suggested={suggested}
          onAccept={() => acceptSuggestion(suggested, budget.savingsTarget)}
          onEdit={() => openEdit('expenses')}
        />
      )}

      {/* Entrate previste */}
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

      {/* Uscite */}
      <CategoryBudgetList
        categories={expenseCats}
        spend={expenseSpend}
        budgets={activeExpBudgets}
        mode="expense"
        onEditCategory={id => openEdit('expenses', id)}
      />

      {/* Investimenti */}
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
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
