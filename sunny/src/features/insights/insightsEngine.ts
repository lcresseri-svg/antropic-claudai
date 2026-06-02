import { Transaction, RecurrenceRule, ownShare } from '../../types';
import { formatCurrency, capitalize } from '../../utils';
import { monthProgress, forecastSavings } from '../budget/budgetUtils';

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
  urgent?: boolean;
  category: InsightCategory;
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

function addPeriod(dateStr: string, freq: RecurrenceRule['freq']): string {
  const d = new Date(dateStr);
  if      (freq === 'daily')   d.setDate(d.getDate() + 1);
  else if (freq === 'weekly')  d.setDate(d.getDate() + 7);
  else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  else                          d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
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
  avgInvest: number;
  months: number;
}

export function history(transactions: Transaction[], windowN = 3, now: Date = new Date()): History {
  const keys = new Set<string>();
  for (let i = 1; i <= windowN; i++) keys.add(monthKey(i, now));

  const active = new Set<string>();
  let inc = 0, exp = 0, inv = 0;
  for (const t of transactions) {
    const k = t.date.slice(0, 7);
    if (!keys.has(k)) continue;
    active.add(k);
    if (t.type === 'income')     inc += t.amount;
    else if (t.type === 'expense')    exp += ownShare(t);
    else if (t.type === 'investment') inv += t.amount;
  }
  const n = Math.max(1, active.size);
  return { avgIncome: inc / n, avgExpense: exp / n, avgInvest: inv / n, months: active.size };
}

export function projectExpenses(monthlyExpenses: number, now: Date = new Date()): number {
  const p = monthProgress(now);
  return p > 0 ? Math.round(monthlyExpenses / p) : monthlyExpenses;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
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
    else if (t.type === 'investment') invest  += t.amount;
  }
  const savings = income - expense - invest;
  return { key, income, expense, invest, savings, savingsRate: income > 0 ? savings / income : NaN, txCount };
}

/** Stats for the last `n` completed months (offset 1..n), oldest→newest. */
function recentMonths(txs: Transaction[], n: number, now: Date): MonthStats[] {
  return Array.from({ length: n }, (_, i) => monthStats(txs, monthKey(n - i, now)));
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
}

export function buildInsights(input: InsightInput): Insight[] {
  const { transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, getCat } = input;
  const now    = input.now ?? new Date();
  const today  = now.toISOString().slice(0, 10);
  const curMon = monthKey(0, now);
  const prog   = monthProgress(now);
  const out: Insight[] = [];

  const DEPTH_ORDER: InsightDepth[] = ['minimal', 'medium', 'advanced'];
  const depthLevel = DEPTH_ORDER.indexOf(input.depth ?? 'advanced');
  const push = (i: Insight, minDepth: InsightDepth = 'advanced') => {
    if (DEPTH_ORDER.indexOf(minDepth) <= depthLevel) out.push(i);
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
      explain: {
        what: 'Un pagamento ricorrente che hai segnato sta per ripresentarsi.',
        how: `Prendo l'ultima occorrenza di "${t.description}" (${t.date}) e aggiungo la frequenza (${freqLabel}) per stimare la prossima scadenza.`,
        basis: 'Transazioni marcate come "Ricorrente".',
      },
    }, 'minimal');
  }

  // ── 0b. FORECAST — Monthly recurring summary ─────────────────────────────
  {
    const monthStart = `${ym(now)}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const monthEnd = `${ym(now)}-${String(lastDay).padStart(2, '0')}`;

    interface REntry { desc: string; amount: number; count: number }
    const thisMonth: REntry[] = [];

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
      if (count > 0) thisMonth.push({ desc: t.description, amount: t.amount, count });
    }

    if (thisMonth.length > 0) {
      const total = thisMonth.reduce((s, e) => s + e.amount * e.count, 0);
      const top3 = thisMonth.slice(0, 3)
        .map(e => `${e.desc}${e.count > 1 ? ` ×${e.count}` : ''}`)
        .join(' · ');
      push({
        icon: '🗓️', category: 'forecast',
        title: `${thisMonth.length} ricorrenti questo mese · ${formatCurrency(total)}`,
        detail: thisMonth.length > 3 ? `${top3} · +${thisMonth.length - 3} altre` : top3,
        accent: ACCENT.gold,
        explain: {
          what: 'Tutti i pagamenti ricorrenti attesi nel mese corrente, basati sulle scadenze calcolate.',
          how: 'Per ogni transazione taggata "Ricorrente" avanzo la data dell\'ultima occorrenza della frequenza impostata finché non rientra in questo mese, poi conto quante ne cadono entro fine mese.',
          basis: `${thisMonth.length} serie ricorrenti attive questo mese.`,
          chart: {
            labels: thisMonth.slice(0, 6).map(e => (e.desc.length > 12 ? e.desc.slice(0, 11) + '…' : e.desc)),
            values: thisMonth.slice(0, 6).map(e => Math.round(e.amount * e.count)),
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
      explain: {
        what: 'Questo mese stai spendendo e investendo più di quanto incassi.',
        how: 'Entrate − Uscite − Investimenti del mese corrente. Se è negativo, stai intaccando i risparmi.',
        basis: 'Solo transazioni del mese in corso.',
        chart: { labels: ['Entrate', 'Uscite', 'Investito'], values: [Math.round(monthlyIncome), Math.round(monthlyExpenses), Math.round(monthlyInvestments)], format: 'currency', highlightIndex: 1 },
      },
    }, 'medium');
  }

  // ── 2. FORECAST — End-of-month projection ────────────────────────────────
  // Skip too early in the month: projecting from a few days' run-rate explodes
  // the estimate and is misleading (a €50 spend on day 1 ≠ €1500 for the month).
  if ((monthlyExpenses > 0 || monthlyIncome > 0) && prog > 0.15) {
    const f = forecastSavings({
      monthlyIncome, monthlyExpenses, monthlyInvestments,
      avgIncome: h.avgIncome, avgExpense: h.avgExpense, avgInvest: h.avgInvest, now,
    });
    const projExp = f.projectedExpenses, expInc = f.expectedIncome, expInv = f.expectedInvest;
    const forecast = f.savings;
    const basis    = h.months > 0 ? 'spese attuali e abitudini storiche' : 'ritmo attuale';
    const pctMonth = Math.round(prog * 100);
    const howExp = h.avgExpense > 0
      ? `Parto da quanto hai già speso questo mese (${formatCurrency(monthlyExpenses)}) e aggiungo quanto spendi di solito nei giorni che restano: di norma spendi circa ${formatCurrency(h.avgExpense)} al mese e manca circa il ${100 - pctMonth}% del mese, quindi stimo intorno a ${formatCurrency(projExp)} di uscite a fine mese.`
      : `Riproietto quanto hai già speso (${formatCurrency(monthlyExpenses)}) sul resto del mese in base ai giorni passati (sei circa al ${pctMonth}%), arrivando a circa ${formatCurrency(projExp)}.`;
    const howInc = h.avgIncome > 0
      ? ` Per le entrate uso la cifra più alta tra quanto hai già incassato (${formatCurrency(monthlyIncome)}) e quanto incassi di solito (${formatCurrency(h.avgIncome)}), perché lo stipendio di solito arriva tutto insieme.`
      : ` Per le entrate considero quanto hai già incassato (${formatCurrency(monthlyIncome)}).`;
    push(forecast >= 0
      ? { icon: '🔮', category: 'forecast', title: `Fine mese stimato: +${formatCurrency(forecast)}`, detail: `Risparmio proiettato su ${basis}`, accent: ACCENT.good,
          explain: {
            what: 'Stima di quanto ti resterà a fine mese se mantieni questo ritmo.',
            how: `${howExp}${howInc} Il risparmio stimato è quello che resta: entrate previste, meno le uscite previste, meno gli investimenti.`,
            basis: 'Mese corrente + media degli ultimi mesi attivi.',
            chart: { labels: ['Entrate', 'Uscite stim.', 'Investito'], values: [Math.round(expInc), projExp, Math.round(expInv)], format: 'currency', highlightIndex: 0 },
          } }
      : { icon: '🔮', category: 'forecast', title: `Fine mese stimato: −${formatCurrency(-forecast)}`, detail: `Le uscite supererebbero le entrate su ${basis}`, accent: ACCENT.warn,
          explain: {
            what: 'A questo ritmo chiuderesti il mese in negativo.',
            how: `${howExp}${howInc} Mettendo insieme entrate previste, uscite previste e investimenti, il conto finale risulta negativo.`,
            basis: 'Mese corrente + media degli ultimi mesi attivi.',
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
      push({ icon: '💰', category: 'forecast', title: `Entrate sopra la media (+${pct(monthlyIncome - h.avgIncome, h.avgIncome)}%)`, detail: `Di solito incassi ~${formatCurrency(h.avgIncome)}/mese`, accent: ACCENT.good,
        explain: { what: 'Questo mese stai incassando più del solito.', how: `Entrate del mese (${formatCurrency(monthlyIncome)}) confrontate con la media degli ultimi ${h.months} mesi attivi.`, basis: 'Ultimi 3 mesi con dati.', chart: incChart } }, 'medium');
    } else if (prog > 0.45 && monthlyIncome < h.avgIncome * 0.85) {
      push({ icon: '📥', category: 'forecast', title: `Entrate ancora sotto la media`, detail: `Finora ${formatCurrency(monthlyIncome)} vs ~${formatCurrency(h.avgIncome)} tipici`, accent: ACCENT.info,
        explain: { what: 'Sei oltre metà mese ma le entrate sono sotto la tua norma.', how: `Confronto tra entrate correnti e media storica, considerando che è trascorso il ${Math.round(prog * 100)}% del mese.`, basis: 'Ultimi 3 mesi con dati.', chart: incChart } }, 'medium');
    } else if (monthlyIncome === 0) {
      push({ icon: '📥', category: 'forecast', title: `Entrate previste: ~${formatCurrency(h.avgIncome)}`, detail: 'Stima sulla media degli ultimi mesi', accent: ACCENT.info,
        explain: { what: 'Non hai ancora registrato entrate: ecco quanto incassi di solito.', how: 'Media delle entrate sugli ultimi mesi attivi.', basis: 'Ultimi 3 mesi con dati.', chart: incChart } }, 'medium');
    }
  }

  // ── 5. FORECAST — Investment pace ─────────────────────────────────────────
  if (h.avgInvest > 0 || monthlyInvestments > 0) {
    const invChart: InsightChart = { labels: spanLbl, values: span.map(m => Math.round(m.invest)), format: 'currency', refLine: Math.round(h.avgInvest), refLabel: 'media' };
    if (h.avgInvest > 0 && monthlyInvestments === 0 && prog > 0.5) {
      push({ icon: '📈', category: 'forecast', title: `Non hai ancora investito questo mese`, detail: `Di solito investi ~${formatCurrency(h.avgInvest)}/mese`, accent: ACCENT.gold,
        explain: { what: 'Promemoria: di solito a questo punto del mese hai già investito.', how: 'Confronto tra investimenti del mese (0) e la media storica mensile.', basis: 'Ultimi 3 mesi con dati.', chart: invChart } });
    } else if (h.avgInvest > 0 && monthlyInvestments < h.avgInvest * 0.8 && prog > 0.5) {
      push({ icon: '📈', category: 'forecast', title: `Investimenti sotto la media`, detail: `${formatCurrency(monthlyInvestments)} vs ~${formatCurrency(h.avgInvest)} di solito`, accent: ACCENT.gold,
        explain: { what: 'Stai investendo meno del tuo ritmo abituale.', how: 'Investimenti del mese vs media storica mensile.', basis: 'Ultimi 3 mesi con dati.', chart: invChart } });
    } else if (monthlyInvestments > 0) {
      const ref = h.avgInvest > 0 ? h.avgInvest : monthlyInvestments;
      push({ icon: '📈', category: 'forecast', title: `Investiti ${formatCurrency(monthlyInvestments)} questo mese`, detail: `A questo ritmo ~${formatCurrency(ref * 12)}/anno`, accent: ACCENT.gold,
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
  {
    const lyKey = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ly = monthStats(transactions, lyKey);
    if (ly.expense > 100 && (monthlyExpenses > 0 || prog > 0.4)) {
      const proj = projectExpenses(monthlyExpenses, now);
      const delta = pct(proj - ly.expense, ly.expense);
      if (Math.abs(delta) >= 12) {
        const up = delta > 0;
        push({
          icon: '↔️', category: 'seasonal',
          title: `${up ? '+' : '−'}${Math.abs(delta)}% di spese vs ${longMonth(lyKey)} ${now.getFullYear() - 1}`,
          detail: `Proiezione ${formatCurrency(proj)} questo mese vs ${formatCurrency(ly.expense)} lo stesso mese l'anno scorso`,
          accent: up ? ACCENT.warn : ACCENT.good,
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
      push({ icon: '📊', category: 'trend', title: `Spese in crescita costante`, detail: `+${Math.round(relSlope * 100)}% al mese negli ultimi ${months6.length} mesi`, accent: ACCENT.warn,
        explain: { what: 'La traiettoria delle spese mensili è in aumento.', how: 'Confronto le uscite mese per mese e guardo se, nel complesso, la linea tende a salire in modo costante.', basis: `Ultimi ${months6.length} mesi con dati.`, chart: expChart } });
    } else if (relSlope < -0.06) {
      push({ icon: '📊', category: 'trend', title: `Stai riducendo le spese`, detail: `−${Math.round(Math.abs(relSlope) * 100)}% al mese negli ultimi ${months6.length} mesi`, accent: ACCENT.good,
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
      push({ icon: '🚀', category: 'trend', title: `Tasso di risparmio in crescita`, detail: `Ora al ${Math.round(curRate * 100)}% · la tendenza è positiva`, accent: ACCENT.good,
        explain: { what: 'La quota di reddito che riesci a risparmiare sta aumentando.', how: 'Per ogni mese calcolo quanta parte delle entrate ti resta dopo spese e investimenti, e guardo se questa quota cresce nel tempo.', basis: 'Mesi con entrate negli ultimi 6.', chart: rateChart } });
    } else if (rateSlope < -0.03) {
      push({ icon: '📉', category: 'trend', title: `Tasso di risparmio in calo`, detail: `La quota risparmiata sul reddito sta diminuendo`, accent: ACCENT.warn,
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
      push({ icon: '💎', category: 'trend', title: `Stai investendo il ${investRate}% del reddito`, detail: `Ottimo ritmo — proietti ${formatCurrency(h6.avgInvest * 12)} investiti all'anno`, accent: ACCENT.gold, explain: base });
    } else {
      push({ icon: '📈', category: 'trend', title: `Investi il ${investRate}% del reddito`, detail: `A questo ritmo ${formatCurrency(h6.avgInvest * 12)}/anno · la soglia consigliata è 15%`, accent: ACCENT.info, explain: base });
    }
  }

  // ── 12. TREND — Annual projection ─────────────────────────────────────────
  if (h.months >= 2 && h.avgIncome > 0) {
    const yrSav = Math.round((h.avgIncome - h.avgExpense - h.avgInvest) * 12);
    const yrInv = Math.round(h.avgInvest * 12);
    push({
      icon: '🗓️', category: 'trend',
      title: `Proiezione annuale: ${yrSav >= 0 ? '+' : '−'}${formatCurrency(Math.abs(yrSav))} risparmiati`,
      detail: `+ ${formatCurrency(yrInv)} investiti · totale ${formatCurrency(Math.abs(yrSav) + yrInv)}`,
      accent: yrSav >= 0 ? ACCENT.good : ACCENT.warn,
      explain: {
        what: 'Quanto accumuleresti in un anno mantenendo le medie attuali.',
        how: `(Entrate − Uscite − Investimenti) medie mensili × 12 per il risparmio; investimenti medi × 12 per il capitale investito.`,
        basis: 'Medie sugli ultimi 3 mesi con dati.',
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
      push({ icon: c.icon, category: 'trend', title: `${c.label} in forte crescita`, detail: `Media mensile ${formatCurrency(avg(vals))} · +${Math.round(fastSlope * 100)}% mese su mese`, accent: ACCENT.warn,
        explain: { what: `La spesa in ${c.label} sta accelerando.`, how: 'Confronto quanto spendi in questa categoria mese dopo mese: l\'aumento è marcato rispetto a dove eri partito.', basis: 'Ultimi 3 mesi con dati.', chart: { labels: months3.map(m => shortMonth(m.key)), values: vals.map(v => Math.round(v)), format: 'currency' } } });
    }
  }

  // ── 14. TREND — Best month in the past year ──────────────────────────────
  if (months12.length >= 3) {
    const best = months12.reduce((a, b) => a.savings > b.savings ? a : b);
    if (best.savings > 0) {
      push({ icon: '🏆', category: 'trend', title: `Miglior mese: ${longMonth(best.key)} (${formatCurrency(best.savings)})`, detail: `Il tuo record di risparmio nell'ultimo anno`, accent: ACCENT.good,
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
        push({ icon: '🗓️', category: 'habit', title: `Spendi il ${Math.round((ratio - 1) * 100)}% in più nel weekend`, detail: `Media ${formatCurrency(weAvg)}/transazione (weekend) vs ${formatCurrency(wdAvg)} (feriali)`, accent: ACCENT.info,
          explain: { what: 'Il weekend è più costoso per te, a parità di singola spesa.', how: 'Spesa media per transazione nei giorni feriali vs sabato/domenica.', basis: 'Ultimi 3 mesi di uscite.', chart } });
      } else if (ratio < 0.72) {
        push({ icon: '🗓️', category: 'habit', title: `Più disciplinato nel weekend`, detail: `${formatCurrency(wdAvg)}/transazione nei feriali vs ${formatCurrency(weAvg)} nel weekend`, accent: ACCENT.good,
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
      push({ icon: '🎯', category: 'habit', title: `${noDays} giorni senza spese questo mese`, detail: `Su ${elapsed} giorni · ${Math.round((noDays / elapsed) * 100)}% dei giorni "zero uscite"`, accent: ACCENT.good,
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
      push({ icon: '🔁', category: 'habit', title: `${count} pagament${count === 1 ? 'o' : 'i'} ricorrenti non taggati`, detail: 'Aprili e attiva "Ricorrente" per ricevere promemoria', accent: ACCENT.info,
        explain: { what: 'Spese con la stessa descrizione che ricompaiono ogni mese: probabili abbonamenti.', how: 'Raggruppo le uscite per descrizione e conto quante compaiono in ≥2 degli ultimi 3 mesi.', basis: 'Ultimi 3 mesi, spese non già marcate ricorrenti.' } }, 'medium');
    }
  }

  // ── 18. HABIT — Cash flow efficiency ─────────────────────────────────────
  if (h.avgIncome > 50 && h.avgExpense > 0) {
    const expRatio = Math.round((h.avgExpense / h.avgIncome) * 100);
    const chart: InsightChart = { labels: ['Uscite', 'Reddito'], values: [Math.round(h.avgExpense), Math.round(h.avgIncome)], format: 'currency' };
    if (expRatio <= 50) {
      push({ icon: '⚖️', category: 'habit', title: `Spendi il ${expRatio}% del reddito in uscite`, detail: `Ottima efficienza · rimane il ${100 - expRatio}% per risparmio e investimenti`, accent: ACCENT.good,
        explain: { what: 'Quota del reddito assorbita dalle spese correnti.', how: 'Media uscite mensili ÷ media entrate mensili.', basis: 'Ultimi 3 mesi con dati.', chart } });
    } else if (expRatio >= 85) {
      push({ icon: '⚖️', category: 'habit', title: `Le uscite assorbono il ${expRatio}% del reddito`, detail: `Poco margine rimasto per risparmiare o investire`, accent: ACCENT.warn,
        explain: { what: 'Le spese correnti mangiano gran parte di ciò che incassi.', how: 'Media uscite mensili ÷ media entrate mensili.', basis: 'Ultimi 3 mesi con dati.', chart } });
    }
  }

  // ── 19. HABIT — Income diversity ─────────────────────────────────────────
  {
    const incCats = new Set(transactions.filter(t => t.type === 'income' && t.date.startsWith(curMon)).map(t => t.category));
    if (incCats.size >= 3) {
      push({ icon: '💼', category: 'habit', title: `${incCats.size} fonti di entrata questo mese`, detail: `Entrate diversificate — buona resilienza finanziaria`, accent: ACCENT.good,
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
      push({ icon: c.icon, category: 'highlight', title: `${up ? '+' : '−'}${Math.abs(Math.round(bestDelta * 100))}% in ${c.label} vs mese scorso`, detail: `${formatCurrency(curCat[bestCat])} questo mese vs ${formatCurrency(prevCat[bestCat] ?? 0)} il mese scorso`, accent: up ? ACCENT.warn : ACCENT.good,
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
      push({ icon: c.icon, category: 'highlight', title: `Voce più pesante: ${c.label}`, detail: `${formatCurrency(topVal)} · ${pct(topVal, monthlyExpenses)}% delle uscite del mese`, accent: ACCENT.info,
        explain: { what: 'La categoria su cui hai speso di più questo mese.', how: 'Somma delle uscite per categoria nel mese corrente; viene scelta la maggiore.', basis: 'Mese corrente.', chart: { labels: top5.map(([id]) => getCat(id).label), values: top5.map(([, v]) => Math.round(v)), format: 'currency', highlightIndex: 0 } } }, 'medium');
    }
  }

  // ── 22. HIGHLIGHT — Anomalously large transaction ─────────────────────────
  {
    const curExp = transactions.filter(t => t.type === 'expense' && t.date.startsWith(curMon));
    if (curExp.length > 3) {
      const biggest = curExp.reduce((a, b) => ownShare(a) > ownShare(b) ? a : b);
      const bigAmt  = ownShare(biggest);
      const catHist = transactions.filter(t => t.type === 'expense' && t.category === biggest.category && !t.date.startsWith(curMon)).map(t => ownShare(t));
      if (catHist.length >= 3) {
        const catAvg = avg(catHist);
        if (bigAmt > catAvg * 2.5) {
          const c = getCat(biggest.category);
          push({ icon: '🔎', category: 'highlight', title: `Spesa insolita: ${formatCurrency(bigAmt)} in ${c.label}`, detail: `${biggest.description || c.label} · media tipica ${formatCurrency(catAvg)} per questa categoria`, accent: ACCENT.warn,
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
        push({ icon: '🗂️', category: 'highlight', title: `3 categorie = ${top3Pct}% delle spese`, detail: names, accent: ACCENT.info,
          explain: { what: 'Le tue spese sono concentrate in poche categorie.', how: 'Somma delle 3 categorie maggiori ÷ uscite totali del mese.', basis: 'Mese corrente.', chart: { labels: ['Top 3', 'Resto'], values: [Math.round(top3Sum), Math.round(monthlyExpenses - top3Sum)], format: 'currency', highlightIndex: 0 } } });
      }
    }
  }

  // ── 24. HIGHLIGHT — Spending pace vs historical average ──────────────────
  if (h.avgExpense > 0 && prog > 0.3) {
    const proj = projectExpenses(monthlyExpenses, now);
    const chart: InsightChart = { labels: spanLbl, values: span.map(m => Math.round(m.expense)), format: 'currency', refLine: Math.round(h.avgExpense), refLabel: 'media' };
    if (proj > h.avgExpense * 1.15) {
      push({ icon: '📊', category: 'highlight', title: `Spese in crescita rispetto alla media`, detail: `Proiezione ${formatCurrency(proj)} vs media ${formatCurrency(h.avgExpense)}/mese`, accent: ACCENT.warn,
        explain: { what: 'Il mese corrente, proiettato, supera la tua media di spesa.', how: `Uscite proiettate a fine mese (${formatCurrency(proj)}) vs media degli ultimi mesi.`, basis: 'Mese corrente + ultimi 3 mesi.', chart } });
    } else if (proj < h.avgExpense * 0.85) {
      push({ icon: '📊', category: 'highlight', title: `Spese sotto la tua media storica`, detail: `Proiezione ${formatCurrency(proj)} vs media ${formatCurrency(h.avgExpense)}/mese`, accent: ACCENT.good,
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
      push({ icon: '🧘', category: 'highlight', title: `Spese molto costanti`, detail: `Variazione mensile sotto il 12% — ottima prevedibilità`, accent: ACCENT.good,
        explain: { what: 'Le tue uscite mensili sono molto stabili, facili da pianificare.', how: 'Guardo quanto le uscite di ogni mese si discostano dalla media: qui restano molto vicine, quindi sono prevedibili.', basis: `Ultimi ${months6.length} mesi con dati.`, chart } });
    } else if (cv > 0.4) {
      push({ icon: '🌊', category: 'highlight', title: `Spese molto variabili`, detail: `Fluttuazione del ${Math.round(cv * 100)}% tra i mesi — difficile pianificare`, accent: ACCENT.info,
        explain: { what: 'Le uscite oscillano molto da un mese all\'altro.', how: 'Guardo quanto le uscite di ogni mese si discostano dalla media: qui variano parecchio, quindi sono difficili da prevedere.', basis: `Ultimi ${months6.length} mesi con dati.`, chart } });
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (out.length === 0) {
    push({ icon: '📊', category: 'highlight', title: 'Nessun insight ancora', detail: 'Aggiungi transazioni per analisi personalizzate', accent: ACCENT.neutral }, 'medium');
  }

  const catOrder: InsightCategory[] = ['alert', 'forecast', 'seasonal', 'trend', 'habit', 'highlight'];
  return [
    ...out.filter(i => i.urgent),
    ...out.filter(i => !i.urgent).sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category)),
  ];
}
