// Pure aggregation logic for the "Andamento patrimonio" screen.
// No React, no Firestore — easy to unit-test. Speculare a accountAnalytics.ts,
// but app-wide: THREE stock series over time instead of one account balance.
//
//   total       = liquidity + investments   (investments ALWAYS included here,
//                                            regardless of the includeInvestments
//                                            dashboard preference)
//   liquidity   = Σ account balances  (initial balance + signed cash flow)
//   investments = Σ per-category invested value (initial + deposits − withdrawals,
//                 floored at 0 per category, like useTransactions)
//
// The per-transaction cash math is IDENTICAL to useTransactions.ts (the
// app-wide source of truth):
//   income      → +amount            on account
//   expense     → −ownShare          on account
//   investment  → −investSign·amount on account, +investSign·amount on category
//   transfer    → −amount from account, +amount to toAccount
// so by construction a transfer between tracked accounts never moves the total,
// and an investment deposit moves value liquidity → investments leaving the
// total unchanged.
//
// Investments are counted AT NET DEPOSITED CAPITAL (versato): the manual
// market value (CategoryDef.currentValue) is deliberately IGNORED, so the
// series is net of latent interest/gains and today's total matches the
// dashboard's "Investito" figure. The P/L view stays on the Investimenti
// screen, where the controvalore belongs.
//
// Values are STOCKS: each point is the value AT that date (cumulative), never a
// sum of flows, and gaps forward-fill by construction.

import { Transaction, AccountDef, CategoryDef, ownShare, investSign } from '../../types';
import { capitalize } from '../../utils';

/**
 * "Today" MUST use the same convention as useTransactions' realized filter
 * (UTC `toISOString()`), NOT the local date: otherwise, between local midnight
 * and the UTC midnight, this screen would already count movements dated the new
 * local day while the dashboard still shows them as "Programmato" — and the two
 * liquidity figures would disagree.
 */
const dashboardToday = (now: Date) => now.toISOString().slice(0, 10);

export type WealthPeriod = '1m' | '3m' | '6m' | '1y' | 'all' | 'custom';
export type WealthMetric = 'total' | 'liquidity' | 'investments';

export interface WealthPoint {
  label: string;
  date: string;          // ISO YYYY-MM-DD — the day the values are "as of"
  total: number;
  liquidity: number;
  investments: number;
}

export interface WealthMetricSummary {
  metric: WealthMetric;
  label: string;
  startValue: number;
  endValue: number;
  delta: number;
  deltaPct: number | null;   // null when the start value is ~0 (UI shows "—")
}

export interface WealthPeriodSummary {
  period: WealthPeriod;
  label: string;
  startDate: string;
  endDate: string;
  points: WealthPoint[];
  total: WealthMetricSummary;
  liquidity: WealthMetricSummary;
  investments: WealthMetricSummary;
  minTotal: number;
  maxTotal: number;
  averageTotal: number;
  minLiquidity: number;
  maxLiquidity: number;
  averageLiquidity: number;
  minInvestments: number;
  maxInvestments: number;
  averageInvestments: number;
  bestTotalDay?: WealthPoint;    // point with the largest rise vs the previous point
  worstTotalDay?: WealthPoint;   // point with the largest drop vs the previous point
}

export interface WealthComparison {
  period: WealthPeriod;
  label: string;
  total: WealthMetricSummary;
  liquidity: WealthMetricSummary;
  investments: WealthMetricSummary;
}

export const WEALTH_METRIC_LABEL: Record<WealthMetric, string> = {
  total: 'Patrimonio totale',
  liquidity: 'Liquidità',
  investments: 'Investimenti',
};

export const WEALTH_PERIOD_OPTS: { value: WealthPeriod; label: string }[] = [
  { value: '1m', label: 'Mese' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1A' },
  { value: 'all', label: 'Tutto' },
];

const WEALTH_PERIOD_LABEL: Record<Exclude<WealthPeriod, 'custom'>, string> = {
  '1m': 'Ultimo mese',
  '3m': 'Ultimi 3 mesi',
  '6m': 'Ultimi 6 mesi',
  '1y': 'Ultimo anno',
  all: 'Da sempre',
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

/** Shift an ISO date by whole months, clamping the day (Mar 31 −1m → Feb 28). */
export function shiftMonthsISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + delta, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Movements that count toward wealth: real docs only, never projected rows. */
const counts = (t: Transaction) => !t.projected;

// ── Core sampling engine ──────────────────────────────────────────────────────

interface RawSample { liquidity: number; investments: number; total: number; }

/**
 * Values of the three series at each sample date (ascending). Single forward
 * walk over the (sorted) transactions — O(txs + samples).
 */
function sampleWealth(
  transactions: Transaction[],
  accounts: AccountDef[],
  categories: CategoryDef[],
  sampleDates: string[],
): RawSample[] {
  const txs = transactions.filter(counts).slice().sort((a, b) => a.date.localeCompare(b.date));

  // Liquidity baseline: account initial balances (same seeding as useTransactions).
  const accountBalances: Record<string, number> = {};
  for (const a of accounts) {
    if (a.initialBalance) accountBalances[a.id] = a.initialBalance;
  }
  // Invested capital baseline: per-category initial balance (investment kind).
  const invested: Record<string, number> = {};
  for (const c of categories) {
    if (c.kind === 'investment' && c.initialBalance) invested[c.id] = (invested[c.id] ?? 0) + c.initialBalance;
  }

  const bal = (id: string, delta: number) => { if (!id) return; accountBalances[id] = (accountBalances[id] ?? 0) + delta; };

  const out: RawSample[] = [];
  let i = 0;
  for (const sampleDate of sampleDates) {
    while (i < txs.length && txs[i].date <= sampleDate) {
      const t = txs[i++];
      if (t.type === 'income') bal(t.account, t.amount);
      else if (t.type === 'expense') bal(t.account, -ownShare(t));
      else if (t.type === 'investment') {
        bal(t.account, -investSign(t) * t.amount);
        invested[t.category] = (invested[t.category] ?? 0) + investSign(t) * t.amount;
      } else if (t.type === 'transfer') {
        bal(t.account, -t.amount);
        if (t.toAccount) bal(t.toAccount, t.amount);
      }
    }

    let liquidity = 0;
    for (const v of Object.values(accountBalances)) liquidity += v;

    // Per-category floor at 0 (mirror useTransactions) — net deposited capital,
    // never the manual market value.
    let investments = 0;
    for (const v of Object.values(invested)) investments += Math.max(0, v);

    out.push({ liquidity: r2(liquidity), investments: r2(investments), total: r2(liquidity + investments) });
  }
  return out;
}

// ── Period ranges & bucketing ─────────────────────────────────────────────────

export interface WealthRange { startISO: string; endISO: string; label: string; }

export function getWealthRange(
  period: WealthPeriod,
  transactions: Transaction[],
  opts?: { now?: Date; customStart?: string; customEnd?: string },
): WealthRange {
  const now = opts?.now ?? new Date();
  const todayISO = dashboardToday(now);
  if (period === 'custom') {
    const startISO = opts?.customStart ?? shiftMonthsISO(todayISO, -1);
    const rawEnd = opts?.customEnd ?? todayISO;
    return { startISO, endISO: rawEnd <= todayISO ? rawEnd : todayISO, label: 'Personalizzato' };
  }
  if (period === 'all') {
    const dates = transactions.filter(counts).map(t => t.date).filter(d => d <= todayISO);
    const first = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : shiftMonthsISO(todayISO, -12);
    return { startISO: first < todayISO ? first : shiftMonthsISO(todayISO, -1), endISO: todayISO, label: WEALTH_PERIOD_LABEL.all };
  }
  const months = period === '1m' ? 1 : period === '3m' ? 3 : period === '6m' ? 6 : 12;
  return { startISO: shiftMonthsISO(todayISO, -months), endISO: todayISO, label: WEALTH_PERIOD_LABEL[period] };
}

type BucketStep = { kind: 'days'; n: number } | { kind: 'months'; n: number };

function bucketStep(period: WealthPeriod, startISO: string, endISO: string): BucketStep {
  switch (period) {
    case '1m': return { kind: 'days', n: 1 };      // daily
    case '3m': return { kind: 'days', n: 7 };      // weekly
    case '6m': return { kind: 'days', n: 14 };     // biweekly
    case '1y': return { kind: 'months', n: 1 };    // monthly
    case 'all': return { kind: 'months', n: 1 };   // monthly
    case 'custom': {
      // Auto: pick a granularity that keeps the point count chart-friendly.
      const days = Math.round((Date.parse(endISO) - Date.parse(startISO)) / 86400000);
      if (days <= 45) return { kind: 'days', n: 1 };
      if (days <= 150) return { kind: 'days', n: 7 };
      if (days <= 320) return { kind: 'days', n: 14 };
      return { kind: 'months', n: 1 };
    }
  }
}

/** Sample dates from start to end (both included), stepping by the bucket. */
function buildSampleDates(startISO: string, endISO: string, step: BucketStep): string[] {
  const dates: string[] = [];
  let d = startISO;
  let guard = 800;
  while (d < endISO && guard-- > 0) {
    dates.push(d);
    d = step.kind === 'days' ? addDaysISO(d, step.n) : shiftMonthsISO(d, step.n);
  }
  dates.push(endISO); // the closing snapshot is always sampled exactly
  return dates;
}

function pointLabel(iso: string, step: BucketStep, spansYears: boolean): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (step.kind === 'months') {
    const month = capitalize(date.toLocaleString('it-IT', { month: 'short' }).replace('.', ''));
    return spansYears ? `${month} ${String(y).slice(2)}` : month;
  }
  return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).replace('.', '');
}

// ── Public builders ───────────────────────────────────────────────────────────

export interface WealthHistoryOpts {
  now?: Date;
  customStart?: string;
  customEnd?: string;
}

/** The three wealth series over the period, one point per bucket end. */
export function buildWealthHistory(
  transactions: Transaction[],
  accounts: AccountDef[],
  categories: CategoryDef[],
  period: WealthPeriod,
  opts?: WealthHistoryOpts,
): WealthPoint[] {
  const range = getWealthRange(period, transactions, opts);
  const step = bucketStep(period, range.startISO, range.endISO);
  const dates = buildSampleDates(range.startISO, range.endISO, step);
  const spansYears = range.startISO.slice(0, 4) !== range.endISO.slice(0, 4);
  const samples = sampleWealth(transactions, accounts, categories, dates);
  return dates.map((date, i) => ({
    label: pointLabel(date, step, spansYears),
    date,
    total: samples[i].total,
    liquidity: samples[i].liquidity,
    investments: samples[i].investments,
  }));
}

function metricSummary(metric: WealthMetric, startValue: number, endValue: number): WealthMetricSummary {
  const delta = r2(endValue - startValue);
  const deltaPct = Math.abs(startValue) < EPS ? null : r2(((endValue - startValue) / Math.abs(startValue)) * 100);
  return { metric, label: WEALTH_METRIC_LABEL[metric], startValue, endValue, delta, deltaPct };
}

/** Full summary for one period: series + per-metric deltas + period statistics. */
export function buildWealthPeriodSummary(
  transactions: Transaction[],
  accounts: AccountDef[],
  categories: CategoryDef[],
  period: WealthPeriod,
  opts?: WealthHistoryOpts,
): WealthPeriodSummary {
  const range = getWealthRange(period, transactions, opts);
  const points = buildWealthHistory(transactions, accounts, categories, period, opts);
  const first = points[0];
  const last = points[points.length - 1];

  const stats = (get: (p: WealthPoint) => number) => {
    const vals = points.map(get);
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: r2(vals.reduce((s, v) => s + v, 0) / vals.length),
    };
  };
  const st = stats(p => p.total);
  const sl = stats(p => p.liquidity);
  const si = stats(p => p.investments);

  // Best/worst movement between consecutive points (only meaningful moves).
  let bestTotalDay: WealthPoint | undefined;
  let worstTotalDay: WealthPoint | undefined;
  let bestDelta = 0, worstDelta = 0;
  for (let i = 1; i < points.length; i++) {
    const d = points[i].total - points[i - 1].total;
    if (d > bestDelta + EPS) { bestDelta = d; bestTotalDay = points[i]; }
    if (d < worstDelta - EPS) { worstDelta = d; worstTotalDay = points[i]; }
  }

  return {
    period,
    label: range.label,
    startDate: range.startISO,
    endDate: range.endISO,
    points,
    total: metricSummary('total', first.total, last.total),
    liquidity: metricSummary('liquidity', first.liquidity, last.liquidity),
    investments: metricSummary('investments', first.investments, last.investments),
    minTotal: st.min, maxTotal: st.max, averageTotal: st.avg,
    minLiquidity: sl.min, maxLiquidity: sl.max, averageLiquidity: sl.avg,
    minInvestments: si.min, maxInvestments: si.max, averageInvestments: si.avg,
    bestTotalDay,
    worstTotalDay,
  };
}

const COMPARISON_LABEL: Record<string, string> = { '1m': 'Mese', '3m': '3 mesi', '6m': '6 mesi', '1y': '1 anno' };

/**
 * Start→end variation over the trailing 1M / 3M / 6M / 1A windows, for each
 * metric. Samples only the two boundary dates per window — cheap.
 */
export function buildWealthComparisons(
  transactions: Transaction[],
  accounts: AccountDef[],
  categories: CategoryDef[],
  opts?: { now?: Date },
): WealthComparison[] {
  const now = opts?.now ?? new Date();
  const todayISO = dashboardToday(now);
  const periods: Exclude<WealthPeriod, 'all' | 'custom'>[] = ['1m', '3m', '6m', '1y'];
  return periods.map(period => {
    const months = period === '1m' ? 1 : period === '3m' ? 3 : period === '6m' ? 6 : 12;
    const startISO = shiftMonthsISO(todayISO, -months);
    const [s, e] = sampleWealth(transactions, accounts, categories, [startISO, todayISO]);
    return {
      period,
      label: COMPARISON_LABEL[period],
      total: metricSummary('total', s.total, e.total),
      liquidity: metricSummary('liquidity', s.liquidity, e.liquidity),
      investments: metricSummary('investments', s.investments, e.investments),
    };
  });
}

/**
 * Deterministic one-liner explaining the period (no AI): reads the sign of the
 * three deltas and picks the matching sentence.
 */
export function buildWealthNote(summary: WealthPeriodSummary): string {
  const t = summary.total.delta, l = summary.liquidity.delta, inv = summary.investments.delta;
  const up = (v: number) => v > EPS, down = (v: number) => v < -EPS;

  if (!up(t) && !down(t)) {
    if (up(inv) && down(l)) return 'Patrimonio stabile: la liquidità si è spostata verso gli investimenti senza variare il totale.';
    if (down(inv) && up(l)) return 'Patrimonio stabile: parte degli investimenti è tornata in liquidità senza variare il totale.';
    return 'Patrimonio sostanzialmente stabile nel periodo.';
  }
  if (up(t)) {
    if (down(l) && up(inv)) return 'Il patrimonio cresce, ma la liquidità è diminuita: una parte della crescita arriva dagli investimenti.';
    if (up(l) && up(inv)) return 'Il patrimonio cresce su entrambi i fronti: liquidità e investimenti sono aumentati.';
    if (up(l) && down(inv)) return 'Il patrimonio cresce grazie alla liquidità, mentre gli investimenti sono calati.';
    return 'Il patrimonio è cresciuto nel periodo.';
  }
  if (up(l) && down(inv)) return 'Il patrimonio cala per effetto degli investimenti, mentre la liquidità è aumentata.';
  if (down(l) && up(inv)) return 'Il patrimonio cala: la liquidità è scesa più di quanto siano cresciuti gli investimenti.';
  if (down(l) && down(inv)) return 'Il patrimonio è diminuito: sia la liquidità sia gli investimenti sono calati.';
  return 'Il patrimonio è diminuito nel periodo.';
}
