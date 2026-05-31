import { useState, useCallback, useEffect } from 'react';
import { User } from 'firebase/auth';
import { BudgetState } from '../../types';

const DEFAULT_BUDGET: BudgetState = {
  savingsTarget: 500,
  categoryBudgets: {},
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
      suggestionAccepted: parsed.suggestionAccepted ?? false,
    };
  } catch {
    return DEFAULT_BUDGET;
  }
}

/** Local-storage backed budget configuration. No backend required. */
export function useBudget(user: User | null) {
  const [budget, setBudget] = useState<BudgetState>(() => load(user));

  // Reload when the signed-in user changes.
  useEffect(() => { setBudget(load(user)); }, [user]);

  // Apply a change and persist atomically (functional update avoids stale state).
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

  const acceptSuggestion = useCallback((suggested: Record<string, number>, target: number) => {
    update(() => ({
      savingsTarget: Math.max(0, Math.round(target)),
      categoryBudgets: { ...suggested },
      suggestionAccepted: true,
    }));
  }, [update]);

  const hasBudget = budget.suggestionAccepted || Object.keys(budget.categoryBudgets).length > 0;

  return { budget, setSavingsTarget, setCategoryBudget, acceptSuggestion, hasBudget };
}
