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

interface Props {
  user: User;
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  categoryTotals: Record<string, number>;
}

export function BudgetScreen({
  user, transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, categoryTotals,
}: Props) {
  const { categories } = useSettings();
  const { budget, setSavingsTarget, setCategoryBudget, acceptSuggestion, hasBudget } = useBudget(user);

  const [editOpen, setEditOpen] = useState(false);
  const [focusCategory, setFocusCategory] = useState<string | null>(null);

  const expenseCats = useMemo(
    () => categories.filter(c => c.kind === 'expense'),
    [categories],
  );

  // Before any real data exists, fall back to a demo dataset so the screen
  // feels alive ("learning" phase of the copilot).
  const isLearning = transactions.length === 0;
  const spend = isLearning ? DEMO_CATEGORY_SPEND : categoryTotals;

  const suggested = useMemo(() => {
    if (isLearning) return DEMO_CATEGORY_BUDGETS;
    return suggestBudgets(transactions, expenseCats);
  }, [isLearning, transactions, expenseCats]);

  const predicted = isLearning ? 420 : predictedSavings(monthlyIncome, monthlyExpenses, monthlyInvestments);

  const activeBudgets = hasBudget ? budget.categoryBudgets : (isLearning ? DEMO_CATEGORY_BUDGETS : {});

  const insights = useMemo(
    () => generateBudgetInsights({
      expenseCategories: expenseCats,
      categorySpend: spend,
      categoryBudgets: activeBudgets,
      predicted,
      savingsTarget: budget.savingsTarget,
    }),
    [expenseCats, spend, activeBudgets, predicted, budget.savingsTarget],
  );

  const openEdit = (catId?: string) => { setFocusCategory(catId ?? null); setEditOpen(true); };

  return (
    <div className="pb-32 space-y-3">
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-1">Budget</h1>

      {isLearning && (
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5">
          <span className="text-gold">✦</span>
          <p className="text-[13px] text-secondary">Sto imparando le tue abitudini finanziarie.</p>
        </div>
      )}

      <SavingsGoalCard predicted={predicted} target={budget.savingsTarget} onEdit={() => openEdit()} />

      {!hasBudget && (
        <SuggestedBudgetCard
          categories={expenseCats}
          suggested={suggested}
          onAccept={() => acceptSuggestion(suggested, budget.savingsTarget)}
          onEdit={() => openEdit()}
        />
      )}

      <CategoryBudgetList
        categories={expenseCats}
        spend={spend}
        budgets={activeBudgets}
        onEditCategory={openEdit}
      />

      <BudgetInsights insights={insights} />

      <BudgetEditSheet
        open={editOpen}
        categories={expenseCats}
        savingsTarget={budget.savingsTarget}
        budgets={budget.categoryBudgets}
        focusCategory={focusCategory}
        onSetTarget={setSavingsTarget}
        onSetCategory={setCategoryBudget}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
