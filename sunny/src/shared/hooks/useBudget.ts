import { useState, useCallback, useEffect } from 'react';
import { User } from 'firebase/auth';
import { BudgetState } from '../../types';

const DEFAULT_BUDGET: BudgetState = {
  savingsTarget: 500,
  categoryBudgets: {},
  incomeBudgets: {},
  investmentBudgets: {},
  suggestionAccepted: false,
};

const keyFor = (user: User | null) => `sunny:budget:${user?.uid ?? 'anon'}`;

function load(user: User | null): BudgetState {
  try {
    const raw = localStorage.getItem(keyFor(user));
    if (!raw) return DEFAULT_BUDGET;
    const parsed = JSON.parse(raw) as Partial<BudgetState>;
    return {
      savingsTarget: parsed.savingsTarget ?? DEFAULT_BUDGET.savingsTarget,
      categoryBudgets: parsed.categoryBudgets ?? {},
      incomeBudgets: parsed.incomeBudgets ?? {},
      investmentBudgets: parsed.investmentBudgets ?? {},
      suggestionAccepted: parsed.suggestionAccepted ?? false,
    };
  } catch {
    return DEFAULT_BUDGET;
  }
}

/** Local-storage backed budget configuration. No backend required. */
export function useBudget(user: User | null) {
  const [budget, setBudget] = useState<BudgetState>(() => load(user));

  useEffect(() => { setBudget(load(user)); }, [user]);

  const update = useCallback((patch: (prev: BudgetState) => BudgetState) => {
    setBudget(prev => {
      const next = patch(prev);
      try { localStorage.setItem(keyFor(user), JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [user]);

  const setSavingsTarget = useCallback((n: number) => {
    update(prev => ({ ...prev, savingsTarget: Math.max(0, Math.round(n)) }));
  }, [update]);

  const setCategoryBudget = useCallback((catId: string, n: number) => {
    update(prev => {
      const categoryBudgets = { ...prev.categoryBudgets };
      if (n > 0) categoryBudgets[catId] = Math.round(n);
      else delete categoryBudgets[catId];
      return { ...prev, categoryBudgets };
    });
  }, [update]);

  const setIncomeBudget = useCallback((catId: string, n: number) => {
    update(prev => {
      const incomeBudgets = { ...prev.incomeBudgets };
      if (n > 0) incomeBudgets[catId] = Math.round(n);
      else delete incomeBudgets[catId];
      return { ...prev, incomeBudgets };
    });
  }, [update]);

  const setInvestmentBudget = useCallback((catId: string, n: number) => {
    update(prev => {
      const investmentBudgets = { ...prev.investmentBudgets };
      if (n > 0) investmentBudgets[catId] = Math.round(n);
      else delete investmentBudgets[catId];
      return { ...prev, investmentBudgets };
    });
  }, [update]);

  const acceptSuggestion = useCallback((suggested: Record<string, number>, target: number) => {
    update(prev => ({
      ...prev,
      savingsTarget: Math.max(0, Math.round(target)),
      categoryBudgets: { ...suggested },
      suggestionAccepted: true,
    }));
  }, [update]);

  // Clear every budget (categories, income, investments) and forget any
  // accepted suggestion, so "planned" truly returns to nothing.
  const resetAll = useCallback(() => {
    update(prev => ({
      ...prev,
      categoryBudgets: {},
      incomeBudgets: {},
      investmentBudgets: {},
      suggestionAccepted: false,
    }));
  }, [update]);

  const hasBudget =
    budget.suggestionAccepted ||
    Object.keys(budget.categoryBudgets).length > 0 ||
    Object.keys(budget.incomeBudgets).length > 0 ||
    Object.keys(budget.investmentBudgets).length > 0;

  return { budget, setSavingsTarget, setCategoryBudget, setIncomeBudget, setInvestmentBudget, acceptSuggestion, resetAll, hasBudget };
}
