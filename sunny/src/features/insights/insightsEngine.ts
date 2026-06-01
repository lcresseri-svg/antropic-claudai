import { Transaction, RecurrenceRule, ownShare } from '../../types';
import { formatCurrency } from '../../utils';
import { monthProgress } from '../budget/budgetUtils';

export type InsightCategory = 'alert' | 'forecast' | 'trend' | 'habit' | 'highlight';

export interface Insight {
  icon: string;
  title: string;
  detail: string;
  accent: string;
  urgent?: boolean;
  category: InsightCategory;
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
  if (freq === 'weekly') d.setDate(d.getDate() + 7);
  else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
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
  return new Date(y, m - 1, d);
}

function isWeekend(dateStr: string): boolean {
  const d = localDate(dateStr).getDay();
  return d === 0 || d === 6;
}

// ── History & forecasting ─────────────────────────────────────────────────────

export interface History {
  avgIncome: number;
  avgExpense: number;
  avgInvest: number;
  months: number;
}

/**
 * Average monthly income / expense / investment over the last `windowN`
 * completed months (excludes current, partial month). Divides by active months
 * only, so sporadic logging isn't diluted.
 */
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

/** Project the current month's expenses from the elapsed-time run rate. */
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
  savingsRate: number; // NaN if income === 0
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

/** Returns stats for the last `n` completed months (offset 1..n), oldest→newest. */
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

// ── Engine ────────────────────────────────────────────────────────────────────

export interface InsightInput {
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  getCat: (id: string) => CatLite;
  now?: Date;
}

export function buildInsights(input: InsightInput): Insight[] {
  const { transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, getCat } = input;
  const now    = input.now ?? new Date();
  const today  = now.toISOString().slice(0, 10);
  const curMon = monthKey(0, now);
  const prog   = monthProgress(now);
  const out: Insight[] = [];

  const push = (i: Insight) => out.push(i);

  // ── Pre-compute common slices ─────────────────────────────────────────────

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

  const months6 = recentMonths(transactions, 6, now).filter(m => m.txCount > 0);
  const months3 = recentMonths(transactions, 3, now).filter(m => m.txCount > 0);
  const months12 = recentMonths(transactions, 12, now).filter(m => m.income > 0);

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
    const freqLabel = rule.freq === 'weekly' ? 'settimana' : rule.freq === 'monthly' ? 'mese' : 'anno';
    const dueLabel = days < 0
      ? `${Math.abs(days)} giorni fa (non ancora registrato)`
      : days === 0 ? 'oggi' : days === 1 ? 'domani' : `tra ${days} giorni`;
    push({
      icon: '📅', category: 'alert', urgent: days <= 2,
      title: `${t.description} — scade ${dueLabel}`,
      detail: `${formatCurrency(t.amount)} · ogni ${freqLabel}`,
      accent: days <= 2 ? ACCENT.warn : ACCENT.info,
    });
  }

  // ── 1. ALERT — Expenses outpacing income this month ───────────────────────

  const saved = monthlyIncome - monthlyExpenses - monthlyInvestments;
  if (monthlyIncome > 0 && saved < 0) {
    push({
      icon: '⚠️', category: 'alert', urgent: true,
      title: `Sforamento di ${formatCurrency(-saved)}`,
      detail: 'Le uscite superano le entrate questo mese',
      accent: ACCENT.warn,
    });
  }

  // ── 2. FORECAST — End-of-month projection ────────────────────────────────

  if (monthlyExpenses > 0 || monthlyIncome > 0) {
    const projExp    = projectExpenses(monthlyExpenses, now);
    const expInc     = h.avgIncome > 0 ? Math.max(h.avgIncome, monthlyIncome) : monthlyIncome;
    const expInv     = h.avgInvest > 0 ? Math.max(h.avgInvest, monthlyInvestments) : monthlyInvestments;
    const forecast   = Math.round(expInc - projExp - expInv);
    const basis      = h.months > 0 ? 'ritmo attuale e storico' : 'ritmo attuale';
    push(forecast >= 0
      ? { icon: '🔮', category: 'forecast', title: `Fine mese stimato: +${formatCurrency(forecast)}`, detail: `Risparmio proiettato su ${basis}`, accent: ACCENT.good }
      : { icon: '🔮', category: 'forecast', title: `Fine mese stimato: −${formatCurrency(-forecast)}`, detail: `Le uscite supererebbero le entrate su ${basis}`, accent: ACCENT.warn });
  }

  // ── 3. FORECAST — Savings so far ─────────────────────────────────────────

  if (monthlyIncome > 0 && saved >= 0) {
    push({
      icon: '✨', category: 'forecast',
      title: `Risparmiato finora: ${formatCurrency(saved)}`,
      detail: `${pct(saved, monthlyIncome)}% delle entrate di questo mese`,
      accent: ACCENT.good,
    });
  }

  // ── 4. FORECAST — Income vs historical average ────────────────────────────

  if (h.avgIncome > 0) {
    if (monthlyIncome >= h.avgIncome * 1.1) {
      push({ icon: '💰', category: 'forecast', title: `Entrate sopra la media (+${pct(monthlyIncome - h.avgIncome, h.avgIncome)}%)`, detail: `Di solito incassi ~${formatCurrency(h.avgIncome)}/mese`, accent: ACCENT.good });
    } else if (prog > 0.45 && monthlyIncome < h.avgIncome * 0.85) {
      push({ icon: '📥', category: 'forecast', title: `Entrate ancora sotto la media`, detail: `Finora ${formatCurrency(monthlyIncome)} vs ~${formatCurrency(h.avgIncome)} tipici`, accent: ACCENT.info });
    } else if (monthlyIncome === 0) {
      push({ icon: '📥', category: 'forecast', title: `Entrate previste: ~${formatCurrency(h.avgIncome)}`, detail: 'Stima sulla media degli ultimi mesi', accent: ACCENT.info });
    }
  }

  // ── 5. FORECAST — Investment pace ─────────────────────────────────────────

  if (h.avgInvest > 0 || monthlyInvestments > 0) {
    if (h.avgInvest > 0 && monthlyInvestments === 0 && prog > 0.5) {
      push({ icon: '📈', category: 'forecast', title: `Non hai ancora investito questo mese`, detail: `Di solito investi ~${formatCurrency(h.avgInvest)}/mese`, accent: ACCENT.gold });
    } else if (h.avgInvest > 0 && monthlyInvestments < h.avgInvest * 0.8 && prog > 0.5) {
      push({ icon: '📈', category: 'forecast', title: `Investimenti sotto la media`, detail: `${formatCurrency(monthlyInvestments)} vs ~${formatCurrency(h.avgInvest)} di solito`, accent: ACCENT.gold });
    } else if (monthlyInvestments > 0) {
      const ref = h.avgInvest > 0 ? h.avgInvest : monthlyInvestments;
      push({ icon: '📈', category: 'forecast', title: `Investiti ${formatCurrency(monthlyInvestments)} questo mese`, detail: `A questo ritmo ~${formatCurrency(ref * 12)}/anno`, accent: ACCENT.gold });
    }
  }

  // ── 6. TREND — Expense trajectory (6 months) ─────────────────────────────

  if (months6.length >= 3) {
    const slope    = linearSlope(months6.map(m => m.expense));
    const avgExp   = months6.reduce((s, m) => s + m.expense, 0) / months6.length;
    const relSlope = avgExp > 0 ? slope / avgExp : 0;
    if (relSlope > 0.06) {
      push({ icon: '📊', category: 'trend', title: `Spese in crescita costante`, detail: `+${Math.round(relSlope * 100)}% al mese negli ultimi ${months6.length} mesi`, accent: ACCENT.warn });
    } else if (relSlope < -0.06) {
      push({ icon: '📊', category: 'trend', title: `Stai riducendo le spese`, detail: `−${Math.round(Math.abs(relSlope) * 100)}% al mese negli ultimi ${months6.length} mesi`, accent: ACCENT.good });
    }
  }

  // ── 7. TREND — Savings rate trajectory ───────────────────────────────────

  const withIncome = months6.filter(m => m.income > 0);
  if (withIncome.length >= 3) {
    const rateSlope = linearSlope(withIncome.map(m => m.savingsRate));
    if (rateSlope > 0.02) {
      const curRate = withIncome[withIncome.length - 1]?.savingsRate ?? 0;
      push({ icon: '🚀', category: 'trend', title: `Tasso di risparmio in crescita`, detail: `Ora al ${Math.round(curRate * 100)}% · la tendenza è positiva`, accent: ACCENT.good });
    } else if (rateSlope < -0.03) {
      push({ icon: '📉', category: 'trend', title: `Tasso di risparmio in calo`, detail: `La quota risparmiata sul reddito sta diminuendo`, accent: ACCENT.warn });
    }
  }

  // ── 8. TREND — Investment rate ────────────────────────────────────────────

  if (h6.avgIncome > 0 && h6.avgInvest > 0) {
    const investRate = Math.round((h6.avgInvest / h6.avgIncome) * 100);
    if (investRate >= 15) {
      push({ icon: '💎', category: 'trend', title: `Stai investendo il ${investRate}% del reddito`, detail: `Ottimo ritmo — proietti ${formatCurrency(h6.avgInvest * 12)} investiti all'anno`, accent: ACCENT.gold });
    } else {
      push({ icon: '📈', category: 'trend', title: `Investi il ${investRate}% del reddito`, detail: `A questo ritmo ${formatCurrency(h6.avgInvest * 12)}/anno · la soglia consigliata è 15%`, accent: ACCENT.info });
    }
  }

  // ── 9. TREND — Annual projection ─────────────────────────────────────────

  if (h.months >= 2 && h.avgIncome > 0) {
    const yrSav = Math.round((h.avgIncome - h.avgExpense - h.avgInvest) * 12);
    const yrInv = Math.round(h.avgInvest * 12);
    push({
      icon: '🗓️', category: 'trend',
      title: `Proiezione annuale: ${yrSav >= 0 ? '+' : '−'}${formatCurrency(Math.abs(yrSav))} risparmiati`,
      detail: `+ ${formatCurrency(yrInv)} investiti · totale ${formatCurrency(Math.abs(yrSav) + yrInv)}`,
      accent: yrSav >= 0 ? ACCENT.good : ACCENT.warn,
    });
  }

  // ── 10. TREND — Category growing fastest over 3 months ───────────────────

  if (months3.length >= 2) {
    const catSeries: Record<string, number[]> = {};
    for (const ms of months3) {
      const spend = catSpend(ms.key);
      for (const [cat, val] of Object.entries(spend))
        (catSeries[cat] ??= []).push(val);
    }
    let fastCat = '', fastSlope = 0;
    for (const [cat, vals] of Object.entries(catSeries)) {
      if (vals.length < 2 || vals[0] < 20) continue;
      const rel = linearSlope(vals) / vals[0];
      if (rel > fastSlope) { fastSlope = rel; fastCat = cat; }
    }
    if (fastCat && fastSlope > 0.15) {
      const c = getCat(fastCat);
      const avg = catSeries[fastCat]!.reduce((a, b) => a + b, 0) / catSeries[fastCat]!.length;
      push({ icon: c.icon, category: 'trend', title: `${c.label} in forte crescita`, detail: `Media mensile ${formatCurrency(avg)} · +${Math.round(fastSlope * 100)}% mese su mese`, accent: ACCENT.warn });
    }
  }

  // ── 11. TREND — Best month in the past year ──────────────────────────────

  if (months12.length >= 3) {
    const best = months12.reduce((a, b) => a.savings > b.savings ? a : b);
    if (best.savings > 0) {
      const label = localDate(best.key + '-01').toLocaleString('it-IT', { month: 'long' });
      push({ icon: '🏆', category: 'trend', title: `Miglior mese: ${label} (${formatCurrency(best.savings)})`, detail: `Il tuo record di risparmio nell'ultimo anno`, accent: ACCENT.good });
    }
  }

  // ── 12. HABIT — Weekend vs weekday spending ───────────────────────────────

  {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - 3);
    const recent = transactions.filter(t => t.type === 'expense' && localDate(t.date) >= cutoff);
    let wdSum = 0, wdN = 0, weSum = 0, weN = 0;
    for (const t of recent) {
      if (isWeekend(t.date)) { weSum += ownShare(t); weN++; }
      else                   { wdSum += ownShare(t); wdN++; }
    }
    if (wdN >= 5 && weN >= 5) {
      const ratio = (weSum / weN) / (wdSum / wdN);
      if (ratio > 1.35) {
        push({ icon: '🗓️', category: 'habit', title: `Spendi il ${Math.round((ratio - 1) * 100)}% in più nel weekend`, detail: `Media: ${formatCurrency(weSum / weN)}/transazione (weekend) vs ${formatCurrency(wdSum / wdN)} (feriali)`, accent: ACCENT.info });
      } else if (ratio < 0.72) {
        push({ icon: '🗓️', category: 'habit', title: `Più disciplinato nel weekend`, detail: `${formatCurrency(wdSum / wdN)}/transazione nei feriali vs ${formatCurrency(weSum / weN)} nel weekend`, accent: ACCENT.good });
      }
    }
  }

  // ── 13. HABIT — No-spend days this month ─────────────────────────────────

  {
    const spendDays = new Set(
      transactions.filter(t => t.type === 'expense' && t.date.startsWith(curMon)).map(t => t.date)
    );
    const elapsed = Math.floor(prog * daysInMonth(now));
    const noDays  = elapsed - spendDays.size;
    if (elapsed >= 7 && spendDays.size > 0 && noDays >= 3) {
      push({
        icon: '🎯', category: 'habit',
        title: `${noDays} giorni senza spese questo mese`,
        detail: `Su ${elapsed} giorni · ${Math.round((noDays / elapsed) * 100)}% dei giorni "zero uscite"`,
        accent: ACCENT.good,
      });
    }
  }

  // ── 14. HABIT — Auto-detected recurring (untagged) ───────────────────────

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
      push({ icon: '🔁', category: 'habit', title: `${count} pagament${count === 1 ? 'o' : 'i'} ricorrenti non taggati`, detail: 'Aprili e attiva "Ricorrente" per ricevere promemoria', accent: ACCENT.info });
    }
  }

  // ── 15. HABIT — Cash flow efficiency ─────────────────────────────────────

  if (h.avgIncome > 50 && h.avgExpense > 0) {
    const expRatio = Math.round((h.avgExpense / h.avgIncome) * 100);
    if (expRatio <= 50) {
      push({ icon: '⚖️', category: 'habit', title: `Spendi il ${expRatio}% del reddito in uscite`, detail: `Ottima efficienza · rimane il ${100 - expRatio}% per risparmio e investimenti`, accent: ACCENT.good });
    } else if (expRatio >= 85) {
      push({ icon: '⚖️', category: 'habit', title: `Le uscite assorbono il ${expRatio}% del reddito`, detail: `Poco margine rimasto per risparmiare o investire`, accent: ACCENT.warn });
    }
  }

  // ── 16. HABIT — Income diversity ─────────────────────────────────────────

  {
    const incCats = new Set(
      transactions.filter(t => t.type === 'income' && t.date.startsWith(curMon)).map(t => t.category)
    );
    if (incCats.size >= 3) {
      push({ icon: '💼', category: 'habit', title: `${incCats.size} fonti di entrata questo mese`, detail: `Entrate diversificate — buona resilienza finanziaria`, accent: ACCENT.good });
    }
  }

  // ── 17. HIGHLIGHT — Biggest category change vs last month ─────────────────

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
      push({
        icon: c.icon, category: 'highlight',
        title: `${up ? '+' : '−'}${Math.abs(Math.round(bestDelta * 100))}% in ${c.label} vs mese scorso`,
        detail: `${formatCurrency(curCat[bestCat])} questo mese vs ${formatCurrency(prevCat[bestCat] ?? 0)} il mese scorso`,
        accent: up ? ACCENT.warn : ACCENT.good,
      });
    }
  }

  // ── 18. HIGHLIGHT — Heaviest category this month ─────────────────────────

  {
    let topCat = '', topVal = 0;
    for (const [cat, val] of Object.entries(curCat))
      if (val > topVal) { topVal = val; topCat = cat; }
    if (topCat && monthlyExpenses > 0) {
      const c = getCat(topCat);
      push({ icon: c.icon, category: 'highlight', title: `Voce più pesante: ${c.label}`, detail: `${formatCurrency(topVal)} · ${pct(topVal, monthlyExpenses)}% delle uscite del mese`, accent: ACCENT.info });
    }
  }

  // ── 19. HIGHLIGHT — Anomalously large transaction ─────────────────────────

  {
    const curExp = transactions.filter(t => t.type === 'expense' && t.date.startsWith(curMon));
    if (curExp.length > 3) {
      const biggest   = curExp.reduce((a, b) => ownShare(a) > ownShare(b) ? a : b);
      const bigAmt    = ownShare(biggest);
      const catHistory = transactions
        .filter(t => t.type === 'expense' && t.category === biggest.category && !t.date.startsWith(curMon))
        .map(t => ownShare(t));
      if (catHistory.length >= 3) {
        const catAvg = catHistory.reduce((a, b) => a + b, 0) / catHistory.length;
        if (bigAmt > catAvg * 2.5) {
          const c = getCat(biggest.category);
          push({ icon: '🔎', category: 'highlight', title: `Spesa insolita: ${formatCurrency(bigAmt)} in ${c.label}`, detail: `${biggest.description || c.label} · media tipica ${formatCurrency(catAvg)} per questa categoria`, accent: ACCENT.warn });
        }
      }
    }
  }

  // ── 20. HIGHLIGHT — Pareto (top-3 categories = X% of spending) ───────────

  {
    const catEntries = Object.entries(curCat).sort((a, b) => b[1] - a[1]);
    if (catEntries.length >= 4 && monthlyExpenses > 100) {
      const top3Sum = catEntries.slice(0, 3).reduce((s, [, v]) => s + v, 0);
      const top3Pct = pct(top3Sum, monthlyExpenses);
      if (top3Pct >= 70) {
        const names = catEntries.slice(0, 3).map(([id]) => getCat(id).label).join(', ');
        push({ icon: '🗂️', category: 'highlight', title: `3 categorie = ${top3Pct}% delle spese`, detail: names, accent: ACCENT.info });
      }
    }
  }

  // ── 21. HIGHLIGHT — Spending pace vs historical average ──────────────────

  if (h.avgExpense > 0 && prog > 0.3) {
    const proj = projectExpenses(monthlyExpenses, now);
    if (proj > h.avgExpense * 1.15) {
      push({ icon: '📊', category: 'highlight', title: `Spese in crescita rispetto alla media`, detail: `Proiezione ${formatCurrency(proj)} vs media ${formatCurrency(h.avgExpense)}/mese`, accent: ACCENT.warn });
    } else if (proj < h.avgExpense * 0.85) {
      push({ icon: '📊', category: 'highlight', title: `Spese sotto la tua media storica`, detail: `Proiezione ${formatCurrency(proj)} vs media ${formatCurrency(h.avgExpense)}/mese`, accent: ACCENT.good });
    }
  }

  // ── 22. HIGHLIGHT — Monthly expense consistency (volatility) ─────────────

  if (months6.length >= 4) {
    const exps = months6.map(m => m.expense);
    const mean = exps.reduce((a, b) => a + b, 0) / exps.length;
    const stddev = Math.sqrt(exps.reduce((s, v) => s + (v - mean) ** 2, 0) / exps.length);
    const cv = mean > 0 ? stddev / mean : 0;
    if (cv < 0.12) {
      push({ icon: '🧘', category: 'highlight', title: `Spese molto costanti`, detail: `Variazione mensile sotto il 12% — ottima prevedibilità`, accent: ACCENT.good });
    } else if (cv > 0.4) {
      push({ icon: '🌊', category: 'highlight', title: `Spese molto variabili`, detail: `Fluttuazione del ${Math.round(cv * 100)}% tra i mesi — difficile pianificare`, accent: ACCENT.info });
    }
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  if (out.length === 0) {
    out.push({ icon: '📊', category: 'highlight', title: 'Nessun insight ancora', detail: 'Aggiungi transazioni per analisi personalizzate', accent: ACCENT.neutral });
  }

  // Urgent first, then by category order, then by generator order
  const catOrder: InsightCategory[] = ['alert', 'forecast', 'trend', 'habit', 'highlight'];
  return [
    ...out.filter(i => i.urgent),
    ...out.filter(i => !i.urgent).sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category)),
  ];
}
