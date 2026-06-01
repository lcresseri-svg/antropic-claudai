import { Transaction, CategoryDef, ownShare } from '../../types';

export type CategoryStatus = 'normal' | 'warning' | 'over';
export type PaceStatus = 'ahead' | 'on' | 'behind';

/** Round to the nearest 10 € for friendlier suggested figures. */
function round10(n: number): number {
  return Math.max(0, Math.round(n / 10) * 10);
}

function daysInMonth(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/** Fraction of the current month already elapsed (0–1, never 0). */
export function monthProgress(now: Date): number {
  return Math.min(1, now.getDate() / daysInMonth(now));
}

/**
 * Average spend per category in a given calendar month (0–11) across past
 * years. The current (partial) month is excluded so it doesn't skew history.
 * Used to make budget suggestions seasonally aware (e.g. gifts in December).
 */
export function seasonalMonthlyAverage(
  transactions: Transaction[],
  monthIdx: number,
  now: Date = new Date(),
): Record<string, number> {
  const curKey = now.toISOString().slice(0, 7);
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 18, 1);
  const byCatYear: Record<string, Record<number, number>> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) === curKey) continue;
    const d = new Date(t.date);
    if (d < cutoff) continue; // only the last ~18 months
    if (d.getMonth() !== monthIdx) continue;
    (byCatYear[t.category] ??= {});
    byCatYear[t.category][d.getFullYear()] = (byCatYear[t.category][d.getFullYear()] ?? 0) + ownShare(t);
  }
  const out: Record<string, number> = {};
  for (const [cat, perYear] of Object.entries(byCatYear)) {
    const vals = Object.values(perYear);
    if (vals.length) out[cat] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  return out;
}

export interface SeasonalHint { categoryId: string; monthAvg: number; overallAvg: number; ratio: number; }

/** Top category that historically spikes in the current calendar month. */
export function seasonalHint(
  transactions: Transaction[],
  now: Date = new Date(),
): SeasonalHint | null {
  const monthIdx = now.getMonth();
  const curKey = now.toISOString().slice(0, 7);
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 18, 1);
  const monthAvg = seasonalMonthlyAverage(transactions, monthIdx, now);
  const overallSum: Record<string, number> = {};
  const monthsByCat: Record<string, Set<string>> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) === curKey) continue;
    if (new Date(t.date) < cutoff) continue; // only the last ~18 months
    overallSum[t.category] = (overallSum[t.category] ?? 0) + ownShare(t);
    (monthsByCat[t.category] ??= new Set()).add(t.date.slice(0, 7));
  }
  let best: SeasonalHint | null = null;
  for (const [cat, ma] of Object.entries(monthAvg)) {
    const overallAvg = (overallSum[cat] ?? 0) / Math.max(1, monthsByCat[cat]?.size ?? 1);
    if (overallAvg <= 0 || ma < 30) continue;
    const ratio = ma / overallAvg;
    if (ratio >= 1.4 && (!best || ratio > best.ratio)) best = { categoryId: cat, monthAvg: ma, overallAvg, ratio };
  }
  return best;
}

/**
 * Suggest a monthly budget per expense category from the average monthly
 * spend over the last ~3 calendar months, raised to the seasonal level when
 * the current calendar month historically runs higher (e.g. December gifts).
 */
export function suggestBudgets(
  transactions: Transaction[],
  expenseCategories: CategoryDef[],
  now: Date = new Date(),
): Record<string, number> {
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1); // start of 3-month window
  const months = new Set<string>();
  const byCat: Record<string, number> = {};

  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const d = new Date(t.date);
    if (d < cutoff) continue;
    months.add(t.date.slice(0, 7));
    byCat[t.category] = (byCat[t.category] ?? 0) + ownShare(t);
  }

  const monthCount = Math.max(1, months.size);
  const seasonal = seasonalMonthlyAverage(transactions, now.getMonth(), now);
  const out: Record<string, number> = {};
  for (const c of expenseCategories) {
    const recentAvg = (byCat[c.id] ?? 0) / monthCount;
    const seasonalAvg = seasonal[c.id] ?? 0;
    // Use the seasonal level if this month is historically heavier for the category.
    const value = Math.max(recentAvg, seasonalAvg);
    if (value > 0) out[c.id] = round10(value);
  }
  return out;
}

/**
 * Forecast end-of-month savings via a simple run-rate on expenses.
 * Income and investments are taken as-is (typically lump sums), expenses are
 * projected from the current daily pace.
 */
export function predictedSavings(
  monthlyIncome: number,
  monthlyExpenses: number,
  monthlyInvestments: number,
  now: Date = new Date(),
): number {
  const projectedExpenses = monthlyExpenses / monthProgress(now);
  return Math.round(monthlyIncome - projectedExpenses - monthlyInvestments);
}

export interface MonthForecast {
  expectedIncome: number;
  projectedExpenses: number;
  expectedInvest: number;
  savings: number;
}

/**
 * Single source of truth for the end-of-month forecast, used by BOTH the
 * Insights engine and the Budget screen so they never contradict each other.
 *
 * - Expenses are projected from the elapsed-time run rate once enough of the
 *   month has passed; early on (a few days) we fall back to the historical
 *   average to avoid wildly inflated estimates.
 * - Income/investments use the higher of "already recorded" and "historical
 *   average", since salaries/contributions often land as a single lump sum.
 */
export function forecastSavings(o: {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  avgIncome?: number;
  avgExpense?: number;
  avgInvest?: number;
  now?: Date;
}): MonthForecast {
  const now = o.now ?? new Date();
  const prog = monthProgress(now);
  const avgExpense = o.avgExpense ?? 0;
  const projectedExpenses = Math.round(
    prog >= 0.15 || avgExpense <= 0 ? o.monthlyExpenses / prog : avgExpense,
  );
  const expectedIncome = Math.round(Math.max(o.monthlyIncome, o.avgIncome ?? 0));
  const expectedInvest = Math.round(Math.max(o.monthlyInvestments, o.avgInvest ?? 0));
  const savings = expectedIncome - projectedExpenses - expectedInvest;
  return { expectedIncome, projectedExpenses, expectedInvest, savings };
}

export function categoryStatus(spent: number, budget: number): CategoryStatus {
  if (budget <= 0) return 'normal';
  const pct = spent / budget;
  if (pct > 1) return 'over';
  if (pct >= 0.8) return 'warning';
  return 'normal';
}

/** Whether spending is ahead of, on, or behind the expected monthly pace. */
export function paceStatus(spent: number, budget: number, now: Date = new Date()): PaceStatus {
  if (budget <= 0) return 'on';
  const expected = budget * monthProgress(now);
  if (spent > expected * 1.15) return 'ahead';   // ahead = spending faster than planned
  if (spent < expected * 0.85) return 'behind';
  return 'on';
}

export interface BudgetInsightInput {
  expenseCategories: CategoryDef[];
  categorySpend: Record<string, number>;
  categoryBudgets: Record<string, number>;
  predicted: number;
  savingsTarget: number;
  now?: Date;
}

/**
 * Generate calm, non-judgmental coaching strings. Never says "hai sforato".
 */
export function generateBudgetInsights({
  expenseCategories, categorySpend, categoryBudgets, predicted, savingsTarget, now = new Date(),
}: BudgetInsightInput): string[] {
  const out: string[] = [];
  const labelOf = (id: string) => expenseCategories.find(c => c.id === id)?.label ?? id;

  // 1 — End-of-month forecast (always shown when there's a target)
  if (savingsTarget > 0) {
    out.push(`Se mantieni questo ritmo chiuderai il mese con circa ${euro(predicted)} di risparmio.`);
  }

  // 2 — Actionable nudge toward the goal: the category most ahead of pace
  const gap = savingsTarget - predicted; // how much we're short of the target
  let worst: { id: string; over: number } | null = null;
  for (const id of Object.keys(categoryBudgets)) {
    const budget = categoryBudgets[id];
    if (budget <= 0) continue;
    const spent = categorySpend[id] ?? 0;
    const expected = budget * monthProgress(now);
    const over = spent - expected;
    if (over > 0 && (!worst || over > worst.over)) worst = { id, over };
  }
  if (gap > 0 && worst) {
    const cut = round10ish(Math.min(worst.over, gap));
    if (cut >= 10) {
      out.push(`Riducendo ${labelOf(worst.id)} di circa ${euro(cut)} questa settimana potresti avvicinarti al tuo obiettivo.`);
    }
  }

  // 3 — Categories ahead of pace (gentle heads-up, max 1)
  if (worst) {
    out.push(`Stai spendendo più del previsto in ${labelOf(worst.id)}.`);
  } else if (savingsTarget > 0 && predicted >= savingsTarget) {
    out.push('Sei in linea con il tuo obiettivo di risparmio. Continua così.');
  }

  return out;
}

function euro(n: number): string {
  return `€${Math.round(Math.abs(n))}`;
}

function round10ish(n: number): number {
  return Math.round(n / 5) * 5; // round to nearest 5 for nudge amounts
}

// ── Demo data ────────────────────────────────────────────────────────────────
// Used as a fallback so the Budget screen feels alive before real data exists.

export const DEMO_CATEGORY_SPEND: Record<string, number> = {
  casa: 1180,
  spesa: 410,
  ristoranti: 280,
  trasporti: 120,
  shopping: 190,
  altro: 60,
};

export const DEMO_CATEGORY_BUDGETS: Record<string, number> = {
  casa: 1200,
  spesa: 450,
  ristoranti: 250,
  trasporti: 150,
  shopping: 200,
  altro: 100,
};
