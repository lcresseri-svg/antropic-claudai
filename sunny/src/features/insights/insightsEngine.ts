import { Transaction, CategoryDef, ownShare, investSign } from '../../types';
import { formatCurrency, capitalize } from '../../utils';
import { monthProgress, forecastSavings, seasonalMonthlyAverage, seasonalVariableMonthly, robustAvg } from '../budget/budgetUtils';
import { forecastSavingsV4 } from '../forecast/v4/forecastCompatV4';
import { mad } from '../forecast/forecastStats';
import { addPeriod, recurringMonthlyEquivalent, upcomingPlannedThisMonth, upcomingRecurringThisMonth, isPending } from '../../shared/recurrence';

/**
 * minDepth convention for push():
 *   'minimal'  — shown to all users regardless of insightDepth setting
 *   'medium'   — shown when insightDepth is 'medium' or 'advanced'
 *   'advanced' — shown only when insightDepth is 'advanced' (default)
 *
 * tone convention:
 *   'positive' — good news, savings, improvements
 *   'neutral'  — informational, reminders
 *   'caution'  — attention needed, overspending, risks
 */
export type InsightCategory = 'alert' | 'forecast' | 'seasonal' | 'trend' | 'habit' | 'highlight';

/** Small chart embedded in an insight explanation. */
export interface InsightChart {
  labels: string[];
  values: number[];
  format?: 'currency' | 'percent';
  highlightIndex?: number; // bar to emphasize (default: last)
  refLine?: number;        // optional dashed reference line (e.g. an average)
  refLabel?: string;
}

/** Human explanation of how/why an insight was produced. */
export interface InsightExplain {
  what: string;  // cosa indica
  how: string;   // come è stato calcolato
  basis: string; // su quali dati / periodo
  chart?: InsightChart;
}

export interface Insight {
  icon: string;
  title: string;
  detail: string;
  accent: string;
  tone: 'positive' | 'neutral' | 'caution';
  urgent?: boolean;
  category: InsightCategory;
  /** Minimum analysis depth at which this insight is shown. Stamped by push(). */
  minDepth?: InsightDepth;
  _family?: string;
  explain?: InsightExplain;
}

type CatLite = { icon: string; label: string };

const ACCENT = {
  good:    '#8A9270',
  warn:    '#E08B8B',
  info:    '#88B0C0',
  gold:    '#E6B95C',
  neutral: '#8B8B8B',
};

// ── Date helpers ──────────────────────────────────────────────────────────────

function ym(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Month key `YYYY-MM` for `offset` months before `now` (0 = current). */
export function monthKey(offset: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return ym(d);
}

function daysUntil(dateStr: string, now: Date = new Date()): number {
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr).getTime() - a.getTime()) / 86400000);
}

function daysInMonth(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

/** Parse YYYY-MM-DD in local time (avoids UTC-midnight timezone shifts). */
function localDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function isWeekend(dateStr: string): boolean {
  const d = localDate(dateStr).getDay();
  return d === 0 || d === 6;
}

function shortMonth(key: string): string {
  return capitalize(localDate(key + '-01').toLocaleString('it-IT', { month: 'short' }).replace('.', ''));
}

function longMonth(key: string): string {
  return capitalize(localDate(key + '-01').toLocaleString('it-IT', { month: 'long' }));
}

function monthNameFromIndex(idx: number): string {
  return capitalize(new Date(2000, idx, 1).toLocaleString('it-IT', { month: 'long' }));
}

// ── History & forecasting ─────────────────────────────────────────────────────

export interface History {
  avgIncome: number;
  avgExpense: number;
  /** Average monthly expense excluding recurring-origin entries (variable only). */
  avgVariableExpense: number;
  avgInvest: number;
  months: number;
}

export function history(transactions: Transaction[], windowN = 3, now: Date = new Date()): History {
  const keys = new Set<string>();
  for (let i = 1; i <= windowN; i++) keys.add(monthKey(i, now));

  const active = new Set<string>();
  let inc = 0, exp = 0, inv = 0;
  const varByMonth: Record<string, number> = {};   // variable spend per month in window
  for (const t of transactions) {
    const k = t.date.slice(0, 7);
    if (!keys.has(k)) continue;
    active.add(k);
    if (t.type === 'income')     inc += t.amount;
    else if (t.type === 'expense') {
      exp += ownShare(t);
      if (!t.seriesId && !t.recurring) varByMonth[k] = (varByMonth[k] ?? 0) + ownShare(t); // variable (non-recurring)
    }
    else if (t.type === 'investment') inv += investSign(t) * t.amount; // net: deposits − withdrawals
  }
  const n = Math.max(1, active.size);
  // Variable average across active months, winsorizing a single outlier month
  // (e.g. a one-off big purchase) so it doesn't inflate the forecast baseline.
  const avgVariableExpense = robustAvg([...active].map(k => varByMonth[k] ?? 0));
  return { avgIncome: inc / n, avgExpense: exp / n, avgVariableExpense, avgInvest: inv / n, months: active.size };
}

export function projectExpenses(monthlyExpenses: number, now: Date = new Date()): number {
  const p = monthProgress(now);
  return p > 0 ? Math.round(monthlyExpenses / p) : monthlyExpenses;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── Monthly stat helpers ──────────────────────────────────────────────────────

interface MonthStats {
  key: string;
  income: number;
  expense: number;
  invest: number;
  savings: number;
  savingsRate: number;
  txCount: number;
}

function monthStats(txs: Transaction[], key: string): MonthStats {
  let income = 0, expense = 0, invest = 0, txCount = 0;
  for (const t of txs) {
    if (!t.date.startsWith(key)) continue;
    txCount++;
    if (t.type === 'income')     income  += t.amount;
    else if (t.type === 'expense')    expense += ownShare(t);
    else if (t.type === 'investment') invest  += investSign(t) * t.amount;
  }
  const savings = income - expense - invest;
  return { key, income, expense, invest, savings, savingsRate: income > 0 ? savings / income : NaN, txCount };
}

/** Stats for the last `n` completed months (offset 1..n), oldest→newest. */
function recentMonths(txs: Transaction[], n: number, now: Date): MonthStats[] {
  return Array.from({ length: n }, (_, i) => monthStats(txs, monthKey(n - i, now)));
}

/** Aggregate income/expense/invest over a span of month keys. */
function aggregateMonths(txs: Transaction[], keys: string[]): { income: number; expense: number; invest: number } {
  const set = new Set(keys);
  let income = 0, expense = 0, invest = 0;
  for (const t of txs) {
    if (!set.has(t.date.slice(0, 7))) continue;
    if (t.type === 'income')          income  += t.amount;
    else if (t.type === 'expense')    expense += ownShare(t);
    else if (t.type === 'investment') invest  += investSign(t) * t.amount;
  }
  return { income, expense, invest };
}

/** Ordinary least-squares slope of a numeric series. */
function linearSlope(arr: number[]): number {
  const n = arr.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = arr.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (arr[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den ? num / den : 0;
}

/**
 * Seasonality-adjusted 12-month expense estimate. For each of the next 12
 * calendar months we look up the historical average expense in that same
 * month across prior years (via seasonalMonthlyAverage). Where prior-year
 * data exists we use it; where it's missing we fall back to recentMonthlyAvg.
 * This naturally captures months that are historically heavier (e.g. December)
 * or lighter (e.g. January) without needing an explicit multiplier.
 */
function seasonalAnnualExpense(
  transactions: Transaction[],
  recentMonthlyAvg: number,
  now: Date,
): number {
  let total = 0;
  for (let i = 1; i <= 12; i++) {
    const monthIdx = (now.getMonth() + i) % 12;
    const cats = seasonalMonthlyAverage(transactions, monthIdx, now);
    const monthEst = Object.values(cats).reduce((s, v) => s + v, 0);
    total += monthEst > 0 ? monthEst : recentMonthlyAvg;
  }
  return total;
}

// ── Seasonality (year-over-year) ──────────────────────────────────────────────

export interface SeasonalSpike {
  category: string;
  monthAvg: number;   // avg spend in the target calendar month, across years
  overallAvg: number; // avg monthly spend for the category overall
  ratio: number;      // monthAvg / overallAvg
  years: number;      // how many years contributed to monthAvg
}

/**
 * Detect categories that historically spike in a given calendar month
 * (e.g. gifts in December). Compares the average spend in that month across
 * past years against the category's overall monthly average. The current
 * (partial) month is excluded so it doesn't pollute the history.
 */
export function seasonalSpikes(transactions: Transaction[], targetMonthIdx: number, now: Date = new Date()): SeasonalSpike[] {
  const curKey = monthKey(0, now);
  // Trend/seasonal analysis only looks back ~18 months: older habits are
  // rarely representative of how you spend today.
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 18, 1);
  const targetByCatYear: Record<string, Record<number, number>> = {};
  const overallByCat: Record<string, number> = {};
  const monthsByCat: Record<string, Set<string>> = {};

  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const k = t.date.slice(0, 7);
    if (k === curKey) continue; // exclude current partial month
    const d = localDate(t.date);
    if (d < cutoff) continue;   // ignore anything older than 18 months
    const share = ownShare(t);
    overallByCat[t.category] = (overallByCat[t.category] ?? 0) + share;
    (monthsByCat[t.category] ??= new Set()).add(k);
    if (d.getMonth() === targetMonthIdx) {
      (targetByCatYear[t.category] ??= {});
      targetByCatYear[t.category][d.getFullYear()] = (targetByCatYear[t.category][d.getFullYear()] ?? 0) + share;
    }
  }

  const out: SeasonalSpike[] = [];
  for (const cat of Object.keys(targetByCatYear)) {
    const perYear = Object.values(targetByCatYear[cat]);
    if (perYear.length === 0) continue;
    const monthAvg = perYear.reduce((a, b) => a + b, 0) / perYear.length;
    const activeMonths = Math.max(1, monthsByCat[cat]?.size ?? 1);
    const overallAvg = (overallByCat[cat] ?? 0) / activeMonths;
    if (overallAvg <= 0) continue;
    const ratio = monthAvg / overallAvg;
    if (monthAvg >= 30 && ratio >= 1.4) {
      out.push({ category: cat, monthAvg, overallAvg, ratio, years: perYear.length });
    }
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

// ── Engine ────────────────────────────────────────────────────────────────────

export type InsightDepth = 'minimal' | 'medium' | 'advanced';

export interface InsightInput {
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  getCat: (id: string) => CatLite;
  depth?: InsightDepth;
  now?: Date;
  /**
   * When provided, the end-of-month forecast uses Forecast Engine V4 (the same
   * engine the Budget screen uses). When omitted, the engine falls back to the
   * lightweight forecastSavings() heuristic in budgetUtils. Every in-app caller
   * passes this, so V4 is the live path for all cards.
   */
  forecastExpenseCategories?: CategoryDef[];
  /**
   * Current investment portfolio snapshot, used by the portfolio-performance and
   * net-worth insights. `controvalore` = current market value, `versato` = net
   * paid-in capital. Optional — screens without investment context omit it.
   */
  portfolio?: { controvalore: number; versato: number };
  /** When true, unlocks the advanced admin-only insights (FASE 4). Default false. */
  isAdmin?: boolean;
  /** Current per-category monthly budget limits, used by the budget-adherence insight. */
  budgets?: Record<string, number>;
}

export function buildInsights(input: InsightInput): Insight[] {
  const { transactions: allTx, monthlyIncome, monthlyExpenses, monthlyInvestments, getCat } = input;
  const now    = input.now ?? new Date();
  const today  = now.toISOString().slice(0, 10);
  // Realized = everything except future-dated one-off "previsti" (those are
  // forecasts, not actuals). All backward-looking slices below run on `realized`;
  // the only forward-looking call that needs the planned items uses `allTx`.
  const transactions = allTx.filter(t => !isPending(t, today));
  const curMon = monthKey(0, now);
  const prog   = monthProgress(now);
  const out: Insight[] = [];

  const DEPTH_ORDER: InsightDepth[] = ['minimal', 'medium', 'advanced'];
  const depthLevel = DEPTH_ORDER.indexOf(input.depth ?? 'advanced');
  const push = (i: Insight, minDepth: InsightDepth = 'advanced') => {
    if (DEPTH_ORDER.indexOf(minDepth) <= depthLevel) out.push(Object.assign(i, { minDepth }));
  };

  // Common slices ────────────────────────────────────────────────────────────
  const catSpend = (m: string) => {
    const r: Record<string, number> = {};
    for (const t of transactions)
      if (t.type === 'expense' && t.date.startsWith(m))
        r[t.category] = (r[t.category] ?? 0) + ownShare(t);
    return r;
  };
  const curCat  = catSpend(curMon);
  const prevCat = catSpend(monthKey(1, now));

  const h  = history(transactions, 3, now);
  const h6 = history(transactions, 6, now);

  // 6-month span including the current (partial) month — used for charts.
  const span   = Array.from({ length: 6 }, (_, i) => monthStats(transactions, monthKey(5 - i, now)));
  const spanLbl = span.map(m => shortMonth(m.key));

  const months6  = recentMonths(transactions, 6, now).filter(m => m.txCount > 0);
  const months3  = recentMonths(transactions, 3, now).filter(m => m.txCount > 0);
  const months12 = recentMonths(transactions, 12, now).filter(m => m.income > 0);

  const avg = (a: number[]) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

  // ── FASE 2 thresholds (minimal-tier insights) ─────────────────────────────
  const CASH_AUTONOMY_MIN_MONTHS = 2;    // runway below this → caution, else positive
  const SAVINGS_RATE_BENCHMARK   = 0.20; // 20% of income is the common "healthy" target
  const DORMANT_GAP_MONTHS       = 3;    // consecutive zero months before a re-spend counts
  const DORMANT_MIN_ACTIVE       = 2;    // skip near-new categories (<2 active months ever)
  const CLUSTER_MIN_TX           = 4;    // ≥4 expense tx in a single day → cluster
  const CLUSTER_DAY_SHARE        = 0.35; // or one day holding ≥35% of the month's spend
  const FIRST_TIME_MIN_AMOUNT    = 50;   // minimum amount to surface a brand-new merchant

  // ── FASE 3 thresholds (medium-tier insights) ─────────────────────────────
  const PORTFOLIO_MIN_PCT     = 1;     // skip portfolio insight when |P/L| < 1%
  const NETWORTH_MIN_MONTHS   = 3;     // need ≥3 months of history for a trajectory
  const CREEP_MIN_OCCURRENCES = 3;     // ≥3 occurrences (≥2 baseline + 1 latest)
  const CREEP_PCT             = 0.10;  // latest ≥ +10% over the baseline median
  const CREEP_STABILITY       = 1.15;  // baseline must cluster tightly (max ≤ median×1.15)
  const CREEP_MIN_DELTA       = 1;     // and rise by at least €1 (avoid trivial creep)
  const PAYDAY_WINDOW_DAYS    = 7;     // spending window right after payday
  const PAYDAY_MIN_SHARE      = 0.35;  // surface when the window holds ≥35% of monthly spend
  const FRONTLOAD_RATIO       = 1.25;  // spent ≥1.25× the usual cumulative-by-today
  const FRONTLOAD_MIN_DAY     = 4;     // not before day 4 (too little signal early)

  // ── FASE 4 thresholds (admin-only advanced insights) ─────────────────────
  const BUDGET_STREAK_MIN    = 2;      // celebrate after ≥2 consecutive on-budget months
  const ANOMALY_K_MAD        = 3;      // category month flagged beyond median + k·MAD
  const ANOMALY_MIN_SAMPLES  = 4;      // need ≥4 active months for a robust band
  const CASHFLOW_DIP_RATIO   = 0.5;    // intra-month dip ≥50% of the month's final savings
  const CASHFLOW_MIN_MONTHS  = 2;      // risky in ≥2 of the last 3 months → flag

  // ── 0. ALERT — Upcoming recurring payments ────────────────────────────────
  const seriesMap = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.recurring) continue;
    const key = `${t.description}||${t.type}`;
    const prev = seriesMap.get(key);
    if (!prev || t.date > prev.date) seriesMap.set(key, t);
  }
  for (const [, t] of seriesMap) {
    const rule = t.recurring!;
    if (rule.until && rule.until < today) continue;
    const nextDue = addPeriod(t.date, rule.freq);
    // Don't announce an occurrence that falls after the series' end date.
    if (rule.until && nextDue > rule.until) continue;
    const days = daysUntil(nextDue, now);
    if (days > 14 || days < -7) continue;
    const freqLabel = rule.freq === 'daily' ? 'giorno' : rule.freq === 'weekly' ? 'settimana' : rule.freq === 'monthly' ? 'mese' : 'anno';
    const dueLabel = days < 0
      ? `${Math.abs(days)} giorni fa (non ancora registrato)`
      : days === 0 ? 'oggi' : days === 1 ? 'domani' : `tra ${days} giorni`;
    push({
      icon: '📅', category: 'alert', urgent: days <= 2,
      title: `${t.description} — scade ${dueLabel}`,
      detail: `${formatCurrency(t.amount)} · ogni ${freqLabel}`,
      accent: days <= 2 ? ACCENT.warn : ACCENT.info,
      tone: days <= 2 ? 'caution' : 'neutral',
      explain: {
        what: 'Un pagamento ricorrente che hai segnato sta per ripresentarsi.',
        how: `Prendo l'ultima occorrenza di "${t.description}" (${t.date}) e aggiungo la frequenza (${freqLabel}) per stimare la prossima scadenza.`,
        basis: 'Transazioni marcate come "Ricorrente".',
      },
    }, 'minimal');
  }

  // ── 0b. FORECAST — Monthly recurring summary (expenses + investments) ──────
  {
    const monthStart = `${ym(now)}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${ym(now)}-${String(lastDay).padStart(2, '0')}`;

    interface REntry { desc: string; amount: number; count: number }
    const thisMonthExp: REntry[] = [];
    const thisMonthInv: REntry[] = [];

    for (const [, t] of seriesMap) {
      const rule = t.recurring!;
      if (rule.until && rule.until < monthStart) continue;

      // Advance to first occurrence in this month, with a safety cap
      let d = addPeriod(t.date, rule.freq);
      let guard = 2000;
      while (d < monthStart && --guard > 0) d = addPeriod(d, rule.freq);
      if (d > monthEnd) continue;

      // Count all occurrences in the month (capped at 35 for daily)
      let count = 0;
      let cur = d;
      while (cur <= monthEnd && count < 35) {
        if (!rule.until || cur <= rule.until) count++;
        cur = addPeriod(cur, rule.freq);
      }
      if (count > 0) {
        const entry: REntry = { desc: t.description, amount: t.amount, count };
        if (t.type === 'investment') thisMonthInv.push(entry);
        else if (t.type === 'expense') thisMonthExp.push(entry);
      }
    }

    if (thisMonthExp.length > 0) {
      const total = thisMonthExp.reduce((s, e) => s + e.amount * e.count, 0);
      const top3 = thisMonthExp.slice(0, 3).map(e => `${e.desc}${e.count > 1 ? ` ×${e.count}` : ''}`).join(' · ');
      push({
        icon: '🗓️', category: 'forecast',
        title: `${thisMonthExp.length} spese ricorrenti · ${formatCurrency(total)}`,
        detail: thisMonthExp.length > 3 ? `${top3} · +${thisMonthExp.length - 3} altre` : top3,
        accent: ACCENT.gold,
        tone: 'neutral',
        explain: {
          what: 'Tutte le spese ricorrenti attese nel mese corrente, basate sulle scadenze calcolate.',
          how: 'Per ogni spesa taggata "Ricorrente" avanzo la data dell\'ultima occorrenza della frequenza impostata finché non rientra in questo mese, poi conto quante ne cadono entro fine mese.',
          basis: `${thisMonthExp.length} spese ricorrenti attive questo mese.`,
          chart: {
            labels: thisMonthExp.slice(0, 6).map(e => (e.desc.length > 12 ? e.desc.slice(0, 11) + '…' : e.desc)),
            values: thisMonthExp.slice(0, 6).map(e => Math.round(e.amount * e.count)),
            format: 'currency',
          },
        },
      }, 'minimal');
    }

    if (thisMonthInv.length > 0) {
      const total = thisMonthInv.reduce((s, e) => s + e.amount * e.count, 0);
      const top3 = thisMonthInv.slice(0, 3).map(e => `${e.desc}${e.count > 1 ? ` ×${e.count}` : ''}`).join(' · ');
      push({
        icon: '📈', category: 'forecast',
        title: `${thisMonthInv.length} investimenti ricorrenti · ${formatCurrency(total)}`,
        detail: thisMonthInv.length > 3 ? `${top3} · +${thisMonthInv.length - 3} altri` : top3,
        accent: ACCENT.gold,
        tone: 'neutral',
        explain: {
          what: 'Tutti gli investimenti ricorrenti attesi nel mese corrente, basati sulle scadenze calcolate.',
          how: 'Per ogni investimento taggato "Ricorrente" avanzo la data dell\'ultima occorrenza della frequenza impostata finché non rientra in questo mese, poi conto quante ne cadono entro fine mese.',
          basis: `${thisMonthInv.length} investimenti ricorrenti attivi questo mese.`,
          chart: {
            labels: thisMonthInv.slice(0, 6).map(e => (e.desc.length > 12 ? e.desc.slice(0, 11) + '…' : e.desc)),
            values: thisMonthInv.slice(0, 6).map(e => Math.round(e.amount * e.count)),
            format: 'currency',
          },
        },
      }, 'minimal');
    }
  }

  // ── 1. ALERT — Expenses outpacing income this month ───────────────────────
  // Only meaningful past mid-month: early on, a single expense before income
  // is logged would falsely look like "overspending".
  const saved = monthlyIncome - monthlyExpenses - monthlyInvestments;
  if (monthlyIncome > 0 && saved < 0 && prog > 0.5) {
    push({
      icon: '⚠️', category: 'alert', urgent: true,
      title: `Sforamento di ${formatCurrency(-saved)}`,
      detail: 'Le uscite superano le entrate questo mese',
      accent: ACCENT.warn,
      tone: 'caution',
      explain: {
        what: 'Questo mese stai spendendo e investendo più di quanto incassi.',
        how: 'Entrate − Uscite − Investimenti del mese corrente. Se è negativo, stai intaccando i risparmi.',
        basis: 'Solo transazioni del mese in corso.',
        chart: { labels: ['Entrate', 'Uscite', 'Investito'], values: [Math.round(monthlyIncome), Math.round(monthlyExpenses), Math.round(monthlyInvestments)], format: 'currency', highlightIndex: 1 },
      },
    }, 'medium');
  }

  // ── 2. FORECAST — End-of-month projection ────────────────────────────────
  // Show as soon as there's historical context; without it, wait until enough
  // of the month has elapsed (projecting a few days' run-rate is misleading).
  if ((monthlyExpenses > 0 || monthlyIncome > 0) && (h.avgVariableExpense > 0 || prog > 0.15)) {
    // Seasonal baseline: variable spend in this calendar month across prior years.
    const seasonalVar = seasonalVariableMonthly(transactions, now.getMonth(), now);

    // Upcoming committed movements still to come this month (after today): both
    // recurring occurrences (incl. a series that STARTS this month) and planned
    // one-off "previsti". Computed on the full set `allTx` so future-starting
    // recurring templates — which are excluded from `realized` — are still seen.
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${ym(now)}-${String(lastDay).padStart(2, '0')}`;
    const upcomingRecurring = upcomingRecurringThisMonth(allTx, today, monthEnd)
      + upcomingPlannedThisMonth(allTx, today, monthEnd);
    const upcomingIncome = upcomingRecurringThisMonth(allTx, today, monthEnd, 'income')
      + upcomingPlannedThisMonth(allTx, today, monthEnd, 'income');
    const upcomingInvest = upcomingRecurringThisMonth(allTx, today, monthEnd, 'investment')
      + upcomingPlannedThisMonth(allTx, today, monthEnd, 'investment');

    // Variable (non-recurring) spending already recorded this month. Planned
    // future-dated one-offs are excluded here — they're in upcomingRecurring.
    const curKey = ym(now);
    let variableSpent = 0;
    for (const t of transactions) {
      if (t.type !== 'expense' || t.date.slice(0, 7) !== curKey) continue;
      if (t.seriesId || t.recurring) continue;
      if (t.date > today) continue;
      variableSpent += ownShare(t);
    }

    const f = input.forecastExpenseCategories
      ? forecastSavingsV4({
          transactions: allTx,
          expenseCategories: input.forecastExpenseCategories,
          monthlyIncome, monthlyInvestments,
          avgIncome: h.avgIncome, avgInvest: h.avgInvest,
          upcomingIncome, upcomingInvest, now,
        })
      : forecastSavings({
          monthlyIncome, monthlyExpenses, monthlyInvestments,
          variableSpent,
          recentVariableAvg: h.avgVariableExpense,
          seasonalVariableAvg: seasonalVar.avg, seasonalYears: seasonalVar.years,
          avgIncome: h.avgIncome, avgInvest: h.avgInvest,
          upcomingRecurring, upcomingIncome, upcomingInvest, now,
        });
    const projExp = f.projectedExpenses, expInc = f.expectedIncome, expInv = f.expectedInvest;
    const forecast = f.savings;
    const basis    = h.months > 0 ? 'spese attuali e abitudini storiche' : 'ritmo attuale';
    const pctMonth = Math.round(prog * 100);
    const avgVar = Math.round(h.avgVariableExpense);
    const hasHistory = h.avgVariableExpense > 0 || seasonalVar.avg > 0;
    const howExp = hasHistory
      ? `Parto da quanto hai già speso questo mese (${formatCurrency(monthlyExpenses)}) e stimo i giorni che restano (${100 - pctMonth}% del mese) combinando la tua media di spesa variabile${seasonalVar.avg > 0 ? ` (${formatCurrency(avgVar)}/mese) con la storica di questo stesso mese negli anni precedenti (${formatCurrency(Math.round(seasonalVar.avg))})` : ` (${formatCurrency(avgVar)}/mese)`} con il ritmo effettivo di questo mese${upcomingRecurring > 0 ? `, poi aggiungo le spese ricorrenti ancora in arrivo (${formatCurrency(Math.round(upcomingRecurring))})` : ''}. Uscite stimate: ${formatCurrency(projExp)}.`
      : `Riproietto quanto hai già speso (${formatCurrency(monthlyExpenses)}) sul resto del mese in base ai giorni passati (sei circa al ${pctMonth}%)${upcomingRecurring > 0 ? `, più le ricorrenti ancora in arrivo (${formatCurrency(Math.round(upcomingRecurring))})` : ''}, arrivando a circa ${formatCurrency(projExp)}.`;
    const howInc = h.avgIncome > 0
      ? ` Per le entrate uso la cifra più alta tra quanto hai già incassato (${formatCurrency(monthlyIncome)}) e quanto incassi di solito (${formatCurrency(h.avgIncome)}), perché lo stipendio di solito arriva tutto insieme.`
      : ` Per le entrate considero quanto hai già incassato (${formatCurrency(monthlyIncome)}).`;
    const forecastBasis = [
      h.months > 0 ? `media ultimi ${h.months} mesi` : null,
      seasonalVar.avg > 0 ? 'storico stesso mese anni precedenti' : null,
      upcomingRecurring > 0 ? 'ricorrenti programmate' : null,
    ].filter(Boolean).join(' · ') || 'ritmo attuale';
    push(forecast >= 0
      ? { icon: '🔮', category: 'forecast', title: `Fine mese stimato: +${formatCurrency(forecast)}`, detail: `Risparmio proiettato su ${basis}`, accent: ACCENT.good, tone: 'positive', _family: 'eom-projection',
          explain: {
            what: 'Stima di quanto ti resterà a fine mese se mantieni questo ritmo.',
            how: `${howExp}${howInc} Il risparmio stimato è quello che resta: entrate previste, meno le uscite previste, meno gli investimenti.`,
            basis: forecastBasis,
            chart: { labels: ['Entrate', 'Uscite stim.', 'Investito'], values: [Math.round(expInc), projExp, Math.round(expInv)], format: 'currency', highlightIndex: 0 },
          } }
      : { icon: '🔮', category: 'forecast', title: `Fine mese stimato: −${formatCurrency(-forecast)}`, detail: `Le uscite supererebbero le entrate su ${basis}`, accent: ACCENT.warn, tone: 'caution', _family: 'eom-projection',
          explain: {
            what: 'A questo ritmo chiuderesti il mese in negativo.',
            how: `${howExp}${howInc} Mettendo insieme entrate previste, uscite previste e investimenti, il conto finale risulta negativo.`,
            basis: forecastBasis,
            chart: { labels: ['Entrate', 'Uscite stim.', 'Investito'], values: [Math.round(expInc), projExp, Math.round(expInv)], format: 'currency', highlightIndex: 1 },
          } }, 'medium');
  }

  // ── 3. FORECAST — Savings so far ─────────────────────────────────────────
  if (monthlyIncome > 0 && saved >= 0) {
    push({
      icon: '✨', category: 'forecast',
      title: `Risparmiato finora: ${formatCurrency(saved)}`,
      detail: `${pct(saved, monthlyIncome)}% delle entrate di questo mese`,
      accent: ACCENT.good,
      tone: 'positive',
      explain: {
        what: 'Quanto hai messo da parte finora questo mese.',
        how: 'Entrate − Uscite − Investimenti, calcolato sui movimenti già registrati nel mese.',
        basis: 'Solo mese corrente.',
        chart: { labels: ['Entrate', 'Uscite', 'Investito', 'Risparmio'], values: [Math.round(monthlyIncome), Math.round(monthlyExpenses), Math.round(monthlyInvestments), Math.round(saved)], format: 'currency', highlightIndex: 3 },
      },
    }, 'medium');
  }

  // ── 4. FORECAST — Income vs historical average ────────────────────────────
  if (h.avgIncome > 0) {
    const incChart: InsightChart = { labels: spanLbl, values: span.map(m => Math.round(m.income)), format: 'currency', refLine: Math.round(h.avgIncome), refLabel: 'media' };
    if (monthlyIncome >= h.avgIncome * 1.1) {
      push({ icon: '💰', category: 'forecast', title: `Entrate sopra la media (+${pct(monthlyIncome - h.avgIncome, h.avgIncome)}%)`, detail: `Di solito incassi ~${formatCurrency(h.avgIncome)}/mese`, accent: ACCENT.good, tone: 'positive',
        explain: { what: 'Questo mese stai incassando più del solito.', how: `Entrate del mese (${formatCurrency(monthlyIncome)}) confrontate con la media degli ultimi ${h.months} mesi attivi.`, basis: 'Ultimi 3 mesi con dati.', chart: incChart } }, 'medium');
    } else if (prog > 0.45 && monthlyIncome < h.avgIncome * 0.85) {
      push({ icon: '📥', category: 'forecast', title: `Entrate ancora sotto la media`, detail: `Finora ${formatCurrency(monthlyIncome)} vs ~${formatCurrency(h.avgIncome)} tipici`, accent: ACCENT.info, tone: 'neutral',
        explain: { what: 'Sei oltre metà mese ma le entrate sono sotto la tua norma.', how: `Confronto tra entrate correnti e media storica, considerando che è trascorso il ${Math.round(prog * 100)}% del mese.`, basis: 'Ultimi 3 mesi con dati.', chart: incChart } }, 'medium');
    } else if (monthlyIncome === 0) {
      push({ icon: '📥', category: 'forecast', title: `Entrate previste: ~${formatCurrency(h.avgIncome)}`, detail: 'Stima sulla media degli ultimi mesi', accent: ACCENT.info, tone: 'neutral',
        explain: { what: 'Non hai ancora registrato entrate: ecco quanto incassi di solito.', how: 'Media delle entrate sugli ultimi mesi attivi.', basis: 'Ultimi 3 mesi con dati.', chart: incChart } }, 'medium');
    }
  }

  // ── 5. FORECAST — Investment pace ─────────────────────────────────────────
  if (h.avgInvest > 0 || monthlyInvestments > 0) {
    const invChart: InsightChart = { labels: spanLbl, values: span.map(m => Math.round(m.invest)), format: 'currency', refLine: Math.round(h.avgInvest), refLabel: 'media' };
    if (h.avgInvest > 0 && monthlyInvestments === 0 && prog > 0.5) {
      push({ icon: '📈', category: 'forecast', title: `Non hai ancora investito questo mese`, detail: `Di solito investi ~${formatCurrency(h.avgInvest)}/mese`, accent: ACCENT.gold, tone: 'neutral',
        explain: { what: 'Promemoria: di solito a questo punto del mese hai già investito.', how: 'Confronto tra investimenti del mese (0) e la media storica mensile.', basis: 'Ultimi 3 mesi con dati.', chart: invChart } });
    } else if (h.avgInvest > 0 && monthlyInvestments < h.avgInvest * 0.8 && prog > 0.5) {
      push({ icon: '📈', category: 'forecast', title: `Investimenti sotto la media`, detail: `${formatCurrency(monthlyInvestments)} vs ~${formatCurrency(h.avgInvest)} di solito`, accent: ACCENT.gold, tone: 'neutral',
        explain: { what: 'Stai investendo meno del tuo ritmo abituale.', how: 'Investimenti del mese vs media storica mensile.', basis: 'Ultimi 3 mesi con dati.', chart: invChart } });
    } else if (monthlyInvestments > 0) {
      const ref = h.avgInvest > 0 ? h.avgInvest : monthlyInvestments;
      push({ icon: '📈', category: 'forecast', title: `Investiti ${formatCurrency(monthlyInvestments)} questo mese`, detail: `A questo ritmo ~${formatCurrency(ref * 12)}/anno`, accent: ACCENT.gold, tone: 'neutral',
        explain: { what: 'Il tuo ritmo di investimento e la proiezione annuale.', how: `Investimenti mensili × 12 = ${formatCurrency(ref * 12)} stimati all'anno.`, basis: 'Mese corrente + media storica.', chart: invChart } });
    }
  }

  // ── 6. SEASONAL — Current month historically heavy on a category ──────────
  const seasonalNow = seasonalSpikes(transactions, now.getMonth(), now);
  for (const s of seasonalNow.slice(0, 2)) {
    const c = getCat(s.category);
    const mName = monthNameFromIndex(now.getMonth());
    push({
      icon: c.icon || '🗓️', category: 'seasonal',
      title: `${mName} è di solito un mese forte per ${c.label}`,
      detail: `Negli anni passati hai speso ~${formatCurrency(s.monthAvg)} in ${c.label} a ${mName}, contro una media di ${formatCurrency(s.overallAvg)}/mese`,
      accent: ACCENT.info,
      tone: 'neutral',
      explain: {
        what: `Pattern stagionale: a ${mName} questa categoria tende a salire. Tienilo a mente nel budget.`,
        how: `Confronto la spesa media in ${c.label} nei mesi di ${mName} degli anni scorsi (${formatCurrency(s.monthAvg)}) con la tua media mensile su tutto l'anno (${formatCurrency(s.overallAvg)}). Rapporto ${s.ratio.toFixed(1)}×.`,
        basis: `${s.years} ${s.years === 1 ? 'anno' : 'anni'} di storico, mese corrente escluso.`,
        chart: { labels: [`${mName} (storico)`, 'Media mese'], values: [Math.round(s.monthAvg), Math.round(s.overallAvg)], format: 'currency', highlightIndex: 0 },
      },
    });
  }

  // ── 7. SEASONAL — Heads-up for next month ─────────────────────────────────
  if (prog > 0.55) {
    const nextIdx = (now.getMonth() + 1) % 12;
    const seasonalNext = seasonalSpikes(transactions, nextIdx, now);
    const top = seasonalNext[0];
    if (top && !seasonalNow.some(s => s.category === top.category)) {
      const c = getCat(top.category);
      const mName = monthNameFromIndex(nextIdx);
      push({
        icon: '🔭', category: 'seasonal',
        title: `Preparati: ${mName} pesa su ${c.label}`,
        detail: `Storicamente a ${mName} spendi ~${formatCurrency(top.monthAvg)} in ${c.label}. Mettine un po' da parte.`,
        accent: ACCENT.gold,
        tone: 'neutral',
        explain: {
          what: `Anticipo sul mese prossimo: ${c.label} tende a salire a ${mName}.`,
          how: `Spesa media in ${c.label} nei mesi di ${mName} passati (${formatCurrency(top.monthAvg)}) vs media mensile generale (${formatCurrency(top.overallAvg)}).`,
          basis: `${top.years} ${top.years === 1 ? 'anno' : 'anni'} di storico.`,
          chart: { labels: [`${mName} (storico)`, 'Media mese'], values: [Math.round(top.monthAvg), Math.round(top.overallAvg)], format: 'currency', highlightIndex: 0 },
        },
      });
    }
  }

  // ── 8. SEASONAL — Same month last year (total expenses) ───────────────────
  // Only compare once enough of the month has elapsed so the simple run-rate
  // extrapolation is stable. Showing it on day 2 with 3 recorded expenses
  // produces wildly misleading "−52%" numbers.
  {
    const lyKey = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ly = monthStats(transactions, lyKey);
    if (ly.expense > 100 && monthlyExpenses > 0 && prog > 0.4) {
      // Use a history-blended projection when available: as the month progresses
      // the run-rate gets more weight; early in the comparison window the
      // historical average acts as a stabiliser.
      const runRate = projectExpenses(monthlyExpenses, now);
      const proj = h.avgExpense > 0
        ? Math.round(prog * runRate + (1 - prog) * h.avgExpense)
        : runRate;
      const delta = pct(proj - ly.expense, ly.expense);
      if (Math.abs(delta) >= 12) {
        const up = delta > 0;
        push({
          icon: '↔️', category: 'seasonal',
          title: `${up ? '+' : '−'}${Math.abs(delta)}% di spese vs ${longMonth(lyKey)} ${now.getFullYear() - 1}`,
          detail: `Proiezione ${formatCurrency(proj)} questo mese vs ${formatCurrency(ly.expense)} lo stesso mese l'anno scorso`,
          accent: up ? ACCENT.warn : ACCENT.good,
          tone: up ? 'caution' : 'positive',
          explain: {
            what: 'Confronto anno-su-anno dello stesso mese, per cogliere effetti stagionali.',
            how: `Uscite proiettate del mese corrente (${formatCurrency(proj)}) confrontate con le uscite effettive dello stesso mese dell'anno scorso (${formatCurrency(ly.expense)}).`,
            basis: 'Stesso mese, anno precedente.',
            chart: { labels: [`${shortMonth(lyKey)} ${now.getFullYear() - 1}`, `${shortMonth(curMon)} ${now.getFullYear()}`], values: [Math.round(ly.expense), proj], format: 'currency', highlightIndex: 1 },
          },
        });
      }
    }
  }

  // ── 9. TREND — Expense trajectory (6 months) ─────────────────────────────
  if (months6.length >= 3) {
    const slope    = linearSlope(months6.map(m => m.expense));
    const avgExp   = avg(months6.map(m => m.expense));
    const relSlope = avgExp > 0 ? slope / avgExp : 0;
    const expChart: InsightChart = { labels: spanLbl, values: span.map(m => Math.round(m.expense)), format: 'currency', refLine: Math.round(avgExp), refLabel: 'media' };
    if (relSlope > 0.06) {
      push({ icon: '📊', category: 'trend', title: `Spese in crescita costante`, detail: `+${Math.round(relSlope * 100)}% al mese negli ultimi ${months6.length} mesi`, accent: ACCENT.warn, tone: 'caution',
        explain: { what: 'La traiettoria delle spese mensili è in aumento.', how: 'Confronto le uscite mese per mese e guardo se, nel complesso, la linea tende a salire in modo costante.', basis: `Ultimi ${months6.length} mesi con dati.`, chart: expChart } });
    } else if (relSlope < -0.06) {
      push({ icon: '📊', category: 'trend', title: `Stai riducendo le spese`, detail: `−${Math.round(Math.abs(relSlope) * 100)}% al mese negli ultimi ${months6.length} mesi`, accent: ACCENT.good, tone: 'positive',
        explain: { what: 'Le tue uscite mensili stanno calando in modo costante.', how: 'Confronto le uscite mese per mese e guardo se, nel complesso, la linea tende a scendere in modo costante.', basis: `Ultimi ${months6.length} mesi con dati.`, chart: expChart } });
    }
  }

  // ── 10. TREND — Savings rate trajectory ───────────────────────────────────
  const withIncome = months6.filter(m => m.income > 0);
  if (withIncome.length >= 3) {
    const rateSlope = linearSlope(withIncome.map(m => m.savingsRate));
    const rateChart: InsightChart = { labels: withIncome.map(m => shortMonth(m.key)), values: withIncome.map(m => Math.round(m.savingsRate * 100)), format: 'percent' };
    if (rateSlope > 0.02) {
      const curRate = withIncome[withIncome.length - 1]?.savingsRate ?? 0;
      push({ icon: '🚀', category: 'trend', title: `Tasso di risparmio in crescita`, detail: `Ora al ${Math.round(curRate * 100)}% · la tendenza è positiva`, accent: ACCENT.good, tone: 'positive',
        explain: { what: 'La quota di reddito che riesci a risparmiare sta aumentando.', how: 'Per ogni mese calcolo quanta parte delle entrate ti resta dopo spese e investimenti, e guardo se questa quota cresce nel tempo.', basis: 'Mesi con entrate negli ultimi 6.', chart: rateChart } });
    } else if (rateSlope < -0.03) {
      push({ icon: '📉', category: 'trend', title: `Tasso di risparmio in calo`, detail: `La quota risparmiata sul reddito sta diminuendo`, accent: ACCENT.warn, tone: 'caution',
        explain: { what: 'Stai risparmiando una fetta sempre minore del tuo reddito.', how: 'Per ogni mese guardo quanta parte delle entrate ti resta dopo spese e investimenti, e noto che questa quota sta diminuendo.', basis: 'Mesi con entrate negli ultimi 6.', chart: rateChart } });
    }
  }

  // ── 11. TREND — Investment rate ────────────────────────────────────────────
  if (h6.avgIncome > 0 && h6.avgInvest > 0) {
    const investRate = Math.round((h6.avgInvest / h6.avgIncome) * 100);
    const base: InsightExplain = {
      what: 'Quanta parte del reddito destini agli investimenti.',
      how: `Media investimenti mensili (${formatCurrency(h6.avgInvest)}) ÷ media entrate mensili (${formatCurrency(h6.avgIncome)}).`,
      basis: 'Ultimi 6 mesi con dati.',
      chart: { labels: ['Investito', 'Reddito'], values: [Math.round(h6.avgInvest), Math.round(h6.avgIncome)], format: 'currency', highlightIndex: 0 },
    };
    if (investRate >= 15) {
      push({ icon: '💎', category: 'trend', title: `Stai investendo il ${investRate}% del reddito`, detail: `Ottimo ritmo — proietti ${formatCurrency(h6.avgInvest * 12)} investiti all'anno`, accent: ACCENT.gold, tone: 'positive', explain: base });
    } else {
      push({ icon: '📈', category: 'trend', title: `Investi il ${investRate}% del reddito`, detail: `A questo ritmo ${formatCurrency(h6.avgInvest * 12)}/anno · la soglia consigliata è 15%`, accent: ACCENT.info, tone: 'neutral', explain: base });
    }
  }

  // ── 12. TREND — Annual projection ─────────────────────────────────────────
  if (h.months >= 2 && h.avgIncome > 0) {
    const recExp = recurringMonthlyEquivalent(transactions, 'expense', today);
    const recInv = recurringMonthlyEquivalent(transactions, 'investment', today);

    // Use the 6-month average as the base when we have enough data — it spans
    // more calendar months, so seasonal peaks and troughs cancel out better
    // than a 3-month window that might sit inside a single seasonal quarter.
    const baseExp = h6.months >= 4 ? h6.avgExpense : h.avgExpense;
    const baseInv = h6.months >= 4 ? h6.avgInvest : h.avgInvest;
    const baseWindowLabel = h6.months >= 4 ? '6' : '3';

    // Seasonality-adjusted 12-month expense total: for each upcoming calendar
    // month we look at that month's historical average across prior years.
    // Where prior-year data is missing we fall back to the recent monthly base.
    const yrExpSeasonal = seasonalAnnualExpense(transactions, baseExp, now);

    // Final annual expense estimate: best of (seasonal profile, recent-avg ×12,
    // recurring floor ×12). Using max() avoids double-counting — recurring costs
    // are already embedded in both the historical avg and the seasonal profile.
    const yrExpFull = Math.max(yrExpSeasonal, baseExp * 12, recExp * 12);
    const yrInvFull = Math.max(baseInv * 12, recInv * 12);

    const yrSav = Math.round(h.avgIncome * 12 - yrExpFull - yrInvFull);
    const yrInv = Math.round(yrInvFull);

    const usesSeasonality = yrExpSeasonal > baseExp * 12;
    const usesRecurring   = recExp * 12 > Math.max(yrExpSeasonal, baseExp * 12);
    const annualBasis = [
      `medie ultimi ${baseWindowLabel} mesi`,
      usesSeasonality ? 'stagionalità anno su anno' : null,
      usesRecurring   ? 'ricorrenti attive' : null,
    ].filter(Boolean).join(' · ');

    push({
      icon: '🗓️', category: 'trend',
      title: `Proiezione annuale: ${yrSav >= 0 ? '+' : '−'}${formatCurrency(Math.abs(yrSav))} risparmiati`,
      detail: `+ ${formatCurrency(yrInv)} investiti · totale ${formatCurrency(Math.abs(yrSav) + yrInv)}`,
      accent: yrSav >= 0 ? ACCENT.good : ACCENT.warn,
      tone: yrSav >= 0 ? 'positive' : 'caution',
      explain: {
        what: 'Quanto accumuleresti nei prossimi 12 mesi tenendo conto della stagionalità delle spese e delle ricorrenti note.',
        how: `Stimo le uscite mese per mese per i prossimi 12 mesi: per ogni mese uso la media storica di quel mese in anni precedenti (es. dicembre storicamente più caro). Dove manca la storica uso la media recente (ultimi ${baseWindowLabel} mesi). Applico poi un pavimento sulle ricorrenti già programmate così gli impegni fissi non vengono mai sottostimati. Per gli investimenti stesso approccio. Le entrate annuali sono la media mensile × 12.`,
        basis: annualBasis,
        chart: { labels: ['Risparmio/anno', 'Investito/anno'], values: [yrSav, yrInv], format: 'currency' },
      },
    });
  }

  // ── 13. TREND — Category growing fastest over 3 months ───────────────────
  if (months3.length >= 2) {
    const catSeries: Record<string, number[]> = {};
    for (const ms of months3) {
      const spend = catSpend(ms.key);
      for (const [cat, val] of Object.entries(spend)) (catSeries[cat] ??= []).push(val);
    }
    let fastCat = '', fastSlope = 0;
    for (const [cat, vals] of Object.entries(catSeries)) {
      if (vals.length < 2 || vals[0] < 20) continue;
      const rel = linearSlope(vals) / vals[0];
      if (rel > fastSlope) { fastSlope = rel; fastCat = cat; }
    }
    if (fastCat && fastSlope > 0.15) {
      const c = getCat(fastCat);
      const vals = catSeries[fastCat]!;
      push({ icon: c.icon, category: 'trend', title: `${c.label} in forte crescita`, detail: `Media mensile ${formatCurrency(avg(vals))} · +${Math.round(fastSlope * 100)}% mese su mese`, accent: ACCENT.warn, tone: 'caution',
        explain: { what: `La spesa in ${c.label} sta accelerando.`, how: 'Confronto quanto spendi in questa categoria mese dopo mese: l\'aumento è marcato rispetto a dove eri partito.', basis: 'Ultimi 3 mesi con dati.', chart: { labels: months3.map(m => shortMonth(m.key)), values: vals.map(v => Math.round(v)), format: 'currency' } } });
    }
  }

  // ── 14. TREND — Best month in the past year ──────────────────────────────
  if (months12.length >= 3) {
    const best = months12.reduce((a, b) => a.savings > b.savings ? a : b);
    if (best.savings > 0) {
      push({ icon: '🏆', category: 'trend', title: `Miglior mese: ${longMonth(best.key)} (${formatCurrency(best.savings)})`, detail: `Il tuo record di risparmio nell'ultimo anno`, accent: ACCENT.good, tone: 'positive',
        explain: { what: 'Il mese in cui hai messo da parte di più nell\'ultimo anno.', how: 'Per ogni mese: Entrate − Uscite − Investimenti. Viene scelto il massimo.', basis: 'Ultimi 12 mesi con entrate.', chart: { labels: months12.map(m => shortMonth(m.key)), values: months12.map(m => Math.round(m.savings)), format: 'currency', highlightIndex: months12.indexOf(best) } } });
    }
  }

  // ── 15. HABIT — Weekend vs weekday spending ───────────────────────────────
  {
    const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);
    const recent = transactions.filter(t => t.type === 'expense' && localDate(t.date) >= cutoff);
    let wdSum = 0, wdN = 0, weSum = 0, weN = 0;
    for (const t of recent) {
      if (isWeekend(t.date)) { weSum += ownShare(t); weN++; }
      else                   { wdSum += ownShare(t); wdN++; }
    }
    if (wdN >= 5 && weN >= 5) {
      const wdAvg = wdSum / wdN, weAvg = weSum / weN;
      const ratio = weAvg / wdAvg;
      const chart: InsightChart = { labels: ['Feriali', 'Weekend'], values: [Math.round(wdAvg), Math.round(weAvg)], format: 'currency', highlightIndex: ratio > 1 ? 1 : 0 };
      if (ratio > 1.35) {
        push({ icon: '🗓️', category: 'habit', title: `Spendi il ${Math.round((ratio - 1) * 100)}% in più nel weekend`, detail: `Media ${formatCurrency(weAvg)}/transazione (weekend) vs ${formatCurrency(wdAvg)} (feriali)`, accent: ACCENT.info, tone: 'neutral',
          explain: { what: 'Il weekend è più costoso per te, a parità di singola spesa.', how: 'Spesa media per transazione nei giorni feriali vs sabato/domenica.', basis: 'Ultimi 3 mesi di uscite.', chart } });
      } else if (ratio < 0.72) {
        push({ icon: '🗓️', category: 'habit', title: `Più disciplinato nel weekend`, detail: `${formatCurrency(wdAvg)}/transazione nei feriali vs ${formatCurrency(weAvg)} nel weekend`, accent: ACCENT.good, tone: 'positive',
          explain: { what: 'Nel weekend spendi meno per transazione rispetto ai feriali.', how: 'Spesa media per transazione, feriali vs weekend.', basis: 'Ultimi 3 mesi di uscite.', chart } });
      }
    }
  }

  // ── 16. HABIT — No-spend days this month ─────────────────────────────────
  {
    const spendDays = new Set(transactions.filter(t => t.type === 'expense' && t.date.startsWith(curMon)).map(t => t.date));
    const elapsed = Math.floor(prog * daysInMonth(now));
    const noDays  = elapsed - spendDays.size;
    if (elapsed >= 7 && spendDays.size > 0 && noDays >= 3) {
      push({ icon: '🎯', category: 'habit', title: `${noDays} giorni senza spese questo mese`, detail: `Su ${elapsed} giorni · ${Math.round((noDays / elapsed) * 100)}% dei giorni "zero uscite"`, accent: ACCENT.good, tone: 'positive',
        explain: { what: 'I giorni in cui non hai speso nulla — un\'abitudine che aiuta a risparmiare.', how: 'Giorni trascorsi nel mese meno i giorni con almeno una spesa registrata.', basis: 'Mese corrente.', chart: { labels: ['Con spese', 'Senza spese'], values: [spendDays.size, noDays], highlightIndex: 1 } } }, 'medium');
    }
  }

  // ── 17. HABIT — Auto-detected recurring (untagged) ───────────────────────
  {
    const normStr = (s: string) => s.toLowerCase().trim();
    const win3 = [monthKey(0, now), monthKey(1, now), monthKey(2, now)];
    const seen: Record<string, Set<string>> = {};
    for (const t of transactions) {
      if (t.type !== 'expense' || t.recurring) continue;
      const m = t.date.slice(0, 7);
      if (!win3.includes(m)) continue;
      (seen[normStr(t.description)] ??= new Set()).add(m);
    }
    const count = Object.values(seen).filter(s => s.size >= 2).length;
    if (count > 0) {
      push({ icon: '🔁', category: 'habit', title: `${count} pagament${count === 1 ? 'o' : 'i'} ricorrenti non taggati`, detail: 'Aprili e attiva "Ricorrente" per ricevere promemoria', accent: ACCENT.info, tone: 'neutral',
        explain: { what: 'Spese con la stessa descrizione che ricompaiono ogni mese: probabili abbonamenti.', how: 'Raggruppo le uscite per descrizione e conto quante compaiono in ≥2 degli ultimi 3 mesi.', basis: 'Ultimi 3 mesi, spese non già marcate ricorrenti.' } }, 'medium');
    }
  }

  // ── 18. HABIT — Cash flow efficiency ─────────────────────────────────────
  if (h.avgIncome > 50 && h.avgExpense > 0) {
    const expRatio = Math.round((h.avgExpense / h.avgIncome) * 100);
    const chart: InsightChart = { labels: ['Uscite', 'Reddito'], values: [Math.round(h.avgExpense), Math.round(h.avgIncome)], format: 'currency' };
    if (expRatio <= 50) {
      push({ icon: '⚖️', category: 'habit', title: `Spendi il ${expRatio}% del reddito in uscite`, detail: `Ottima efficienza · rimane il ${100 - expRatio}% per risparmio e investimenti`, accent: ACCENT.good, tone: 'positive',
        explain: { what: 'Quota del reddito assorbita dalle spese correnti.', how: 'Media uscite mensili ÷ media entrate mensili.', basis: 'Ultimi 3 mesi con dati.', chart } });
    } else if (expRatio >= 85) {
      push({ icon: '⚖️', category: 'habit', title: `Le uscite assorbono il ${expRatio}% del reddito`, detail: `Poco margine rimasto per risparmiare o investire`, accent: ACCENT.warn, tone: 'caution',
        explain: { what: 'Le spese correnti mangiano gran parte di ciò che incassi.', how: 'Media uscite mensili ÷ media entrate mensili.', basis: 'Ultimi 3 mesi con dati.', chart } });
    }
  }

  // ── 19. HABIT — Income diversity ─────────────────────────────────────────
  {
    const incCats = new Set(transactions.filter(t => t.type === 'income' && t.date.startsWith(curMon)).map(t => t.category));
    if (incCats.size >= 3) {
      push({ icon: '💼', category: 'habit', title: `${incCats.size} fonti di entrata questo mese`, detail: `Entrate diversificate — buona resilienza finanziaria`, accent: ACCENT.good, tone: 'positive',
        explain: { what: 'Più fonti di reddito riducono il rischio se una viene a mancare.', how: 'Conteggio delle categorie distinte di entrata nel mese corrente.', basis: 'Mese corrente.' } });
    }
  }

  // ── 20. HIGHLIGHT — Biggest category change vs last month ─────────────────
  {
    let bestCat = '', bestDelta = 0;
    for (const cat of Object.keys(curCat)) {
      const p = prevCat[cat] ?? 0;
      if (p < 10) continue;
      const delta = (curCat[cat] - p) / p;
      if (Math.abs(delta) > Math.abs(bestDelta)) { bestDelta = delta; bestCat = cat; }
    }
    if (bestCat && Math.abs(bestDelta) >= 0.15) {
      const up = bestDelta > 0;
      const c = getCat(bestCat);
      push({ icon: c.icon, category: 'highlight', title: `${up ? '+' : '−'}${Math.abs(Math.round(bestDelta * 100))}% in ${c.label} vs mese scorso`, detail: `${formatCurrency(curCat[bestCat])} questo mese vs ${formatCurrency(prevCat[bestCat] ?? 0)} il mese scorso`, accent: up ? ACCENT.warn : ACCENT.good, tone: up ? 'caution' : 'positive',
        explain: { what: `La variazione più marcata tra le categorie di spesa rispetto al mese scorso.`, how: '(spesa categoria mese corrente − mese scorso) ÷ mese scorso. Mostrata la categoria con scarto maggiore.', basis: 'Mese corrente vs precedente.', chart: { labels: [shortMonth(monthKey(1, now)), shortMonth(curMon)], values: [Math.round(prevCat[bestCat] ?? 0), Math.round(curCat[bestCat])], format: 'currency', highlightIndex: 1 } } }, 'medium');
    }
  }

  // ── 21. HIGHLIGHT — Heaviest category this month ─────────────────────────
  {
    let topCat = '', topVal = 0;
    for (const [cat, val] of Object.entries(curCat)) if (val > topVal) { topVal = val; topCat = cat; }
    if (topCat && monthlyExpenses > 0) {
      const c = getCat(topCat);
      const top5 = Object.entries(curCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
      push({ icon: c.icon, category: 'highlight', title: `Voce più pesante: ${c.label}`, detail: `${formatCurrency(topVal)} · ${pct(topVal, monthlyExpenses)}% delle uscite del mese`, accent: ACCENT.info, tone: 'neutral',
        explain: { what: 'La categoria su cui hai speso di più questo mese.', how: 'Somma delle uscite per categoria nel mese corrente; viene scelta la maggiore.', basis: 'Mese corrente.', chart: { labels: top5.map(([id]) => getCat(id).label), values: top5.map(([, v]) => Math.round(v)), format: 'currency', highlightIndex: 0 } } }, 'medium');
    }
  }

  // ── 22. HIGHLIGHT — Anomalously large transaction ─────────────────────────
  // Non-admin only: admins get the richer category-level MAD anomaly (#47) instead,
  // so the two anomaly cards never appear together (coordination required by FASE 4).
  if (!input.isAdmin) {
    const curExp = transactions.filter(t => t.type === 'expense' && t.date.startsWith(curMon));
    if (curExp.length > 3) {
      const biggest = curExp.reduce((a, b) => ownShare(a) > ownShare(b) ? a : b);
      const bigAmt  = ownShare(biggest);
      const catHist = transactions.filter(t => t.type === 'expense' && t.category === biggest.category && !t.date.startsWith(curMon)).map(t => ownShare(t));
      if (catHist.length >= 3) {
        const catAvg = avg(catHist);
        if (bigAmt > catAvg * 2.5) {
          const c = getCat(biggest.category);
          push({ icon: '🔎', category: 'highlight', title: `Spesa insolita: ${formatCurrency(bigAmt)} in ${c.label}`, detail: `${biggest.description || c.label} · media tipica ${formatCurrency(catAvg)} per questa categoria`, accent: ACCENT.warn, tone: 'caution',
            explain: { what: 'Una singola spesa molto più alta del normale per la sua categoria.', how: `Confronto l'importo (${formatCurrency(bigAmt)}) con la media storica delle spese in ${c.label} (${formatCurrency(catAvg)}). Segnalata se oltre 2,5×.`, basis: 'Storico della categoria, mese corrente escluso.', chart: { labels: ['Questa spesa', 'Media categoria'], values: [Math.round(bigAmt), Math.round(catAvg)], format: 'currency', highlightIndex: 0 } } });
        }
      }
    }
  }

  // ── 23. HIGHLIGHT — Pareto (top-3 categories) ─────────────────────────────
  {
    const catEntries = Object.entries(curCat).sort((a, b) => b[1] - a[1]);
    if (catEntries.length >= 4 && monthlyExpenses > 100) {
      const top3Sum = catEntries.slice(0, 3).reduce((s, [, v]) => s + v, 0);
      const top3Pct = pct(top3Sum, monthlyExpenses);
      if (top3Pct >= 70) {
        const names = catEntries.slice(0, 3).map(([id]) => getCat(id).label).join(', ');
        push({ icon: '🗂️', category: 'highlight', title: `3 categorie = ${top3Pct}% delle spese`, detail: names, accent: ACCENT.info, tone: 'neutral',
          explain: { what: 'Le tue spese sono concentrate in poche categorie.', how: 'Somma delle 3 categorie maggiori ÷ uscite totali del mese.', basis: 'Mese corrente.', chart: { labels: ['Top 3', 'Resto'], values: [Math.round(top3Sum), Math.round(monthlyExpenses - top3Sum)], format: 'currency', highlightIndex: 0 } } });
      }
    }
  }

  // ── 24. HIGHLIGHT — Spending pace vs historical average ──────────────────
  if (h.avgExpense > 0 && prog > 0.3) {
    const proj = projectExpenses(monthlyExpenses, now);
    const chart: InsightChart = { labels: spanLbl, values: span.map(m => Math.round(m.expense)), format: 'currency', refLine: Math.round(h.avgExpense), refLabel: 'media' };
    if (proj > h.avgExpense * 1.15) {
      push({ icon: '📊', category: 'highlight', title: `Spese in crescita rispetto alla media`, detail: `Proiezione ${formatCurrency(proj)} vs media ${formatCurrency(h.avgExpense)}/mese`, accent: ACCENT.warn, tone: 'caution', _family: 'eom-projection',
        explain: { what: 'Il mese corrente, proiettato, supera la tua media di spesa.', how: `Uscite proiettate a fine mese (${formatCurrency(proj)}) vs media degli ultimi mesi.`, basis: 'Mese corrente + ultimi 3 mesi.', chart } });
    } else if (proj < h.avgExpense * 0.85) {
      push({ icon: '📊', category: 'highlight', title: `Spese sotto la tua media storica`, detail: `Proiezione ${formatCurrency(proj)} vs media ${formatCurrency(h.avgExpense)}/mese`, accent: ACCENT.good, tone: 'positive', _family: 'eom-projection',
        explain: { what: 'Stai spendendo meno della tua media abituale.', how: `Uscite proiettate a fine mese vs media storica mensile.`, basis: 'Mese corrente + ultimi 3 mesi.', chart } });
    }
  }

  // ── 25. HIGHLIGHT — Monthly expense consistency (volatility) ─────────────
  if (months6.length >= 4) {
    const exps = months6.map(m => m.expense);
    const mean = avg(exps);
    const stddev = Math.sqrt(avg(exps.map(v => (v - mean) ** 2)));
    const cv = mean > 0 ? stddev / mean : 0;
    const chart: InsightChart = { labels: spanLbl, values: span.map(m => Math.round(m.expense)), format: 'currency', refLine: Math.round(mean), refLabel: 'media' };
    if (cv < 0.12) {
      push({ icon: '🧘', category: 'highlight', title: `Spese molto costanti`, detail: `Variazione mensile sotto il 12% — ottima prevedibilità`, accent: ACCENT.good, tone: 'positive',
        explain: { what: 'Le tue uscite mensili sono molto stabili, facili da pianificare.', how: 'Guardo quanto le uscite di ogni mese si discostano dalla media: qui restano molto vicine, quindi sono prevedibili.', basis: `Ultimi ${months6.length} mesi con dati.`, chart } });
    } else if (cv > 0.4) {
      push({ icon: '🌊', category: 'highlight', title: `Spese molto variabili`, detail: `Fluttuazione del ${Math.round(cv * 100)}% tra i mesi — difficile pianificare`, accent: ACCENT.info, tone: 'neutral',
        explain: { what: 'Le uscite oscillano molto da un mese all\'altro.', how: 'Guardo quanto le uscite di ogni mese si discostano dalla media: qui variano parecchio, quindi sono difficili da prevedere.', basis: `Ultimi ${months6.length} mesi con dati.`, chart } });
    }
  }

  // ── 26. TREND — Quarter-over-quarter expenses ────────────────────────────
  // Compares the last completed 3 months with the 3 before that.
  {
    const recentQ = [monthKey(1, now), monthKey(2, now), monthKey(3, now)];
    const priorQ  = [monthKey(4, now), monthKey(5, now), monthKey(6, now)];
    const rA = aggregateMonths(transactions, recentQ);
    const pA = aggregateMonths(transactions, priorQ);
    if (pA.expense > 100 && rA.expense > 100) {
      const delta = pct(rA.expense - pA.expense, pA.expense);
      if (Math.abs(delta) >= 10) {
        const up = delta > 0;
        push({ icon: '📅', category: 'trend',
          title: `Spese trimestre ${up ? '+' : '−'}${Math.abs(delta)}% vs trimestre prima`,
          detail: `${formatCurrency(rA.expense)} negli ultimi 3 mesi vs ${formatCurrency(pA.expense)} nei 3 precedenti`,
          accent: up ? ACCENT.warn : ACCENT.good,
          tone: up ? 'caution' : 'positive',
          explain: {
            what: 'Confronto tra gli ultimi 3 mesi completi e i 3 mesi ancora precedenti.',
            how: 'Somma delle uscite del trimestre recente vs il trimestre precedente, variazione percentuale.',
            basis: 'Ultimi 6 mesi completi (mese corrente escluso).',
            chart: { labels: ['Trim. prec.', 'Trim. recente'], values: [Math.round(pA.expense), Math.round(rA.expense)], format: 'currency', highlightIndex: 1 },
          } });
      }
    }
  }

  // ── 27. TREND — Quarter-over-quarter savings ─────────────────────────────
  {
    const recentQ = [monthKey(1, now), monthKey(2, now), monthKey(3, now)];
    const priorQ  = [monthKey(4, now), monthKey(5, now), monthKey(6, now)];
    const rA = aggregateMonths(transactions, recentQ);
    const pA = aggregateMonths(transactions, priorQ);
    const rSav = rA.income - rA.expense - rA.invest;
    const pSav = pA.income - pA.expense - pA.invest;
    if (rA.income > 100 && pA.income > 100 && Math.abs(rSav - pSav) >= 100) {
      const up = rSav > pSav;
      push({ icon: up ? '🚀' : '📉', category: 'trend',
        title: `Risparmio trimestrale ${up ? 'in crescita' : 'in calo'}`,
        detail: `${formatCurrency(rSav)} negli ultimi 3 mesi vs ${formatCurrency(pSav)} nei 3 precedenti`,
        accent: up ? ACCENT.good : ACCENT.warn,
        tone: up ? 'positive' : 'caution',
        explain: {
          what: 'Quanto hai messo da parte negli ultimi 3 mesi rispetto al trimestre precedente.',
          how: '(Entrate − Uscite − Investimenti) sommate sui due trimestri e confrontate.',
          basis: 'Ultimi 6 mesi completi (mese corrente escluso).',
          chart: { labels: ['Trim. prec.', 'Trim. recente'], values: [Math.round(pSav), Math.round(rSav)], format: 'currency', highlightIndex: 1 },
        } });
    }
  }

  // ── 28. FORECAST — End-of-month expense vs same month history ────────────
  // Uses the seasonal baseline (same calendar month in past years) when present.
  if (prog > 0.2 && monthlyExpenses > 0) {
    const sameMonthKeys: string[] = [];
    for (let y = 1; y <= 3; y++) sameMonthKeys.push(`${now.getFullYear() - y}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const past = sameMonthKeys.map(k => monthStats(transactions, k)).filter(m => m.expense > 0);
    if (past.length >= 1) {
      const seasonalAvg = avg(past.map(m => m.expense));
      const proj = projectExpenses(monthlyExpenses, now);
      const delta = pct(proj - seasonalAvg, seasonalAvg);
      if (Math.abs(delta) >= 12) {
        const up = delta > 0;
        const mName = monthNameFromIndex(now.getMonth());
        push({ icon: '🔮', category: 'forecast',
          title: `${mName} proiettato ${up ? '+' : '−'}${Math.abs(delta)}% vs solito`,
          detail: `Stima ${formatCurrency(proj)} vs ~${formatCurrency(seasonalAvg)} tipici di ${mName}`,
          accent: up ? ACCENT.warn : ACCENT.good,
          tone: up ? 'caution' : 'positive',
          _family: 'eom-projection',
          explain: {
            what: `Proiezione di fine mese confrontata con quanto spendi di solito a ${mName}.`,
            how: `Uscite proiettate (${formatCurrency(proj)}) vs media di ${mName} negli ultimi ${past.length} anni (${formatCurrency(seasonalAvg)}).`,
            basis: `${past.length} ${past.length === 1 ? 'anno' : 'anni'} di storico per ${mName}.`,
            chart: { labels: [`${mName} (solito)`, `${mName} (stima)`], values: [Math.round(seasonalAvg), proj], format: 'currency', highlightIndex: 1 },
          } });
      }
    }
  }

  // ── 29. HABIT — Recurring (fixed) cost load ──────────────────────────────
  // Sum of monthly-equivalent of all tagged recurring expenses vs avg income.
  if (h.avgIncome > 0) {
    let fixedMonthly = 0;
    for (const [, t] of seriesMap) {
      if (t.type !== 'expense') continue;
      const rule = t.recurring!;
      if (rule.until && rule.until < today) continue;
      const perMonth = rule.freq === 'daily' ? t.amount * 30
        : rule.freq === 'weekly' ? t.amount * 4.33
        : rule.freq === 'yearly' ? t.amount / 12
        : t.amount;
      fixedMonthly += perMonth;
    }
    if (fixedMonthly > 0) {
      const share = Math.round((fixedMonthly / h.avgIncome) * 100);
      const heavy = share >= 50;
      push({ icon: '🧾', category: 'habit',
        title: `Spese fisse: ${share}% del reddito`,
        detail: `~${formatCurrency(fixedMonthly)}/mese di ricorrenti su ~${formatCurrency(h.avgIncome)} di entrate`,
        accent: heavy ? ACCENT.warn : ACCENT.info,
        tone: heavy ? 'caution' : 'neutral',
        explain: {
          what: 'Quanta parte del reddito è già impegnata in costi fissi ricorrenti.',
          how: 'Sommo tutte le spese ricorrenti riportate al mese (settimanali ×4,33, annuali ÷12, giornaliere ×30) e le divido per la media delle entrate.',
          basis: 'Ricorrenti attive + media entrate ultimi 3 mesi.',
          chart: { labels: ['Fisse', 'Reddito'], values: [Math.round(fixedMonthly), Math.round(h.avgIncome)], format: 'currency', highlightIndex: 0 },
        } });
    }
  }

  // ── 30. TREND — Positive-savings streak ──────────────────────────────────
  {
    const last12 = recentMonths(transactions, 12, now).filter(m => m.income > 0);
    let streak = 0;
    for (let i = last12.length - 1; i >= 0; i--) {
      if (last12[i].savings > 0) streak++;
      else break;
    }
    if (streak >= 3) {
      push({ icon: '🔥', category: 'trend',
        title: `${streak} mesi di fila in positivo`,
        detail: `Chiudi il mese risparmiando da ${streak} mesi consecutivi`,
        accent: ACCENT.good,
        tone: 'positive',
        explain: {
          what: 'Mesi consecutivi più recenti chiusi con risparmio positivo.',
          how: 'Scorro i mesi dal più recente e conto quanti di fila hanno Entrate − Uscite − Investimenti > 0.',
          basis: 'Ultimi 12 mesi con entrate.',
          chart: { labels: last12.slice(-6).map(m => shortMonth(m.key)), values: last12.slice(-6).map(m => Math.round(m.savings)), format: 'currency' },
        } }, 'medium');
    }
  }

  // ── 31. HIGHLIGHT — Year-to-date savings ─────────────────────────────────
  {
    const ytdKeys: string[] = [];
    for (let m = 0; m <= now.getMonth(); m++) ytdKeys.push(`${now.getFullYear()}-${String(m + 1).padStart(2, '0')}`);
    const a = aggregateMonths(transactions, ytdKeys);
    const ytdSav = a.income - a.expense - a.invest;
    if (a.income > 0 && now.getMonth() >= 1) {
      push({ icon: '🗓️', category: 'highlight',
        title: `Da inizio anno: ${ytdSav >= 0 ? '+' : '−'}${formatCurrency(Math.abs(ytdSav))} risparmiati`,
        detail: `+ ${formatCurrency(a.invest)} investiti su ${formatCurrency(a.income)} di entrate nel ${now.getFullYear()}`,
        accent: ytdSav >= 0 ? ACCENT.good : ACCENT.warn,
        tone: ytdSav >= 0 ? 'positive' : 'caution',
        explain: {
          what: `Bilancio cumulato da gennaio a ${monthNameFromIndex(now.getMonth())}.`,
          how: 'Sommo entrate, uscite e investimenti di tutti i mesi dell\'anno corrente; il risparmio è la differenza.',
          basis: `Anno ${now.getFullYear()}, mese corrente incluso.`,
          chart: { labels: ['Entrate', 'Uscite', 'Investito', 'Risparmio'], values: [Math.round(a.income), Math.round(a.expense), Math.round(a.invest), Math.round(ytdSav)], format: 'currency', highlightIndex: 3 },
        } });
    }
  }

  // ── 32. HABIT — Heaviest weekday for spending ────────────────────────────
  {
    const cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3);
    const byDow = [0, 0, 0, 0, 0, 0, 0];
    let total = 0;
    for (const t of transactions) {
      if (t.type !== 'expense' || localDate(t.date) < cutoff) continue;
      const dow = localDate(t.date).getDay();
      const s = ownShare(t);
      byDow[dow] += s; total += s;
    }
    if (total > 100) {
      let maxDow = 0;
      for (let i = 1; i < 7; i++) if (byDow[i] > byDow[maxDow]) maxDow = i;
      const share = pct(byDow[maxDow], total);
      if (share >= 22) {
        const names = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const shortNames = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        push({ icon: '📆', category: 'habit',
          title: `${names[maxDow]} è il tuo giorno di spesa`,
          detail: `Il ${share}% delle uscite degli ultimi 3 mesi cade di ${names[maxDow].toLowerCase()}`,
          accent: ACCENT.info,
          tone: 'neutral',
          explain: {
            what: 'Il giorno della settimana in cui concentri più spesa.',
            how: 'Sommo le uscite degli ultimi 3 mesi per giorno della settimana e prendo il maggiore.',
            basis: 'Ultimi 3 mesi di uscite.',
            chart: { labels: shortNames, values: byDow.map(v => Math.round(v)), format: 'currency', highlightIndex: maxDow },
          } });
      }
    }
  }

  // ── 33. TREND — Income quarter-over-quarter ──────────────────────────────
  {
    const recentQ = [monthKey(1, now), monthKey(2, now), monthKey(3, now)];
    const priorQ  = [monthKey(4, now), monthKey(5, now), monthKey(6, now)];
    const rA = aggregateMonths(transactions, recentQ);
    const pA = aggregateMonths(transactions, priorQ);
    if (pA.income > 100 && rA.income > 100) {
      const delta = pct(rA.income - pA.income, pA.income);
      if (Math.abs(delta) >= 10) {
        const up = delta > 0;
        push({ icon: up ? '💰' : '📥', category: 'trend',
          title: `Entrate trimestre ${up ? '+' : '−'}${Math.abs(delta)}%`,
          detail: `${formatCurrency(rA.income)} negli ultimi 3 mesi vs ${formatCurrency(pA.income)} nei 3 precedenti`,
          accent: up ? ACCENT.good : ACCENT.info,
          tone: up ? 'positive' : 'neutral',
          explain: {
            what: 'Andamento delle entrate tra gli ultimi due trimestri.',
            how: 'Somma delle entrate del trimestre recente vs precedente, variazione percentuale.',
            basis: 'Ultimi 6 mesi completi (mese corrente escluso).',
            chart: { labels: ['Trim. prec.', 'Trim. recente'], values: [Math.round(pA.income), Math.round(rA.income)], format: 'currency', highlightIndex: 1 },
          } });
      }
    }
  }

  // ── 34. HIGHLIGHT — Average transaction size trend ───────────────────────
  if (months3.length >= 2) {
    const avgSize = months3.map(m => {
      const txs = transactions.filter(t => t.type === 'expense' && t.date.startsWith(m.key));
      const sum = txs.reduce((s, t) => s + ownShare(t), 0);
      return txs.length ? sum / txs.length : 0;
    }).filter(v => v > 0);
    if (avgSize.length >= 2) {
      const first = avgSize[0], last = avgSize[avgSize.length - 1];
      const delta = pct(last - first, first);
      if (Math.abs(delta) >= 20) {
        const up = delta > 0;
        push({ icon: '🔬', category: 'highlight',
          title: `Scontrino medio ${up ? 'in aumento' : 'in calo'} (${up ? '+' : '−'}${Math.abs(delta)}%)`,
          detail: `Da ${formatCurrency(first)} a ${formatCurrency(last)} a transazione negli ultimi mesi`,
          accent: up ? ACCENT.warn : ACCENT.good,
          tone: up ? 'caution' : 'positive',
          explain: {
            what: 'Come cambia l\'importo medio di una singola spesa.',
            how: 'Per ogni mese: uscite totali ÷ numero di transazioni di spesa. Confronto il primo e l\'ultimo mese con dati.',
            basis: 'Ultimi 3 mesi con dati.',
            chart: { labels: months3.map(m => shortMonth(m.key)), values: avgSize.map(v => Math.round(v)), format: 'currency' },
          } });
      }
    }
  }

  // ── 35. HIGHLIGHT — Cash runway (accounting balance ÷ avg monthly spend) ──
  if (h.avgExpense > 0) {
    let netBalance = 0;
    for (const t of transactions) {
      if (t.type === 'income')          netBalance += t.amount;
      else if (t.type === 'expense')    netBalance -= ownShare(t);
      else if (t.type === 'investment') netBalance -= investSign(t) * t.amount;
    }
    if (netBalance > 0) {
      const monthsCovered = netBalance / h.avgExpense;
      const healthy = monthsCovered >= CASH_AUTONOMY_MIN_MONTHS;
      const mLabel = monthsCovered >= 10 ? `${Math.round(monthsCovered)}` : monthsCovered.toFixed(1);
      push({
        icon: healthy ? '🏦' : '⏳', category: 'highlight',
        title: healthy
          ? `Il saldo copre ~${mLabel} mesi di spese`
          : `Saldo sotto i ${CASH_AUTONOMY_MIN_MONTHS} mesi di spese`,
        detail: `${formatCurrency(netBalance)} di saldo contabile · ~${formatCurrency(Math.round(h.avgExpense))}/mese di uscite`,
        accent: healthy ? ACCENT.good : ACCENT.warn,
        tone: healthy ? 'positive' : 'caution',
        explain: {
          what: 'Per quanti mesi il saldo coprirebbe le spese se le entrate si fermassero: un\'autonomia teorica, non un consiglio.',
          how: 'Saldo contabile (tutte le entrate − uscite − investimenti registrati nell\'app) ÷ media delle uscite degli ultimi mesi.',
          basis: 'Saldo contabile dell\'app (non il saldo reale in banca) + media uscite recenti.',
          chart: { labels: ['Saldo', 'Uscite/mese'], values: [Math.round(netBalance), Math.round(h.avgExpense)], format: 'currency', highlightIndex: 0 },
        },
      }, 'minimal');
    }
  }

  // ── 36. HABIT — A dormant category woke up this month ────────────────────
  {
    // Active months per expense category across all history (current excluded).
    const catMonths: Record<string, Set<string>> = {};
    for (const t of transactions) {
      if (t.type !== 'expense' || t.date.slice(0, 7) === curMon) continue;
      (catMonths[t.category] ??= new Set()).add(t.date.slice(0, 7));
    }
    const gapKeys = Array.from({ length: DORMANT_GAP_MONTHS }, (_, i) => monthKey(i + 1, now));
    let wokeCat = '', wokeAmount = 0;
    for (const [cat, amount] of Object.entries(curCat)) {
      if (amount <= 0) continue;
      const active = catMonths[cat];
      if (!active || active.size < DORMANT_MIN_ACTIVE) continue; // skip near-new categories
      if (gapKeys.every(k => !active.has(k)) && amount > wokeAmount) { wokeAmount = amount; wokeCat = cat; }
    }
    if (wokeCat) {
      const c = getCat(wokeCat);
      push({
        icon: c.icon, category: 'habit',
        title: `${c.label} è tornata dopo una pausa`,
        detail: `${formatCurrency(wokeAmount)} questo mese · nessuna spesa nei ${DORMANT_GAP_MONTHS} mesi precedenti`,
        accent: ACCENT.info,
        tone: 'neutral',
        explain: {
          what: `Hai ripreso a spendere in ${c.label} dopo almeno ${DORMANT_GAP_MONTHS} mesi senza movimenti.`,
          how: `Guardo le spese per categoria mese per mese: ${c.label} era a zero negli ultimi ${DORMANT_GAP_MONTHS} mesi e ricompare questo mese.`,
          basis: 'Storico spese per categoria (solo categorie con almeno 2 mesi di attività).',
        },
      }, 'medium');
    }
  }

  // ── 37. HABIT — Impulsive spending cluster in a single day ───────────────
  if (monthlyExpenses > 0) {
    const byDay: Record<string, { count: number; sum: number }> = {};
    for (const t of transactions) {
      if (t.type !== 'expense' || !t.date.startsWith(curMon)) continue;
      const d = (byDay[t.date] ??= { count: 0, sum: 0 });
      d.count++; d.sum += ownShare(t);
    }
    let topDay = '', peak = { count: 0, sum: 0 };
    for (const [day, d] of Object.entries(byDay)) {
      const hit = d.count >= CLUSTER_MIN_TX || d.sum / monthlyExpenses > CLUSTER_DAY_SHARE;
      if (hit && d.sum > peak.sum) { topDay = day; peak = d; }
    }
    if (topDay) {
      const share = pct(peak.sum, monthlyExpenses);
      const dayLabel = capitalize(localDate(topDay).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }));
      push({
        icon: '🛍️', category: 'habit',
        title: `Giornata di spesa intensa: ${dayLabel}`,
        detail: `${peak.count} spese per ${formatCurrency(peak.sum)} · il ${share}% delle uscite del mese`,
        accent: ACCENT.warn,
        tone: 'caution',
        explain: {
          what: 'Un giorno in cui hai concentrato molte spese o una grossa fetta del mese: utile per riconoscere gli acquisti d\'impulso.',
          how: `Sommo spese e numero di transazioni per ogni giorno del mese. Segnalo il giorno con almeno ${CLUSTER_MIN_TX} spese oppure oltre il ${Math.round(CLUSTER_DAY_SHARE * 100)}% delle uscite mensili.`,
          basis: 'Spese del mese corrente, raggruppate per giorno.',
        },
      }, 'medium');
    }
  }

  // ── 38. HIGHLIGHT — First time spending on a new merchant ────────────────
  {
    const norm = (s: string) => s.toLowerCase().trim();
    const seenBefore = new Set<string>();
    for (const t of transactions) {
      if (t.type !== 'expense' || t.date.startsWith(curMon)) continue;
      const d = norm(t.description);
      if (d) seenBefore.add(d);
    }
    let newDesc = '', newAmount = 0, newCat = '';
    for (const t of transactions) {
      if (t.type !== 'expense' || !t.date.startsWith(curMon)) continue;
      const d = norm(t.description);
      if (!d || seenBefore.has(d)) continue;
      const a = ownShare(t);
      if (a >= FIRST_TIME_MIN_AMOUNT && a > newAmount) { newAmount = a; newDesc = t.description.trim(); newCat = t.category; }
    }
    if (newDesc) {
      const c = getCat(newCat);
      push({
        icon: '🆕', category: 'highlight',
        title: `Prima volta: ${newDesc.length > 28 ? newDesc.slice(0, 27) + '…' : newDesc}`,
        detail: `${formatCurrency(newAmount)} in ${c.label} · descrizione mai vista prima`,
        accent: ACCENT.info,
        tone: 'neutral',
        explain: {
          what: 'Una spesa con una descrizione mai usata finora: può essere un nuovo esercente o un acquisto una tantum.',
          how: `Confronto le descrizioni (in minuscolo, senza spazi extra) delle spese di questo mese con tutto lo storico. Segnalo la più alta tra le nuove, sopra ${formatCurrency(FIRST_TIME_MIN_AMOUNT)}.`,
          basis: 'Tutte le descrizioni di spesa precedenti vs mese corrente.',
        },
      }, 'advanced');
    }
  }

  // ── 39. HIGHLIGHT — Savings rate vs the 20% benchmark ────────────────────
  if (h.avgIncome > 0 && h.months >= 2) {
    const rate = (h.avgIncome - h.avgExpense - h.avgInvest) / h.avgIncome;
    const ratePct = Math.round(rate * 100);
    if (rate > 0) {
      const meets = rate >= SAVINGS_RATE_BENCHMARK;
      const benchPct = Math.round(SAVINGS_RATE_BENCHMARK * 100);
      push({
        icon: meets ? '🌟' : '🌱', category: 'highlight',
        title: meets ? `Risparmi il ${ratePct}% del reddito` : `Tasso di risparmio: ${ratePct}%`,
        detail: meets
          ? `Sopra il ${benchPct}% di riferimento — un buon ritmo`
          : `Riferimento comune: ${benchPct}% · ogni punto in più aiuta`,
        accent: meets ? ACCENT.good : ACCENT.info,
        tone: meets ? 'positive' : 'neutral',
        explain: {
          what: 'La quota media del reddito che ti resta dopo spese e investimenti, confrontata con il riferimento del 20%. Investimenti esclusi dal risparmio.',
          how: '(Entrate medie − Uscite medie − Investimenti medi) ÷ Entrate medie, sugli ultimi mesi con dati.',
          basis: `Ultimi ${h.months} mesi con dati.`,
          chart: { labels: ['Tu', 'Riferimento'], values: [ratePct, benchPct], format: 'percent', highlightIndex: 0 },
        },
      }, 'minimal');
    }
  }

  // ── 40. HIGHLIGHT — Portfolio performance (latent gain/loss) ─────────────
  if (input.portfolio && input.portfolio.versato > 0) {
    const { controvalore, versato } = input.portfolio;
    const pl = controvalore - versato;
    const rawPct = (pl / versato) * 100;
    const plPct = Math.round(rawPct);
    if (Math.abs(rawPct) >= PORTFOLIO_MIN_PCT) {
      const gain = pl >= 0;
      push({
        icon: gain ? '📈' : '📉', category: 'highlight',
        title: gain
          ? `Investimenti in guadagno: +${formatCurrency(pl)} (+${plPct}%)`
          : `Investimenti in perdita: −${formatCurrency(-pl)} (${plPct}%)`,
        detail: `Controvalore ${formatCurrency(controvalore)} su ${formatCurrency(versato)} versati`,
        accent: gain ? ACCENT.good : ACCENT.warn,
        tone: gain ? 'positive' : 'caution',
        explain: {
          what: 'La plusvalenza o minusvalenza latente del portafoglio: quanto vale oggi rispetto a quanto hai versato. È un valore non realizzato, cambia con i mercati.',
          how: 'Controvalore attuale − capitale versato. La percentuale è calcolata sul versato.',
          basis: 'Valori di mercato impostati sulle categorie di investimento + versamenti netti.',
          chart: { labels: ['Versato', 'Controvalore'], values: [Math.round(versato), Math.round(controvalore)], format: 'currency', highlightIndex: 1 },
        },
      }, 'minimal');
    }
  }

  // ── 41. HIGHLIGHT — Net worth trajectory (new all-time high) ─────────────
  if (h.months >= NETWORTH_MIN_MONTHS) {
    const allKeys = new Set<string>();
    for (const t of transactions) allKeys.add(t.date.slice(0, 7));
    const sortedKeys = [...allKeys].sort();
    if (sortedKeys.length >= NETWORTH_MIN_MONTHS) {
      const controvalore = input.portfolio?.controvalore ?? 0;
      let cum = 0;
      const nw: { key: string; value: number }[] = [];
      for (const k of sortedKeys) {
        cum += monthStats(transactions, k).savings;
        nw.push({ key: k, value: cum + controvalore });
      }
      const latest = nw[nw.length - 1];
      const prevMax = Math.max(...nw.slice(0, -1).map(p => p.value));
      if (latest.value > prevMax && latest.value > 0) {
        const last6 = nw.slice(-6);
        push({
          icon: '🏔️', category: 'highlight',
          title: `Nuovo massimo di patrimonio: ${formatCurrency(Math.round(latest.value))}`,
          detail: controvalore > 0
            ? `Risparmi accumulati + investimenti (${formatCurrency(Math.round(controvalore))})`
            : 'Risparmi accumulati nel tempo',
          accent: ACCENT.good,
          tone: 'positive',
          explain: {
            what: 'Il patrimonio stimato — risparmi accumulati più il valore attuale degli investimenti — ha toccato un nuovo massimo.',
            how: 'Sommo mese dopo mese il risparmio (entrate − uscite − investimenti) e aggiungo il controvalore attuale degli investimenti. Il valore di questo mese supera tutti i precedenti.',
            basis: controvalore > 0 ? 'Tutto lo storico dei movimenti + controvalore investimenti.' : 'Tutto lo storico dei movimenti.',
            chart: { labels: last6.map(p => shortMonth(p.key)), values: last6.map(p => Math.round(p.value)), format: 'currency', highlightIndex: last6.length - 1 },
          },
        }, 'medium');
      }
    }
  }

  // ── 42. HABIT — Subscription price creep ─────────────────────────────────
  // Group recurring expense occurrences by series; flag a latest amount that is
  // ≥CREEP_PCT above the baseline median, but only when the baseline is tight
  // (so naturally-variable bills don't false-positive).
  {
    const norm = (s: string) => s.toLowerCase().trim();
    const seriesAmounts: Record<string, { label: string; items: { date: string; amount: number }[] }> = {};
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const key = t.seriesId ?? (t.recurring ? `rec:${norm(t.description)}` : null);
      if (!key) continue;
      const g = (seriesAmounts[key] ??= { label: t.description.trim() || 'Abbonamento', items: [] });
      g.items.push({ date: t.date, amount: t.amount });
    }
    let creepLabel = '', creepFrom = 0, creepTo = 0, creepPct = 0;
    for (const g of Object.values(seriesAmounts)) {
      if (g.items.length < CREEP_MIN_OCCURRENCES) continue;
      const sorted = [...g.items].sort((a, b) => a.date.localeCompare(b.date));
      const latest = sorted[sorted.length - 1].amount;
      const baseline = sorted.slice(0, -1).map(i => i.amount);
      const med = median(baseline);
      if (med <= 0) continue;
      const maxBaseline = Math.max(...baseline);
      if (maxBaseline > med * CREEP_STABILITY) continue;       // baseline not stable → skip
      if (latest < med * (1 + CREEP_PCT) || latest - med < CREEP_MIN_DELTA) continue;
      const incPct = Math.round(((latest - med) / med) * 100);
      if (incPct > creepPct) { creepPct = incPct; creepLabel = g.label; creepFrom = med; creepTo = latest; }
    }
    if (creepLabel) {
      push({
        icon: '🧾', category: 'habit',
        title: `Rincaro: ${creepLabel.length > 24 ? creepLabel.slice(0, 23) + '…' : creepLabel} +${creepPct}%`,
        detail: `Da ~${formatCurrency(creepFrom)} a ${formatCurrency(creepTo)} sull'ultimo addebito`,
        accent: ACCENT.warn,
        tone: 'caution',
        explain: {
          what: 'Un pagamento ricorrente è aumentato rispetto al suo solito importo: utile per accorgersi dei rincari degli abbonamenti.',
          how: `Confronto l'ultimo addebito con la mediana degli addebiti precedenti della stessa serie (almeno ${CREEP_MIN_OCCURRENCES} occorrenze). Segnalo solo se gli importi precedenti erano stabili e l'aumento supera il ${Math.round(CREEP_PCT * 100)}%.`,
          basis: 'Storico degli addebiti ricorrenti della stessa serie.',
          chart: { labels: ['Prima', 'Ultimo'], values: [Math.round(creepFrom), Math.round(creepTo)], format: 'currency', highlightIndex: 1 },
        },
      }, 'medium');
    }
  }

  // ── 43. HABIT — Payday effect ────────────────────────────────────────────
  // Detect the main recurring paycheck (largest recurring income series), then
  // measure how much spending clusters in the PAYDAY_WINDOW_DAYS right after it.
  {
    let payday: Transaction | null = null;
    for (const [, t] of seriesMap) {
      if (t.type !== 'income') continue;
      if (!payday || t.amount > payday.amount) payday = t;
    }
    if (payday) {
      const paydayDom = localDate(payday.date).getDate();
      const histKeys = [monthKey(1, now), monthKey(2, now), monthKey(3, now)];
      let windowSpend = 0, totalSpend = 0;
      for (const k of histKeys) {
        const [y, m] = k.split('-').map(Number);
        const dim = new Date(y, m, 0).getDate();
        const start = Math.min(paydayDom, dim);
        const end = Math.min(paydayDom + PAYDAY_WINDOW_DAYS - 1, dim);
        for (const t of transactions) {
          if (t.type !== 'expense' || t.date.slice(0, 7) !== k) continue;
          const s = ownShare(t);
          totalSpend += s;
          const dom = localDate(t.date).getDate();
          if (dom >= start && dom <= end) windowSpend += s;
        }
      }
      if (totalSpend > 0) {
        const share = windowSpend / totalSpend;
        if (share >= PAYDAY_MIN_SHARE) {
          push({
            icon: '💸', category: 'habit',
            title: `Effetto stipendio: ${Math.round(share * 100)}% di spese nei giorni dopo l'accredito`,
            detail: `Concentri le uscite nei ${PAYDAY_WINDOW_DAYS} giorni dopo il ${paydayDom} del mese`,
            accent: ACCENT.info,
            tone: 'neutral',
            explain: {
              what: 'Tendi a spendere di più subito dopo l\'arrivo dello stipendio. Riconoscerlo aiuta a distribuire meglio le spese nel mese.',
              how: `Individuo l'entrata ricorrente principale (il ${paydayDom} del mese) e sommo le uscite nei ${PAYDAY_WINDOW_DAYS} giorni successivi, confrontandole col totale del mese.`,
              basis: 'Ultimi 3 mesi di uscite vs entrata ricorrente principale.',
            },
          }, 'advanced');
        }
      }
    }
  }

  // ── 44. HABIT — Month front-loading (spending earlier than usual) ────────
  if (h.avgExpense > 0 && monthlyExpenses > 0) {
    const D = now.getDate();
    if (D >= FRONTLOAD_MIN_DAY && prog < 0.9) {
      const histKeys = [monthKey(1, now), monthKey(2, now), monthKey(3, now)];
      const fractions: number[] = [];
      for (const k of histKeys) {
        let total = 0, byD = 0;
        for (const t of transactions) {
          if (t.type !== 'expense' || t.date.slice(0, 7) !== k) continue;
          const s = ownShare(t);
          total += s;
          if (localDate(t.date).getDate() <= D) byD += s;
        }
        if (total > 0) fractions.push(byD / total);
      }
      if (fractions.length >= 2) {
        const expectedByD = avg(fractions) * h.avgExpense;
        if (expectedByD > 0 && monthlyExpenses >= expectedByD * FRONTLOAD_RATIO) {
          const aheadPct = Math.round((monthlyExpenses / expectedByD - 1) * 100);
          push({
            icon: '⏩', category: 'habit',
            title: `Spese in anticipo sul mese (+${aheadPct}%)`,
            detail: `Hai già speso ${formatCurrency(monthlyExpenses)} · di solito a questo punto sei a ~${formatCurrency(Math.round(expectedByD))}`,
            accent: ACCENT.warn,
            tone: 'caution',
            explain: {
              what: 'Stai spendendo prima del solito: a questo giorno del mese hai già superato il tuo ritmo cumulato abituale. È un avviso anticipato, non una proiezione di fine mese.',
              how: `Confronto quanto hai speso entro il giorno ${D} con quanto avevi tipicamente speso entro lo stesso giorno nei mesi scorsi (frazione media × media mensile).`,
              basis: 'Spesa cumulata a oggi vs profilo cumulato degli ultimi mesi.',
              chart: { labels: ['Solito a oggi', 'Ora'], values: [Math.round(expectedByD), Math.round(monthlyExpenses)], format: 'currency', highlightIndex: 1 },
            },
          }, 'medium');
        }
      }
    }
  }

  // ══ FASE 4 — admin-only advanced insights ═════════════════════════════════
  // All gated behind input.isAdmin (the same allowlist as Forecast V3).

  // ── 45. TREND — Unpredictable categories (sparse / irregular) ─────────────
  // Engine-independent: flags expense categories that show up in only a few of
  // the last 12 months (rare, irregular spend), so their end-of-month estimate is
  // inherently soft. Replaces the old V3 behavioural classification.
  if (input.isAdmin && input.forecastExpenseCategories && input.forecastExpenseCategories.length > 0) {
    const catIds = new Set(input.forecastExpenseCategories.map(c => c.id));
    const windowKeys = new Set<string>();
    for (let i = 0; i < 12; i++) windowKeys.add(monthKey(i, now));
    const stat = new Map<string, { months: Set<string>; count: number; total: number }>();
    for (const t of transactions) {
      if (t.type !== 'expense' || !catIds.has(t.category)) continue;
      const k = t.date.slice(0, 7);
      if (!windowKeys.has(k)) continue;
      const e = stat.get(t.category) ?? { months: new Set<string>(), count: 0, total: 0 };
      e.months.add(k); e.count += 1; e.total += ownShare(t);
      stat.set(t.category, e);
    }
    // Rare/irregular = present in ≤ 40% of the window's months, with ≥ 2 occurrences.
    const unpredictable = [...stat.entries()]
      .filter(([, e]) => e.total > 0 && e.count >= 2 && e.months.size / windowKeys.size <= 0.4)
      .map(([categoryId, e]) => ({ categoryId, total: e.total }));
    if (unpredictable.length > 0) {
      const top = [...unpredictable].sort((a, b) => b.total - a.total).slice(0, 3);
      const names = top.map(c => getCat(c.categoryId).label).join(', ');
      push({
        icon: '🎲', category: 'trend',
        title: `${unpredictable.length} categori${unpredictable.length === 1 ? 'a' : 'e'} con spesa imprevedibile`,
        detail: names,
        accent: ACCENT.neutral,
        tone: 'neutral',
        explain: {
          what: 'Categorie in cui la spesa è difficile da prevedere: poche occorrenze o forte variabilità, quindi le stime sono meno affidabili.',
          how: 'Uso la confidenza del motore di previsione V4: categorie la cui stima è classificata a bassa confidenza.',
          basis: 'Confidenza per categoria del motore V4 sulle categorie di spesa.',
        },
      }, 'advanced');
    }
  }

  // ── 46. TREND — Budget adherence streak ──────────────────────────────────
  if (input.isAdmin && input.budgets) {
    const planned = Object.values(input.budgets).reduce((s, v) => s + v, 0);
    if (planned > 0) {
      const last = recentMonths(transactions, 6, now).filter(m => m.txCount > 0);
      if (last.length >= 3) {
        const within = last.map(m => m.expense <= planned);
        const withinCount = within.filter(Boolean).length;
        let streak = 0;
        for (let i = within.length - 1; i >= 0; i--) { if (within[i]) streak++; else break; }
        if (streak >= BUDGET_STREAK_MIN) {
          push({
            icon: '🎯', category: 'trend',
            title: `${streak} mesi di fila entro il budget`,
            detail: `${withinCount} degli ultimi ${last.length} mesi sotto il piano di ${formatCurrency(planned)}/mese`,
            accent: ACCENT.good,
            tone: 'positive',
            explain: {
              what: 'Quante volte di recente hai chiuso il mese entro il budget pianificato.',
              how: 'Confronto le uscite totali di ogni mese con la somma dei budget di categoria. Lo streak conta i mesi consecutivi più recenti entro il piano.',
              basis: 'Ultimi 6 mesi vs budget attuale (lo storico mensile del budget non è memorizzato: uso il piano corrente come riferimento).',
              chart: { labels: last.map(m => shortMonth(m.key)), values: last.map(m => Math.round(m.expense)), format: 'currency', refLine: Math.round(planned), refLabel: 'piano' },
            },
          }, 'medium');
        }
      }
    }
  }

  // ── 47. TREND — Robust category anomaly (median ± k·MAD) ─────────────────
  // Replaces #22 for admins: a category whose monthly total this month falls
  // outside its robust historical band. Reuses V3's MAD approach.
  if (input.isAdmin) {
    const histKeys = Array.from({ length: 12 }, (_, i) => monthKey(i + 1, now));
    let aCat = '', aCur = 0, aMed = 0, aUpper = 0;
    for (const [catId, curAmt] of Object.entries(curCat)) {
      if (curAmt <= 0) continue;
      const series: number[] = [];
      for (const k of histKeys) {
        let s = 0;
        for (const t of transactions) {
          if (t.type === 'expense' && t.category === catId && t.date.startsWith(k)) s += ownShare(t);
        }
        if (s > 0) series.push(s);
      }
      if (series.length < ANOMALY_MIN_SAMPLES) continue;
      const med = median(series);
      const madVal = mad(series);
      if (med <= 0 || madVal <= 0) continue;
      const upper = med + ANOMALY_K_MAD * madVal;
      if (curAmt > upper && (curAmt - upper) > (aCur - aUpper)) {
        aCat = catId; aCur = curAmt; aMed = med; aUpper = upper;
      }
    }
    if (aCat) {
      const c = getCat(aCat);
      push({
        icon: '📡', category: 'trend',
        title: `${c.label}: spesa fuori norma questo mese`,
        detail: `${formatCurrency(aCur)} vs tipico ~${formatCurrency(Math.round(aMed))}/mese`,
        accent: ACCENT.warn,
        tone: 'caution',
        explain: {
          what: `La spesa in ${c.label} questo mese è statisticamente anomala rispetto alla sua distribuzione storica.`,
          how: `Uso mediana e deviazione assoluta mediana (MAD) dei mesi attivi: segnalo quando il mese corrente supera mediana + ${ANOMALY_K_MAD}×MAD. È un metodo robusto agli outlier, come nel motore di previsione V3.`,
          basis: 'Mesi attivi della categoria negli ultimi 12 mesi.',
          chart: { labels: ['Tipico', 'Questo mese'], values: [Math.round(aMed), Math.round(aCur)], format: 'currency', highlightIndex: 1 },
        },
      }, 'advanced');
    }
  }

  // ── 48. TREND — Cash-flow timing risk ────────────────────────────────────
  // Months that close positive but dip underwater mid-month (expenses land
  // before income). Simulated from a zero opening balance — a timing signal,
  // not the real bank balance (made explicit in the explain).
  if (input.isAdmin) {
    const months = [monthKey(1, now), monthKey(2, now), monthKey(3, now)];
    let riskyMonths = 0, consideredMonths = 0;
    for (const k of months) {
      const byDay = new Array(32).fill(0) as number[];
      let total = 0;
      for (const t of transactions) {
        if (!t.date.startsWith(k)) continue;
        const v = t.type === 'income' ? t.amount
          : t.type === 'expense' ? -ownShare(t)
          : -investSign(t) * t.amount;
        byDay[localDate(t.date).getDate()] += v;
        total += v;
      }
      if (total <= 0) continue; // only months that closed non-negative
      consideredMonths++;
      let run = 0, minRun = 0;
      for (let d = 1; d <= 31; d++) { run += byDay[d]; if (run < minRun) minRun = run; }
      if (minRun < 0 && -minRun >= total * CASHFLOW_DIP_RATIO) riskyMonths++;
    }
    if (riskyMonths >= CASHFLOW_MIN_MONTHS) {
      push({
        icon: '🌊', category: 'trend',
        title: 'Le uscite anticipano le entrate',
        detail: `In ${riskyMonths} degli ultimi ${consideredMonths} mesi il saldo del mese sarebbe sceso sotto zero prima dell'accredito`,
        accent: ACCENT.warn,
        tone: 'caution',
        explain: {
          what: 'Anche se il mese si chiude in positivo, le spese arrivano prima delle entrate: a metà mese rischi di andare in rosso pur risparmiando a fine mese.',
          how: 'Simulo l\'andamento giornaliero del mese (entrate − uscite − investimenti, partendo da zero il primo del mese) e guardo il punto più basso. Se scende sotto zero in modo marcato pur chiudendo positivo, c\'è un rischio di tempistica.',
          basis: 'Ultimi 3 mesi completi. Parte da zero a inizio mese: misura la tempistica dei flussi, non il saldo reale del conto.',
        },
      }, 'advanced');
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (out.length === 0) {
    push({ icon: '📊', category: 'highlight', title: 'Nessun insight ancora', detail: 'Aggiungi transazioni per analisi personalizzate', accent: ACCENT.neutral, tone: 'neutral' }, 'medium');
  }

  // ── eom-projection dedup ──────────────────────────────────────────────────
  // The end-of-month forecast (#2), the seasonal projection (#28) and the
  // pace-vs-average highlight (#24) all answer the same question ("how will
  // this month close?"). Keep only the highest-priority one. Priority follows
  // insertion order — #2 is pushed before #28 before #24 — so the first
  // family member in `out` wins and the rest are dropped.
  const firstEom = out.find(i => i._family === 'eom-projection');
  if (firstEom) {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i]._family === 'eom-projection' && out[i] !== firstEom) out.splice(i, 1);
    }
  }

  const catOrder: InsightCategory[] = ['alert', 'forecast', 'seasonal', 'trend', 'habit', 'highlight'];
  return [
    ...out.filter(i => i.urgent),
    ...out.filter(i => !i.urgent).sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category)),
  ];
}
