/**
 * Monthly budget model + pure helpers (section 17).
 *
 * Sunny historically stored a single, month-less budget at users/{uid}/meta/budget.
 * That document is kept as a backward-compatible MIRROR of the current month's
 * budget, but the source of truth for "what was the budget in month M" is now a
 * per-month snapshot in users/{uid}/budgetHistory/{YYYY-MM}.
 *
 * This module is pure (no Firebase, no React) so it can be unit-tested; the
 * persistence/subscription lives in shared/hooks/useBudget.ts.
 */
import { BudgetState } from '../../types';

export type MonthlyBudgetStatus = 'draft' | 'confirmed' | 'missing' | 'auto_initialized';

export type MonthlyBudgetSource =
  | 'manual'
  | 'copied_from_previous_month'
  | 'copied_from_legacy_budget'
  | 'auto_initialized';

export interface MonthlyBudget {
  /** YYYY-MM */
  month: string;
  savingsTarget: number;
  categoryBudgets: Record<string, number>;
  incomeBudgets: Record<string, number>;
  investmentBudgets: Record<string, number>;
  suggestionAccepted: boolean;
  status: MonthlyBudgetStatus;
  source: MonthlyBudgetSource;
  /** When copied, the month it was copied from. */
  copiedFromMonth?: string;
  /** ms-epoch timestamps (portable; matches Transaction.createdAt convention). */
  createdAt?: number;
  updatedAt?: number;
  confirmedAt?: number;
}

// ── Month-key helpers ──────────────────────────────────────────────────────────

/** YYYY-MM for a Date (local calendar). */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Previous YYYY-MM for a YYYY-MM key. */
export function prevMonthKey(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // m is 1-based; m-2 → previous month 0-based
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Conversions to/from the legacy BudgetState ─────────────────────────────────

/** Project a monthly budget down to the legacy BudgetState shape (mirror). */
export function monthlyToBudgetState(m: MonthlyBudget): BudgetState {
  return {
    savingsTarget: m.savingsTarget,
    categoryBudgets: { ...m.categoryBudgets },
    incomeBudgets: { ...m.incomeBudgets },
    investmentBudgets: { ...m.investmentBudgets },
    suggestionAccepted: m.suggestionAccepted,
  };
}

// ── Initialisation / migration ─────────────────────────────────────────────────

export interface InitMonthlyBudgetArgs {
  month: string;
  /** Previous month's snapshot, if any (preferred source). */
  previous?: MonthlyBudget | null;
  /** Legacy meta/budget, used when there is no previous snapshot. */
  legacy?: BudgetState | null;
  /** ms-epoch now. */
  now?: number;
}

/**
 * Build the monthly budget document for `month`, copying values from the
 * previous month (preferred) or the legacy budget, otherwise empty.
 *
 * The result is always NON-confirmed (status 'auto_initialized') so the user is
 * prompted to confirm/adjust it — values may be copied, but intent isn't assumed.
 * Never destructive: callers must not overwrite an already-confirmed month.
 */
export function initMonthlyBudget(args: InitMonthlyBudgetArgs): MonthlyBudget {
  const now = args.now ?? Date.now();
  const base: MonthlyBudget = {
    month: args.month,
    savingsTarget: 0,
    categoryBudgets: {},
    incomeBudgets: {},
    investmentBudgets: {},
    suggestionAccepted: false,
    status: 'auto_initialized',
    source: 'auto_initialized',
    createdAt: now,
    updatedAt: now,
  };

  if (args.previous) {
    return {
      ...base,
      savingsTarget: args.previous.savingsTarget,
      categoryBudgets: { ...args.previous.categoryBudgets },
      incomeBudgets: { ...args.previous.incomeBudgets },
      investmentBudgets: { ...args.previous.investmentBudgets },
      suggestionAccepted: args.previous.suggestionAccepted,
      source: 'copied_from_previous_month',
      copiedFromMonth: args.previous.month,
    };
  }
  if (args.legacy) {
    return {
      ...base,
      savingsTarget: args.legacy.savingsTarget,
      categoryBudgets: { ...args.legacy.categoryBudgets },
      incomeBudgets: { ...(args.legacy.incomeBudgets ?? {}) },
      investmentBudgets: { ...(args.legacy.investmentBudgets ?? {}) },
      suggestionAccepted: args.legacy.suggestionAccepted,
      source: 'copied_from_legacy_budget',
    };
  }
  return base;
}

/** Mark a monthly budget confirmed by the user. */
export function confirmMonthlyBudget(m: MonthlyBudget, now: number = Date.now()): MonthlyBudget {
  return { ...m, status: 'confirmed', confirmedAt: now, updatedAt: now };
}

/**
 * Apply an edit to the monthly budget. Any user edit moves a non-confirmed
 * budget to 'draft' but leaves a 'confirmed' budget confirmed (editing a
 * confirmed budget keeps it confirmed — the user is adjusting an intent they
 * already own).
 */
export function applyMonthlyBudgetEdit(
  m: MonthlyBudget,
  patch: Partial<Pick<MonthlyBudget, 'savingsTarget' | 'categoryBudgets' | 'incomeBudgets' | 'investmentBudgets' | 'suggestionAccepted'>>,
  now: number = Date.now(),
): MonthlyBudget {
  const status: MonthlyBudgetStatus = m.status === 'confirmed' ? 'confirmed' : 'draft';
  return { ...m, ...patch, status, source: 'manual', updatedAt: now };
}

// ── Prompt logic ────────────────────────────────────────────────────────────────

/**
 * Whether to nudge the user to set this month's budget.
 * True when there's no budget for the current month or it isn't confirmed yet.
 */
export function shouldShowBudgetSetupPrompt(current: MonthlyBudget | null | undefined): boolean {
  return !current || current.status !== 'confirmed';
}

/** Human label for a status (UI badges). */
export function monthlyBudgetStatusLabel(status: MonthlyBudgetStatus): string {
  switch (status) {
    case 'confirmed': return 'Confermato';
    case 'draft': return 'Da confermare';
    case 'auto_initialized': return 'Copiato dal mese precedente';
    case 'missing': return 'Non impostato';
  }
}
