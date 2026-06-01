import { Transaction, RecurrenceRule, ownShare } from '../../types';
import { formatCurrency } from '../../utils';
import { monthProgress } from '../budget/budgetUtils';

export interface Insight {
  icon: string;
  title: string;
  detail: string;
  accent: string;
  urgent?: boolean;
}

type CatLite = { icon: string; label: string };

const ACCENT = {
  good: '#8A9270',
  warn: '#E08B8B',
  info: '#88B0C0',
  gold: '#E6B95C',
  neutral: '#8B8B8B',
};

// ── Date helpers ─────────────────────────────────────────────────────────────

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
  const target = new Date(dateStr);
  return Math.round((target.getTime() - a.getTime()) / 86400000);
}

// ── History & forecasting ────────────────────────────────────────────────────

export interface History {
  avgIncome: number;
  avgExpense: number;
  avgInvest: number;
  months: number; // number of distinct months with data in the window
}

/**
 * Average monthly income / expense / investment over the last `windowN`
 * completed months (excludes the current, partial month). Divides by the
 * number of months that actually have data, so sporadic logging is not
 * diluted by empty months.
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
    if (t.type === 'income') inc += t.amount;
    else if (t.type === 'expense') exp += ownShare(t);
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

// ── Engine ───────────────────────────────────────────────────────────────────

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
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const out: Insight[] = [];

  const h = history(transactions, 3, now);
  const progress = monthProgress(now);

  // 0 — Upcoming recurring transactions (highest priority) ─────────────────────
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
    out.push({
      icon: '📅',
      title: `${t.description} — scade ${dueLabel}`,
      detail: `${formatCurrency(t.amount)} · ogni ${freqLabel}`,
      accent: days <= 2 ? ACCENT.warn : ACCENT.info,
      urgent: days <= 2,
    });
  }

  // 1 — End-of-month cash forecast (run-rate + historical income) ──────────────
  if (monthlyExpenses > 0 || monthlyIncome > 0) {
    const projExpenses = projectExpenses(monthlyExpenses, now);
    const expectedIncome = h.avgIncome > 0 ? Math.max(h.avgIncome, monthlyIncome) : monthlyIncome;
    const expectedInvest = h.avgInvest > 0 ? Math.max(h.avgInvest, monthlyInvestments) : monthlyInvestments;
    const forecast = Math.round(expectedIncome - projExpenses - expectedInvest);
    const basis = h.months > 0 ? 'ritmo attuale e media storica' : 'ritmo di spesa attuale';
    out.push(forecast >= 0
      ? { icon: '🔮', title: `Fine mese previsto: +${formatCurrency(forecast)}`, detail: `Risparmio stimato su ${basis}`, accent: ACCENT.good }
      : { icon: '🔮', title: `Fine mese previsto: −${formatCurrency(-forecast)}`, detail: `Le uscite supererebbero le entrate su ${basis}`, accent: ACCENT.warn });
  }

  // 2 — Savings this month + rate ──────────────────────────────────────────────
  const saved = monthlyIncome - monthlyExpenses - monthlyInvestments;
  if (monthlyIncome > 0) {
    out.push(saved >= 0
      ? { icon: '✨', title: `Risparmiato finora: ${formatCurrency(saved)}`, detail: `${pct(saved, monthlyIncome)}% delle entrate di questo mese`, accent: ACCENT.good }
      : { icon: '⚠️', title: `Sforamento di ${formatCurrency(-saved)}`, detail: 'Le uscite superano le entrate questo mese', accent: ACCENT.warn });
  }

  // 3 — Income forecast vs history ─────────────────────────────────────────────
  if (h.avgIncome > 0) {
    if (monthlyIncome >= h.avgIncome * 1.1) {
      out.push({ icon: '💰', title: `Entrate sopra la media (+${pct(monthlyIncome - h.avgIncome, h.avgIncome)}%)`, detail: `Di solito incassi ~${formatCurrency(h.avgIncome)} al mese`, accent: ACCENT.good });
    } else if (progress > 0.45 && monthlyIncome < h.avgIncome * 0.85) {
      const gap = Math.round(h.avgIncome - monthlyIncome);
      out.push({ icon: '📥', title: `Entrate previste: ancora ~${formatCurrency(gap)}`, detail: `Media storica ~${formatCurrency(h.avgIncome)}/mese · finora ${formatCurrency(monthlyIncome)}`, accent: ACCENT.info });
    } else if (monthlyIncome === 0) {
      out.push({ icon: '📥', title: `Entrate previste questo mese: ~${formatCurrency(h.avgIncome)}`, detail: 'Stima sulla media degli ultimi mesi', accent: ACCENT.info });
    }
  }

  // 4 — Investment pace & yearly projection vs history ─────────────────────────
  if (h.avgInvest > 0 || monthlyInvestments > 0) {
    if (h.avgInvest > 0 && monthlyInvestments === 0 && progress > 0.5) {
      out.push({ icon: '📈', title: `Non hai ancora investito questo mese`, detail: `Di solito investi ~${formatCurrency(h.avgInvest)} · proietta ${formatCurrency(h.avgInvest * 12)}/anno`, accent: ACCENT.gold });
    } else if (h.avgInvest > 0 && monthlyInvestments < h.avgInvest * 0.8 && progress > 0.5) {
      out.push({ icon: '📈', title: `Investimenti sotto la media`, detail: `${formatCurrency(monthlyInvestments)} vs ~${formatCurrency(h.avgInvest)} abituali`, accent: ACCENT.gold });
    } else if (monthlyInvestments > 0) {
      const ref = h.avgInvest > 0 ? h.avgInvest : monthlyInvestments;
      out.push({ icon: '📈', title: `Investiti ${formatCurrency(monthlyInvestments)} questo mese`, detail: `A questo ritmo ~${formatCurrency(ref * 12)} all'anno`, accent: ACCENT.gold });
    }
  }

  // 5 — Biggest category change vs last month ──────────────────────────────────
  const byCatMonth = (m: string) => {
    const r: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === 'expense' && t.date.startsWith(m)) r[t.category] = (r[t.category] ?? 0) + ownShare(t);
    }
    return r;
  };
  const cur = byCatMonth(monthKey(0, now)), prevM = byCatMonth(monthKey(1, now));
  let bestCat = '', bestDelta = 0;
  for (const cat of Object.keys(cur)) {
    const p = prevM[cat] ?? 0;
    if (p < 10) continue;
    const delta = (cur[cat] - p) / p;
    if (Math.abs(delta) > Math.abs(bestDelta)) { bestDelta = delta; bestCat = cat; }
  }
  if (bestCat && Math.abs(bestDelta) >= 0.12) {
    const up = bestDelta > 0;
    const c = getCat(bestCat);
    out.push({
      icon: c.icon,
      title: `${up ? '+' : '−'}${Math.abs(Math.round(bestDelta * 100))}% in ${c.label}`,
      detail: `${up ? 'Hai speso più' : 'Hai speso meno'} rispetto al mese scorso`,
      accent: up ? ACCENT.warn : ACCENT.good,
    });
  }

  // 6 — Heaviest spending category this month ──────────────────────────────────
  let topCat = '', topVal = 0;
  for (const [cat, val] of Object.entries(cur)) {
    if (val > topVal) { topVal = val; topCat = cat; }
  }
  if (topCat && monthlyExpenses > 0) {
    const c = getCat(topCat);
    out.push({
      icon: c.icon,
      title: `Voce più pesante: ${c.label}`,
      detail: `${formatCurrency(topVal)} · ${pct(topVal, monthlyExpenses)}% delle uscite del mese`,
      accent: ACCENT.info,
    });
  }

  // 7 — Expenses vs 3-month average ────────────────────────────────────────────
  if (h.avgExpense > 0 && progress > 0.3) {
    const proj = projectExpenses(monthlyExpenses, now);
    if (proj > h.avgExpense * 1.15) {
      out.push({ icon: '📊', title: `Spese in crescita questo mese`, detail: `Proiezione ${formatCurrency(proj)} vs media ${formatCurrency(h.avgExpense)}`, accent: ACCENT.warn });
    } else if (proj < h.avgExpense * 0.85) {
      out.push({ icon: '📊', title: `Spese sotto la tua media`, detail: `Proiezione ${formatCurrency(proj)} vs media ${formatCurrency(h.avgExpense)}`, accent: ACCENT.good });
    }
  }

  // 8 — Auto-detected recurring (no tag) ───────────────────────────────────────
  const norm = (s: string) => s.toLowerCase().trim();
  const recentMonths = [monthKey(0, now), monthKey(1, now), monthKey(2, now)];
  const seen: Record<string, Set<string>> = {};
  for (const t of transactions) {
    if (t.type !== 'expense' || t.recurring) continue;
    const m = t.date.slice(0, 7);
    if (!recentMonths.includes(m)) continue;
    (seen[norm(t.description)] ??= new Set()).add(m);
  }
  const autoRecurring = Object.values(seen).filter(s => s.size >= 2).length;
  if (autoRecurring > 0) {
    out.push({
      icon: '🔁',
      title: `${autoRecurring} pagament${autoRecurring === 1 ? 'o' : 'i'} ricorrent${autoRecurring === 1 ? 'e' : 'i'} rilevat${autoRecurring === 1 ? 'o' : 'i'}`,
      detail: 'Taggali come "Ricorrente" per ricevere promemoria',
      accent: ACCENT.info,
    });
  }

  if (out.length === 0) {
    out.push({ icon: '📊', title: 'Nessun insight ancora', detail: 'Aggiungi transazioni per analisi personalizzate', accent: ACCENT.neutral });
  }

  // Urgent first, preserve generator order otherwise
  return [...out.filter(i => i.urgent), ...out.filter(i => !i.urgent)];
}
