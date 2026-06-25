import { useState, useCallback, useEffect, useRef } from 'react';
import {
  doc, collection, onSnapshot, setDoc, getDoc,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { BudgetState } from '../../types';
import {
  MonthlyBudget, monthKeyOf, prevMonthKey, initMonthlyBudget,
  applyMonthlyBudgetEdit, confirmMonthlyBudget, monthlyToBudgetState,
  shouldShowBudgetSetupPrompt,
} from '../../features/budget/monthlyBudget';

const DEFAULT_BUDGET: BudgetState = {
  savingsTarget: 500,
  categoryBudgets: {},
  incomeBudgets: {},
  investmentBudgets: {},
  suggestionAccepted: false,
};

/** Values shown for a month that has no snapshot yet (nothing planned). */
const EMPTY_VALUES: BudgetState = {
  savingsTarget: 0,
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
const monthlyCol = (user: User) => collection(db, 'users', user.uid, 'budgetHistory');
const monthlyDoc = (user: User, month: string) => doc(db, 'users', user.uid, 'budgetHistory', month);

/** Values portion shared between BudgetState and MonthlyBudget. */
function valuesOf(b: BudgetState) {
  return {
    savingsTarget: b.savingsTarget,
    categoryBudgets: b.categoryBudgets,
    incomeBudgets: b.incomeBudgets,
    investmentBudgets: b.investmentBudgets,
    suggestionAccepted: b.suggestionAccepted,
  };
}

/**
 * Budget configuration with MONTHLY snapshots (section 17).
 *
 * - `users/{uid}/meta/budget` is kept as the backward-compatible mirror of the
 *   CURRENT month's values, so the existing screens keep working unchanged.
 * - `users/{uid}/budgetHistory/{YYYY-MM}` holds one snapshot per month with a
 *   status (missing/auto_initialized/draft/confirmed). At month rollover the
 *   previous month stays in history and a new month is auto-initialized
 *   (copying the previous values) but left UNCONFIRMED until the user confirms.
 */
export function useBudget(user: User | null) {
  const [budget, setBudget] = useState<BudgetState>(() => loadLocal(user) ?? DEFAULT_BUDGET);
  const [monthly, setMonthly] = useState<MonthlyBudget | null>(null);
  const [history, setHistory] = useState<MonthlyBudget[]>([]);
  // Latest monthly snapshot, used by writers without re-subscribing.
  const monthlyRef = useRef<MonthlyBudget | null>(null);
  monthlyRef.current = monthly;
  // Live mirrors of budget + history so month-parameterized writers read fresh
  // values without re-creating callbacks on every change.
  const budgetRef = useRef<BudgetState>(budget);
  budgetRef.current = budget;
  const historyRef = useRef<MonthlyBudget[]>(history);
  historyRef.current = history;

  // Current month key — stable for the session (recomputed on remount).
  const currentMonth = monthKeyOf(new Date());

  // ── meta/budget mirror (legacy, current-month values) ──────────────────────
  useEffect(() => {
    if (!user) { setBudget(DEFAULT_BUDGET); return; }
    const cached = loadLocal(user);
    if (cached) setBudget(cached);

    const ref = budgetDoc(user);
    return onSnapshot(ref, snap => {
      if (!snap.exists()) {
        if (!snap.metadata.fromCache) setDoc(ref, cached ?? DEFAULT_BUDGET);
        return;
      }
      const next = normalize(snap.data() as Partial<BudgetState>);
      setBudget(next);
      try { localStorage.setItem(keyFor(user), JSON.stringify(next)); } catch { /* ignore */ }
    });
  }, [user?.uid]);

  // ── budgetHistory collection + ensure current month exists ─────────────────
  const ensuredRef = useRef(false);
  useEffect(() => {
    if (!user) { setMonthly(null); setHistory([]); return; }
    ensuredRef.current = false;

    return onSnapshot(monthlyCol(user), snap => {
      const list: MonthlyBudget[] = snap.docs.map(d => d.data() as MonthlyBudget);
      list.sort((a, b) => b.month.localeCompare(a.month));
      setHistory(list);
      const cur = list.find(m => m.month === currentMonth) ?? null;
      setMonthly(cur);

      // Server-confirmed missing current month → auto-initialize (once).
      if (!cur && !snap.metadata.fromCache && !ensuredRef.current) {
        ensuredRef.current = true;
        const previous = list.find(m => m.month === prevMonthKey(currentMonth)) ?? null;
        const legacy = loadLocal(user) ?? budget;
        const created = initMonthlyBudget({ month: currentMonth, previous, legacy });
        setDoc(monthlyDoc(user, currentMonth), created).catch(() => { /* non-fatal */ });
        // Mirror the (copied) values into meta/budget so the screens reflect them.
        setDoc(budgetDoc(user), monthlyToBudgetState(created)).catch(() => {});
      }
    });
  }, [user?.uid, currentMonth]);

  // ── Writers ────────────────────────────────────────────────────────────────

  /** Apply a values change to BOTH the legacy mirror and the monthly snapshot. */
  const update = useCallback((patch: (prev: BudgetState) => BudgetState) => {
    setBudget(prev => {
      const next = patch(prev);
      try { localStorage.setItem(keyFor(user), JSON.stringify(next)); } catch { /* ignore */ }
      if (user) {
        setDoc(budgetDoc(user), next);
        const base = monthlyRef.current ?? initMonthlyBudget({ month: currentMonth, legacy: next });
        const updated = applyMonthlyBudgetEdit(base, valuesOf(next));
        setDoc(monthlyDoc(user, currentMonth), updated).catch(() => {});
      }
      return next;
    });
  }, [user, currentMonth]);

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

  const resetAll = useCallback(() => {
    update(prev => ({
      ...prev,
      categoryBudgets: {},
      incomeBudgets: {},
      investmentBudgets: {},
      suggestionAccepted: false,
    }));
  }, [update]);

  /** Confirm the current month's budget (used by the setup prompt + budget UI). */
  const confirmCurrentMonth = useCallback(() => {
    if (!user) return;
    const base = monthlyRef.current ?? initMonthlyBudget({ month: currentMonth, legacy: budget });
    const confirmed = confirmMonthlyBudget(applyMonthlyBudgetEdit(base, valuesOf(budget)));
    setMonthly(confirmed);
    setDoc(monthlyDoc(user, currentMonth), confirmed).catch(() => {});
    setDoc(budgetDoc(user), monthlyToBudgetState(confirmed)).catch(() => {});
  }, [user, currentMonth, budget]);

  /** Re-copy the previous month's values into the current (unconfirmed) month. */
  const copyFromPreviousMonth = useCallback(() => {
    if (!user) return;
    const previous = history.find(m => m.month === prevMonthKey(currentMonth)) ?? null;
    if (!previous) return;
    const created = initMonthlyBudget({ month: currentMonth, previous });
    setMonthly(created);
    setDoc(monthlyDoc(user, currentMonth), created).catch(() => {});
    setDoc(budgetDoc(user), monthlyToBudgetState(created)).catch(() => {});
  }, [user, currentMonth, history]);

  // ── Arbitrary-month navigation (Piano tab) ───────────────────────────────────
  // Reads/writes any month's snapshot. The CURRENT month keeps its existing path
  // (also mirrors meta/budget); OTHER months write ONLY budgetHistory/{month}, so
  // navigating/editing a past or future month never disturbs the current month.

  /** The budget values for `month` (live mirror for the current month). */
  const valuesForMonth = useCallback((month: string): BudgetState => {
    if (month === currentMonth) return budgetRef.current;
    const snap = historyRef.current.find(m => m.month === month);
    return snap ? monthlyToBudgetState(snap) : EMPTY_VALUES;
  }, [currentMonth]);

  const statusForMonth = useCallback((month: string): MonthlyBudget['status'] =>
    month === currentMonth
      ? (monthlyRef.current?.status ?? 'missing')
      : (historyRef.current.find(m => m.month === month)?.status ?? 'missing'),
  [currentMonth]);

  const sourceForMonth = useCallback((month: string): MonthlyBudget['source'] | undefined =>
    month === currentMonth
      ? monthlyRef.current?.source
      : historyRef.current.find(m => m.month === month)?.source,
  [currentMonth]);

  /** Apply a values change to `month`'s snapshot (current month also mirrors). */
  const updateMonth = useCallback((month: string, mutate: (prev: BudgetState) => BudgetState) => {
    if (!user) return;
    if (month === currentMonth) { update(mutate); return; }
    const next = mutate(valuesForMonth(month));
    const snap = historyRef.current.find(m => m.month === month) ?? null;
    const base = snap ?? initMonthlyBudget({
      month,
      previous: historyRef.current.find(m => m.month === prevMonthKey(month)) ?? null,
    });
    const updated = applyMonthlyBudgetEdit(base, valuesOf(next));
    setHistory(h => [...h.filter(m => m.month !== month), updated].sort((a, b) => b.month.localeCompare(a.month)));
    setDoc(monthlyDoc(user, month), updated).catch(() => { /* non-fatal */ });
  }, [user, currentMonth, update, valuesForMonth]);

  const setSavingsTargetFor = useCallback((month: string, n: number) => {
    updateMonth(month, prev => ({ ...prev, savingsTarget: Math.max(0, Math.round(n)) }));
  }, [updateMonth]);

  const setCategoryBudgetFor = useCallback((month: string, catId: string, n: number) => {
    updateMonth(month, prev => {
      const categoryBudgets = { ...prev.categoryBudgets };
      if (n > 0) categoryBudgets[catId] = Math.round(n); else delete categoryBudgets[catId];
      return { ...prev, categoryBudgets };
    });
  }, [updateMonth]);

  const setIncomeBudgetFor = useCallback((month: string, catId: string, n: number) => {
    updateMonth(month, prev => {
      const incomeBudgets = { ...prev.incomeBudgets };
      if (n > 0) incomeBudgets[catId] = Math.round(n); else delete incomeBudgets[catId];
      return { ...prev, incomeBudgets };
    });
  }, [updateMonth]);

  const setInvestmentBudgetFor = useCallback((month: string, catId: string, n: number) => {
    updateMonth(month, prev => {
      const investmentBudgets = { ...prev.investmentBudgets };
      if (n > 0) investmentBudgets[catId] = Math.round(n); else delete investmentBudgets[catId];
      return { ...prev, investmentBudgets };
    });
  }, [updateMonth]);

  const resetAllFor = useCallback((month: string) => {
    updateMonth(month, prev => ({
      ...prev, categoryBudgets: {}, incomeBudgets: {}, investmentBudgets: {}, suggestionAccepted: false,
    }));
  }, [updateMonth]);

  /** Confirm an arbitrary month's budget. */
  const confirmMonth = useCallback((month: string) => {
    if (!user) return;
    if (month === currentMonth) { confirmCurrentMonth(); return; }
    const snap = historyRef.current.find(m => m.month === month) ?? null;
    const base = snap ?? initMonthlyBudget({
      month, previous: historyRef.current.find(m => m.month === prevMonthKey(month)) ?? null,
    });
    const confirmed = confirmMonthlyBudget(base);
    setHistory(h => [...h.filter(m => m.month !== month), confirmed].sort((a, b) => b.month.localeCompare(a.month)));
    setDoc(monthlyDoc(user, month), confirmed).catch(() => { /* non-fatal */ });
  }, [user, currentMonth, confirmCurrentMonth]);

  /** Re-copy the previous month's values into an arbitrary (unconfirmed) month. */
  const copyPrevInto = useCallback((month: string) => {
    if (!user) return;
    if (month === currentMonth) { copyFromPreviousMonth(); return; }
    const previous = historyRef.current.find(m => m.month === prevMonthKey(month)) ?? null;
    if (!previous) return;
    const created = initMonthlyBudget({ month, previous });
    setHistory(h => [...h.filter(m => m.month !== month), created].sort((a, b) => b.month.localeCompare(a.month)));
    setDoc(monthlyDoc(user, month), created).catch(() => { /* non-fatal */ });
  }, [user, currentMonth, copyFromPreviousMonth]);

  const hasBudget =
    budget.suggestionAccepted ||
    Object.keys(budget.categoryBudgets).length > 0 ||
    Object.keys(budget.incomeBudgets).length > 0 ||
    Object.keys(budget.investmentBudgets).length > 0;

  return {
    budget,
    setSavingsTarget, setCategoryBudget, setIncomeBudget, setInvestmentBudget,
    acceptSuggestion, resetAll, hasBudget,
    // Monthly extensions
    currentMonth,
    monthly,
    monthlyStatus: monthly?.status ?? 'missing',
    monthlySource: monthly?.source,
    copiedFromMonth: monthly?.copiedFromMonth,
    budgetHistory: history,
    confirmCurrentMonth,
    copyFromPreviousMonth,
    showBudgetPrompt: shouldShowBudgetSetupPrompt(monthly),
    // Arbitrary-month navigation (Piano tab)
    valuesForMonth, statusForMonth, sourceForMonth,
    setSavingsTargetFor, setCategoryBudgetFor, setIncomeBudgetFor, setInvestmentBudgetFor,
    resetAllFor, confirmMonth, copyPrevInto,
  };
}
