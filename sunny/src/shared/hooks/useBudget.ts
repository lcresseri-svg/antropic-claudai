import { useState, useCallback, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { BudgetState } from '../../types';

const DEFAULT_BUDGET: BudgetState = {
  savingsTarget: 500,
  categoryBudgets: {},
  incomeBudgets: {},
  investmentBudgets: {},
  suggestionAccepted: false,
};

const keyFor = (user: User | null) => `sunny:budget:${user?.uid ?? 'anon'}`;

function normalize(parsed: Partial<BudgetState>): BudgetState {
  return {
    savingsTarget: parsed.savingsTarget ?? DEFAULT_BUDGET.savingsTarget,
    categoryBudgets: parsed.categoryBudgets ?? {},
    incomeBudgets: parsed.incomeBudgets ?? {},
    investmentBudgets: parsed.investmentBudgets ?? {},
    suggestionAccepted: parsed.suggestionAccepted ?? false,
  };
}

/** Read the local cache (fast start + offline fallback). null when absent. */
function loadLocal(user: User | null): BudgetState | null {
  try {
    const raw = localStorage.getItem(keyFor(user));
    if (!raw) return null;
    return normalize(JSON.parse(raw) as Partial<BudgetState>);
  } catch {
    return null;
  }
}

const budgetDoc = (user: User) => doc(db, 'users', user.uid, 'meta', 'budget');

/**
 * Budget configuration synced to Firestore (users/{uid}/meta/budget) so it
 * follows the user across devices. localStorage is kept as a fast-start cache
 * and offline fallback; the budget document is wholly owned by this hook, so we
 * write it in full (no merge) — that keeps deletions/resets working.
 */
export function useBudget(user: User | null) {
  const [budget, setBudget] = useState<BudgetState>(() => loadLocal(user) ?? DEFAULT_BUDGET);

  useEffect(() => {
    if (!user) { setBudget(DEFAULT_BUDGET); return; }

    // Seed immediately from the local cache for a snappy first paint.
    const cached = loadLocal(user);
    if (cached) setBudget(cached);

    const ref = budgetDoc(user);
    return onSnapshot(ref, snap => {
      if (!snap.exists()) {
        // Only seed when the SERVER confirms the doc is missing (a cold cache
        // also reports !exists()). Migrate any pre-existing local budget so
        // nothing is lost when moving from localStorage-only to Firestore.
        if (!snap.metadata.fromCache) {
          setDoc(ref, cached ?? DEFAULT_BUDGET);
        }
        return;
      }
      const next = normalize(snap.data() as Partial<BudgetState>);
      setBudget(next);
      try { localStorage.setItem(keyFor(user), JSON.stringify(next)); } catch { /* ignore */ }
    });
  }, [user]);

  const update = useCallback((patch: (prev: BudgetState) => BudgetState) => {
    setBudget(prev => {
      const next = patch(prev);
      try { localStorage.setItem(keyFor(user), JSON.stringify(next)); } catch { /* ignore */ }
      if (user) setDoc(budgetDoc(user), next);
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
