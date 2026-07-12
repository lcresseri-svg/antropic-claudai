/**
 * Piano mensile V2 (admin-only, flag `monthly_plan_v2`) — pure builders.
 *
 * users/{uid}/monthlyPlans/{YYYY-MM} — the PLAN for a month: expected income,
 * savings/investment targets, category budgets and planned events. Always kept
 * distinct from the CONSUNTIVO (recorded transactions) and from the FORECAST
 * (engine estimates): a plan never mutates because reality happened.
 *
 * A plan can be seeded three ways (source):
 *  - copied_from_previous_month  values of the prior plan, explicit copiedFrom;
 *  - from_recurring              expected income/budgets derived from active
 *                                recurring series + seasonal medians;
 *  - manual                      edited by hand.
 * Every seed starts as `draft`; only an explicit user action confirms it.
 */
import { Transaction, ownShare } from '../../types';
import { recurringMonthlyEquivalent } from '../../shared/recurrence';

export const MONTHLY_PLAN_VERSION = 1;

export type PlanStatus = 'draft' | 'confirmed';
export type PlanSource = 'manual' | 'copied_from_previous_month' | 'from_recurring' | 'auto';
export type PlannedEventKind = 'one_off' | 'seasonal' | 'exceptional';

export interface PlannedEvent {
  id: string;
  date: string;          // YYYY-MM-DD inside the plan month
  description: string;
  amount: number;
  kind: PlannedEventKind;
}

export interface MonthlyPlanV2 {
  month: string;         // YYYY-MM (== doc id)
  version: number;
  expectedIncome: number;
  savingsTarget: number;
  investmentTarget: number;
  categoryBudgets: Record<string, number>;
  plannedEvents: PlannedEvent[];
  status: PlanStatus;
  source: PlanSource;
  copiedFrom?: string;   // YYYY-MM of the source plan
  createdAt: number;
  updatedAt: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function planMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function prevPlanMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

/** Copy the previous month's plan into `month` (explicit copiedFrom, draft). */
export function copyPlanFromPrevious(previous: MonthlyPlanV2, month: string, now = Date.now()): MonthlyPlanV2 {
  return {
    month,
    version: MONTHLY_PLAN_VERSION,
    expectedIncome: previous.expectedIncome,
    savingsTarget: previous.savingsTarget,
    investmentTarget: previous.investmentTarget,
    categoryBudgets: { ...previous.categoryBudgets },
    // Events are month-specific: one-offs don't repeat, seasonal ones must be
    // re-proposed from history, so the copy starts with none.
    plannedEvents: [],
    status: 'draft',
    source: 'copied_from_previous_month',
    copiedFrom: previous.month,
    createdAt: now,
    updatedAt: now,
  };
}

/** Median of a category's expense totals for `month`'s calendar month in past years. */
function seasonalMedianFor(transactions: Transaction[], categoryId: string, month: string): number | null {
  const mm = month.slice(5, 7);
  const byYear = new Map<string, number>();
  for (const t of transactions) {
    if (t.projected || t.type !== 'expense' || t.category !== categoryId) continue;
    const [y, m] = [t.date.slice(0, 4), t.date.slice(5, 7)];
    const ym = `${y}-${m}`;
    if (m !== mm || ym >= month) continue;
    byYear.set(y, (byYear.get(y) ?? 0) + ownShare(t));
  }
  const values = [...byYear.values()].sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/**
 * Seed a plan for `month` from the data itself:
 *  - expectedIncome: monthly equivalent of active recurring income series;
 *  - categoryBudgets: recurring monthly equivalent per category, raised to the
 *    seasonal median when that month is historically more expensive;
 *  - plannedEvents: future one-off expenses already recorded inside the month
 *    (kind one_off) — never duplicated into categoryBudgets.
 */
export function buildPlanFromRecurring(
  transactions: Transaction[],
  expenseCategoryIds: string[],
  month: string,
  todayISO: string,
  now = Date.now(),
): MonthlyPlanV2 {
  const expectedIncome = r2(recurringMonthlyEquivalent(transactions, 'income', todayISO));
  const investmentTarget = r2(recurringMonthlyEquivalent(transactions, 'investment', todayISO));

  const categoryBudgets: Record<string, number> = {};
  for (const catId of expenseCategoryIds) {
    const recurringPart = recurringMonthlyEquivalent(
      transactions.filter(t => t.category === catId), 'expense', todayISO);
    const seasonal = seasonalMedianFor(transactions, catId, month);
    const value = Math.max(recurringPart, seasonal ?? 0);
    if (value > 0) categoryBudgets[catId] = Math.round(value);
  }

  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const plannedEvents: PlannedEvent[] = transactions
    .filter(t => t.type === 'expense' && !t.recurring && !t.seriesId && !t.projected
      && t.date > todayISO && t.date >= monthStart && t.date <= monthEnd)
    .map(t => ({ id: t.id, date: t.date, description: t.description, amount: r2(ownShare(t)), kind: 'one_off' as const }));

  const totalBudget = Object.values(categoryBudgets).reduce((s, v) => s + v, 0);
  return {
    month,
    version: MONTHLY_PLAN_VERSION,
    expectedIncome,
    savingsTarget: Math.max(0, Math.round(expectedIncome - totalBudget - investmentTarget)),
    investmentTarget,
    categoryBudgets,
    plannedEvents,
    status: 'draft',
    source: 'from_recurring',
    createdAt: now,
    updatedAt: now,
  };
}

/** Explicit confirmation — the only way a plan leaves `draft`. */
export function confirmPlan(plan: MonthlyPlanV2, now = Date.now()): MonthlyPlanV2 {
  return { ...plan, status: 'confirmed', updatedAt: now };
}

/** Apply a manual edit: values change, source becomes manual, status returns to draft
 *  unless it was already confirmed (a confirmed plan stays confirmed on edit). */
export function editPlan(
  plan: MonthlyPlanV2,
  patch: Partial<Pick<MonthlyPlanV2, 'expectedIncome' | 'savingsTarget' | 'investmentTarget' | 'categoryBudgets' | 'plannedEvents'>>,
  now = Date.now(),
): MonthlyPlanV2 {
  return { ...plan, ...patch, source: 'manual', updatedAt: now };
}

/**
 * Piano vs consuntivo vs forecast — the three figures side by side for the UI.
 * `actual` comes from recorded transactions, `forecast` from the engine; the
 * plan is NEVER adjusted to match either.
 */
export interface PlanComparison {
  plannedExpenses: number;   // Σ category budgets + planned events
  actualExpenses: number;    // consuntivo (recorded so far in the month)
  forecastExpenses: number | null; // engine estimate, when available
}

export function comparePlan(
  plan: MonthlyPlanV2,
  transactions: Transaction[],
  todayISO: string,
  forecastExpenses?: number,
): PlanComparison {
  const monthPrefix = `${plan.month}-`;
  let actual = 0;
  for (const t of transactions) {
    if (t.projected || t.type !== 'expense' || t.recurring) continue;
    if (!t.date.startsWith(monthPrefix) || t.date > todayISO) continue;
    actual += ownShare(t);
  }
  const plannedExpenses = Object.values(plan.categoryBudgets).reduce((s, v) => s + v, 0)
    + plan.plannedEvents.reduce((s, e) => s + e.amount, 0);
  return {
    plannedExpenses: r2(plannedExpenses),
    actualExpenses: r2(actual),
    forecastExpenses: forecastExpenses != null ? r2(forecastExpenses) : null,
  };
}
