/**
 * Monthly recap — PURE logic (no React, no Firestore, no network).
 *
 * Cost constraint: the recap is computed entirely from the transactions already
 * loaded in memory. The financial totals are the SINGLE SOURCE OF TRUTH reused
 * from insightsEngine (`monthStats`/`recentMonths`) — never reimplemented here —
 * so the recap shows exactly the same numbers as the rest of the app.
 */
import { Transaction, CategoryDef, AccountDef, ownShare } from '../../types';
import { monthStats, recentMonths, monthKey, MonthStats } from '../insights/insightsEngine';
import { mad } from '../forecast/forecastStats';
import { buildRuleBasedDigest } from '../dashboard/aiDigest';

/** A deviation beyond mean ± K·MAD over recent history is "out of the usual". */
export const OUT_OF_USUAL_K = 1.5;
const USUAL_WINDOW = 6;

export type KpiKey = 'income' | 'expense' | 'invest' | 'saved';

export interface RecapDelta {
  abs: number;             // value − reference
  pct: number | null;      // null when the reference is 0
  /** Semantic sign: +1 = better, −1 = worse, 0 = flat (e.g. expenses down = +1). */
  good: -1 | 0 | 1;
  /** True when the value is beyond the usual band (mean ± K·MAD). */
  outOfUsual: boolean;
}

export interface RecapKpi {
  key: KpiKey;
  value: number;
  vsPrev: RecapDelta | null;   // null when the previous month has no data
  vsUsual: RecapDelta | null;  // null with < 2 months of history
}

export interface RecapDriver {
  categoryId: string;
  label: string;
  amount: number;   // this month's spend in the category
  delta: number;    // vs the trailing per-category average
  good: -1 | 0 | 1; // expense up = worse
}

export interface RecapMovement {
  id: string;
  date: string;
  type: Transaction['type'];
  typeLabel: string;       // Entrata / Uscita / Investimento / Trasferimento
  categoryLabel: string;
  note: string;
  amount: number;
  accountLabel: string;
}

export interface RecapTrajectory {
  points: { key: string; savingsRate: number }[];
  mean: number;            // refLine
  currentIndex: number;    // highlighted month (the target, last point)
}

export interface MonthlyRecap {
  month: string;           // YYYY-MM
  label: string;           // "Aprile 2026"
  generatedAt: string;     // YYYY-MM-DD
  isPartial: boolean;      // target === current month
  hasHistory: boolean;     // ≥ 1 prior month with data
  totals: MonthStats;
  kpis: RecapKpi[];
  trajectory: RecapTrajectory;
  drivers: RecapDriver[];
  verdict: string;
  streak: number;          // consecutive months with savingsRate above the mean
  narrative: string[];
  movements: RecapMovement[];
}

const TYPE_LABEL: Record<Transaction['type'], string> = {
  income: 'Entrata', expense: 'Uscita', investment: 'Investimento', transfer: 'Trasferimento',
};

/** "Aprile 2026" (capitalised) from a YYYY-MM key. */
export function recapMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const FIELD: Record<KpiKey, keyof MonthStats> = {
  income: 'income', expense: 'expense', invest: 'invest', saved: 'savings',
};
const BETTER_HIGHER: Record<KpiKey, boolean> = {
  income: true, expense: false, invest: true, saved: true,
};

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function makeDelta(value: number, ref: number, betterHigher: boolean, usual: number[]): RecapDelta {
  const abs = value - ref;
  const pct = ref !== 0 ? abs / Math.abs(ref) : null;
  const good: -1 | 0 | 1 = abs === 0 ? 0 : (abs > 0) === betterHigher ? 1 : -1;
  let outOfUsual = false;
  if (usual.length >= 3) {
    const c = mean(usual);
    const spread = mad(usual);
    outOfUsual = spread > 0
      ? Math.abs(value - c) > OUT_OF_USUAL_K * spread
      : Math.abs(value - c) > 0.15 * Math.max(1, Math.abs(c));
  }
  return { abs, pct, good, outOfUsual };
}

export interface RecapInput {
  transactions: Transaction[];
  getCat: (id: string) => CategoryDef;
  getAcc: (id: string) => AccountDef;
  month: string;           // YYYY-MM
  now?: Date;
}

export function buildMonthlyRecap({ transactions, getCat, getAcc, month, now = new Date() }: RecapInput): MonthlyRecap {
  const [y, m] = month.split('-').map(Number);
  const ref = new Date(y, m - 1, 15); // mid target month — anchors monthKey/recentMonths

  const totals = monthStats(transactions, month);
  const prev = monthStats(transactions, monthKey(1, ref));
  const usualMonths = recentMonths(transactions, USUAL_WINDOW, ref).filter(s => s.txCount > 0);
  const hasHistory = usualMonths.length > 0;

  // ── KPI doppio-delta ───────────────────────────────────────────────────────
  const kpis: RecapKpi[] = (Object.keys(FIELD) as KpiKey[]).map(key => {
    const f = FIELD[key];
    const value = totals[f] as number;
    const usualValues = usualMonths.map(s => s[f] as number);
    const vsPrev = prev.txCount > 0
      ? makeDelta(value, prev[f] as number, BETTER_HIGHER[key], usualValues)
      : null;
    const vsUsual = usualValues.length >= 2
      ? makeDelta(value, mean(usualValues), BETTER_HIGHER[key], usualValues)
      : null;
    return { key, value, vsPrev, vsUsual };
  });

  // ── Traiettoria savingsRate (12 mesi, target ultimo) ───────────────────────
  const points: { key: string; savingsRate: number }[] = [];
  const rateForMean: number[] = [];
  for (let i = 11; i >= 0; i--) {
    const k = monthKey(i, ref);
    const s = monthStats(transactions, k);
    points.push({ key: k, savingsRate: Number.isFinite(s.savingsRate) ? s.savingsRate : 0 });
    if (s.income > 0) rateForMean.push(s.savingsRate);
  }
  const meanRate = mean(rateForMean);
  const trajectory: RecapTrajectory = { points, mean: meanRate, currentIndex: points.length - 1 };

  // Streak: consecutive most-recent months with savingsRate above the mean.
  let streak = 0;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].savingsRate > meanRate) streak++; else break;
  }

  // ── Drivers "cosa è cambiato": top categorie spesa per |delta vs media| ────
  const usualKeys = new Set(usualMonths.map(s => s.key));
  const monthByCat: Record<string, number> = {};
  const usualByCat: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const k = t.date.slice(0, 7);
    if (k === month) monthByCat[t.category] = (monthByCat[t.category] ?? 0) + ownShare(t);
    else if (usualKeys.has(k)) usualByCat[t.category] = (usualByCat[t.category] ?? 0) + ownShare(t);
  }
  const usualMonthsCount = usualMonths.length || 1;
  const drivers: RecapDriver[] = [...new Set([...Object.keys(monthByCat), ...Object.keys(usualByCat)])]
    .map(id => {
      const amount = monthByCat[id] ?? 0;
      const avg = (usualByCat[id] ?? 0) / usualMonthsCount;
      const delta = amount - avg;
      const good: -1 | 0 | 1 = delta < 0 ? 1 : delta > 0 ? -1 : 0;
      return { categoryId: id, label: getCat(id).label, amount, delta, good };
    })
    .filter(d => Math.abs(d.delta) >= 1)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 4);

  // ── Verdetto deterministico ────────────────────────────────────────────────
  const ratePct = totals.income > 0 ? Math.round(totals.savingsRate * 100) : 0;
  const usualRatePct = Math.round(meanRate * 100);
  let verdict: string;
  if (!hasHistory) {
    verdict = totals.income > 0
      ? `Tasso di risparmio ${ratePct}% — primo mese tracciato`
      : 'Primo mese tracciato';
  } else if (totals.income <= 0) {
    verdict = 'Mese senza entrate registrate';
  } else {
    const rel = totals.savingsRate > meanRate ? 'sopra' : totals.savingsRate < meanRate ? 'sotto' : 'in linea con';
    const streakTxt = streak >= 2 && totals.savingsRate > meanRate ? `, ${streak} mesi sopra la media` : '';
    verdict = `Tasso ${ratePct}% — ${rel} il tuo solito (${usualRatePct}%)${streakTxt}`;
  }

  // ── Narrativa Sunny (deterministica, zero network) ─────────────────────────
  const narrative = buildRuleBasedDigest({
    income: totals.income, expenses: totals.expense, investments: totals.invest, saved: totals.savings,
    topInsights: [verdict, ...drivers.slice(0, 2).map(d =>
      `${d.label}: ${d.delta > 0 ? '+' : ''}${Math.round(d.delta)}€ rispetto al solito`)],
  });

  // ── Elenco movimenti del mese (data desc) ──────────────────────────────────
  const movements: RecapMovement[] = transactions
    .filter(t => t.date.startsWith(month))
    .sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .map(t => ({
      id: t.id, date: t.date, type: t.type, typeLabel: TYPE_LABEL[t.type],
      categoryLabel: getCat(t.category).label, note: t.notes ?? '',
      amount: t.amount, accountLabel: getAcc(t.account).label,
    }));

  return {
    month, label: recapMonthLabel(month), generatedAt: now.toISOString().slice(0, 10),
    isPartial: month === monthKey(0, now), hasHistory,
    totals, kpis, trajectory, drivers, verdict, streak, narrative, movements,
  };
}

/** Months that have any transaction, newest first — the archive list shown in Piano. */
export function listRecapMonths(transactions: Transaction[]): { ym: string; label: string; saved: number; savingsRate: number }[] {
  const months = new Set<string>();
  for (const t of transactions) months.add(t.date.slice(0, 7));
  return [...months].sort().reverse().map(ym => {
    const s = monthStats(transactions, ym);
    return { ym, label: recapMonthLabel(ym), saved: s.savings, savingsRate: s.savingsRate };
  });
}
