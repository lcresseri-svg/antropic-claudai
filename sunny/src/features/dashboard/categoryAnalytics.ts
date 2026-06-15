// Pure aggregation logic for the "Categorie" analytics screen.
// No React, no Firestore — easy to unit-test. All money figures use ownShare()
// (the part of an expense that is actually the user's) and consider ONLY
// realized expense transactions (transfers, income, investments and projected
// future occurrences are excluded).

import { Transaction, ownShare } from '../../types';
import { capitalize } from '../../utils';

export type PeriodType = '1m' | '3m' | '6m' | '12m';

export const PERIOD_MONTHS: Record<PeriodType, number> = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 };

export const PERIOD_OPTS: { value: PeriodType; label: string }[] = [
  { value: '1m',  label: 'Mese' },
  { value: '3m',  label: '3M' },
  { value: '6m',  label: '6M' },
  { value: '12m', label: '12M' },
];

export interface PeriodRange {
  start: Date;       // inclusive — local midnight of the first day
  end: Date;         // inclusive upper bound — `now` for the current period, else last instant of the ending month
  fullEnd: Date;     // last instant of the ending month, regardless of isCurrent (used for elapsed fraction)
  label: string;     // e.g. "Giugno 2026" / "Apr–Giu 2026" / "Lug 2025–Giu 2026"
  months: number;
  isCurrent: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Local YYYY-MM-DD (timezone-safe — never round-trips through UTC). */
export const localISO = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shortMonth = (d: Date) => capitalize(d.toLocaleString('it-IT', { month: 'short' }).replace('.', ''));
const longMonth = (d: Date) => capitalize(d.toLocaleString('it-IT', { month: 'long', year: 'numeric' }));

/**
 * Window of `months` calendar months. `offset` steps back by whole periods
 * (offset 0 = most recent, offset 1 = the immediately preceding period, …).
 */
export function getPeriodRange(period: PeriodType, offset: number, now: Date = new Date()): PeriodRange {
  const months = PERIOD_MONTHS[period];
  const cy = now.getFullYear(), cm = now.getMonth();
  // offset is in months (not periods): each arrow press moves by 1 month,
  // so a 3M/6M/12M window slides month-by-month rather than jumping a full block.
  const endMonth = new Date(cy, cm - offset, 1);
  const startMonth = new Date(cy, cm - offset - (months - 1), 1);
  const isCurrent = offset === 0;
  const fullEnd = new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0, 23, 59, 59, 999);
  const end = isCurrent ? now : fullEnd;

  let label: string;
  if (months === 1) {
    label = longMonth(endMonth);
  } else if (startMonth.getFullYear() === endMonth.getFullYear()) {
    label = `${shortMonth(startMonth)}–${shortMonth(endMonth)} ${endMonth.getFullYear()}`;
  } else {
    label = `${shortMonth(startMonth)} ${startMonth.getFullYear()}–${shortMonth(endMonth)} ${endMonth.getFullYear()}`;
  }

  return { start: startMonth, end, fullEnd, label, months, isCurrent };
}

/** The non-overlapping period immediately before the given one. */
export function getPreviousPeriodRange(period: PeriodType, offset: number, now: Date = new Date()): PeriodRange {
  const months = PERIOD_MONTHS[period];
  return getPeriodRange(period, offset + months, now);
}

/** Fraction (0..1) of the current period already elapsed. 1 for past periods. */
export function periodElapsedFraction(range: PeriodRange, now: Date = new Date()): number {
  if (!range.isCurrent) return 1;
  const span = range.fullEnd.getTime() - range.start.getTime();
  if (span <= 0) return 1;
  const f = (now.getTime() - range.start.getTime()) / span;
  return Math.min(1, Math.max(0, f));
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

const isExpenseIn = (t: Transaction, startISO: string, endISO: string) =>
  t.type === 'expense' && !t.projected && t.date >= startISO && t.date <= endISO;

export interface CategorySpendingSummary {
  categoryId: string;
  amount: number;
  percentageOfTotal: number;
  transactionCount: number;
  avgTransactionAmount: number;
  medianTransactionAmount: number;
  previousAmount: number;
  deltaAmount: number;
  deltaPercentage: number | null;   // null when there's no previous spend to compare against
  budgetAmount?: number;            // budget for the whole period (monthly × months)
  budgetUsedPercentage?: number;
  isOverPace?: boolean;             // spending faster than the budget allows for the elapsed time
}

export interface CategoryAggregation {
  total: number;
  previousTotal: number;
  deltaPercentage: number | null;
  categories: CategorySpendingSummary[]; // sorted by amount desc
}

export function aggregateCategorySpending(
  transactions: Transaction[],
  range: PeriodRange,
  prevRange: PeriodRange,
  opts?: { categoryBudgets?: Record<string, number>; now?: Date },
): CategoryAggregation {
  const startISO = localISO(range.start), endISO = localISO(range.end);
  const prevStartISO = localISO(prevRange.start), prevEndISO = localISO(prevRange.end);

  const lists: Record<string, number[]> = {};
  let total = 0;
  const prev: Record<string, number> = {};
  let previousTotal = 0;

  for (const t of transactions) {
    if (isExpenseIn(t, startISO, endISO)) {
      const v = ownShare(t);
      if (v > 0) { (lists[t.category] ??= []).push(v); total += v; }
    } else if (isExpenseIn(t, prevStartISO, prevEndISO)) {
      const v = ownShare(t);
      if (v > 0) { prev[t.category] = (prev[t.category] ?? 0) + v; previousTotal += v; }
    }
  }

  const months = range.months;
  const elapsed = periodElapsedFraction(range, opts?.now ?? new Date());

  const categories: CategorySpendingSummary[] = Object.entries(lists).map(([categoryId, list]) => {
    const amount = list.reduce((s, v) => s + v, 0);
    const transactionCount = list.length;
    const previousAmount = prev[categoryId] ?? 0;
    const deltaAmount = amount - previousAmount;
    const deltaPercentage = previousAmount > 0 ? (deltaAmount / previousAmount) * 100 : null;

    const monthlyBudget = opts?.categoryBudgets?.[categoryId] ?? 0;
    const budgetAmount = monthlyBudget > 0 ? monthlyBudget * months : undefined;
    const budgetUsedPercentage = budgetAmount ? (amount / budgetAmount) * 100 : undefined;
    const isOverPace = budgetAmount !== undefined ? amount > budgetAmount * elapsed : undefined;

    return {
      categoryId,
      amount,
      percentageOfTotal: total > 0 ? (amount / total) * 100 : 0,
      transactionCount,
      avgTransactionAmount: transactionCount > 0 ? amount / transactionCount : 0,
      medianTransactionAmount: median(list),
      previousAmount,
      deltaAmount,
      deltaPercentage,
      budgetAmount,
      budgetUsedPercentage,
      isOverPace,
    };
  }).sort((a, b) => b.amount - a.amount);

  const deltaPercentage = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null;
  return { total, previousTotal, deltaPercentage, categories };
}

export interface CompositionSegment {
  categoryId: string;     // '__other__' for the aggregated tail
  amount: number;
  percentage: number;
}

/** Top-N categories as individual segments + an aggregated "Altro" tail. */
export function buildComposition(categories: CategorySpendingSummary[], total: number, topN = 4): CompositionSegment[] {
  if (total <= 0 || categories.length === 0) return [];
  const top = categories.slice(0, topN);
  const rest = categories.slice(topN);
  const segments: CompositionSegment[] = top.map(c => ({
    categoryId: c.categoryId,
    amount: c.amount,
    percentage: (c.amount / total) * 100,
  }));
  const restAmount = rest.reduce((s, c) => s + c.amount, 0);
  if (restAmount > 0) {
    segments.push({ categoryId: '__other__', amount: restAmount, percentage: (restAmount / total) * 100 });
  }
  return segments;
}

export interface CategoryTrendPoint {
  label: string;
  amount: number;
  transactionCount: number;
  avgTransactionAmount: number;
}

/**
 * Trend of a single category over time.
 * - `1m`  → weekly buckets within the selected month (≈5 points).
 * - else  → one point per month across the window.
 */
export function aggregateCategoryTrend(
  transactions: Transaction[],
  categoryId: string,
  period: PeriodType,
  offset: number,
  now: Date = new Date(),
): CategoryTrendPoint[] {
  const range = getPeriodRange(period, offset, now);
  const startMonth = range.start;
  // Never count future-dated (planned) movements — cap every bucket at today so
  // the current month/period stops at "now", just like the spending aggregation.
  const todayISO = localISO(now);
  const capTo = (to: string) => (to <= todayISO ? to : todayISO);

  const buckets: { label: string; from: string; to: string }[] = [];
  if (period === '1m') {
    const y = startMonth.getFullYear(), m = startMonth.getMonth();
    const ym = `${y}-${pad(m + 1)}`;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let ds = 1; ds <= daysInMonth; ds += 7) {
      const de = Math.min(ds + 6, daysInMonth);
      buckets.push({ label: String(ds), from: `${ym}-${pad(ds)}`, to: capTo(`${ym}-${pad(de)}`) });
    }
  } else {
    for (let i = 0; i < range.months; i++) {
      const d = new Date(startMonth.getFullYear(), startMonth.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      buckets.push({ label: shortMonth(d), from: `${ym}-01`, to: capTo(`${ym}-${pad(last)}`) });
    }
  }

  return buckets.map(b => {
    let amount = 0, count = 0;
    for (const t of transactions) {
      if (t.type !== 'expense' || t.projected || t.category !== categoryId) continue;
      if (t.date < b.from || t.date > b.to) continue;
      const v = ownShare(t);
      if (v <= 0) continue;
      amount += v; count += 1;
    }
    return { label: b.label, amount, transactionCount: count, avgTransactionAmount: count > 0 ? amount / count : 0 };
  });
}

/** Recent movements of a category within the period, newest first. */
export function getCategoryMovements(transactions: Transaction[], categoryId: string, range: PeriodRange): Transaction[] {
  const startISO = localISO(range.start), endISO = localISO(range.end);
  return transactions
    .filter(t => t.category === categoryId && isExpenseIn(t, startISO, endISO) && ownShare(t) > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * Average monthly spend of a category over the last `monthsBack` FULL months
 * (the current partial month is excluded). Used as the "media storica" baseline.
 */
export function historicalMonthlyAverage(
  transactions: Transaction[],
  categoryId: string,
  now: Date = new Date(),
  monthsBack = 6,
): number {
  const cy = now.getFullYear(), cm = now.getMonth();
  let sum = 0;
  for (let i = 1; i <= monthsBack; i++) {
    const d = new Date(cy, cm - i, 1);
    const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    for (const t of transactions) {
      if (t.type !== 'expense' || t.projected || t.category !== categoryId) continue;
      if (!t.date.startsWith(ym)) continue;
      const v = ownShare(t);
      if (v > 0) sum += v;
    }
  }
  return monthsBack > 0 ? sum / monthsBack : 0;
}
