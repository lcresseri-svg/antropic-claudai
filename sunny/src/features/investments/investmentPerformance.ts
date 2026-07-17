/**
 * Performance di una posizione d'investimento — PURE logic (no React/Firestore).
 *
 * Ricostruisce i flussi REALI di una categoria investimento e ne deriva i KPI
 * del dettaglio. Regole comuni a TUTTE le metriche di questo modulo:
 *
 *  - importi reali (mai le quote di statsSpreadMonths);
 *  - esclusi i movimenti futuri (date > oggi) e i template ricorrenti /
 *    proiezioni — contano solo le occorrenze effettive;
 *  - TFR e apporti senza conto contano PER INTERO come capitale versato
 *    (la loro esclusione vale solo per il cash flow, non per la performance);
 *  - data di partenza = subscriptionDate, con FALLBACK al primo movimento
 *    effettivo quando manca;
 *  - anni = giorni / 365,2425 (anno civile medio);
 *  - con dati non validi le metriche valgono null (UI: "—" con spiegazione,
 *    mai 0 inventato).
 *
 * KPI "Media annua semplice" (NON usa XIRR):
 *    versato          = initialBalance + Σ versamenti effettivi (TFR/apporti inclusi)
 *    prelevato        = Σ incassi dai disinvestimenti
 *    guadagnoTotale   = currentValue + prelevato − versato
 *    €/anno           = guadagnoTotale / anni
 *    %/anno           = (guadagnoTotale / versato) / anni
 *
 * "Rendimento annualizzato (XIRR)" resta una statistica avanzata (money-
 * weighted, bisezione robusta + rifinitura Newton) e non sostituisce il KPI.
 *
 * Convenzioni sui dati esistenti (investmentTransactionBuilder):
 *  - deposito: investment direction 'in' (amount = intero versamento);
 *  - disinvestimento: la gamba 'out' porta amount = capitaleRimborsato e
 *    valueDelta = −cash incassato → l'INCASSO reale è |valueDelta| (fallback
 *    amount per dati legacy). Plus/minusvalenze restano nelle loro transazioni
 *    income/expense collegate via groupId — MAI ricontate qui;
 *  - commissioni: expense "Commissione…" con lo stesso groupId del movimento.
 */
import { Transaction, CategoryDef } from '../../types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 86_400_000;
/** Average Gregorian year (365,2425 days) — shared by duration, simple average and XIRR. */
const YEAR_DAYS = 365.2425;

/** Minimum position age for annualized figures (below → null, "—"). */
export const MIN_YEARS_FOR_ANNUALIZED = 30 / YEAR_DAYS;

export interface CashFlow { date: string; amount: number }

// ── XIRR (money-weighted return) ──────────────────────────────────────────────

function toTime(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Net present value of dated flows at annual `rate` (Actual/365.2425). */
export function xnpv(rate: number, flows: CashFlow[]): number {
  const t0 = toTime(flows[0].date);
  let s = 0;
  for (const f of flows) {
    const years = (toTime(f.date) - t0) / DAY_MS / YEAR_DAYS;
    s += f.amount / Math.pow(1 + rate, years);
  }
  return s;
}

/**
 * XIRR: the annual rate that zeroes the NPV of the dated flows.
 * Robust bracketing + bisection (with a final Newton polish): no dependence on
 * a lucky initial guess, deterministic for the test-suite. Returns null when
 * the input is degenerate (fewer than 2 flows, no sign change, no bracket in
 * (−99.9%, +1000%], or a zero-length timeline).
 */
export function xirr(flowsIn: CashFlow[]): number | null {
  const flows = flowsIn
    .filter(f => Number.isFinite(f.amount) && f.amount !== 0 && !!f.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (flows.length < 2) return null;
  const hasPos = flows.some(f => f.amount > 0);
  const hasNeg = flows.some(f => f.amount < 0);
  if (!hasPos || !hasNeg) return null;
  if (flows[0].date === flows[flows.length - 1].date) return null;

  const f = (r: number) => xnpv(r, flows);

  // Bracket the root: scan a fixed grid from −99.9% to +1000%.
  const GRID = [-0.999, -0.9, -0.75, -0.5, -0.25, -0.1, 0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1, 2, 5, 10];
  let lo = NaN, hi = NaN;
  let prevR = GRID[0];
  let prevV = f(prevR);
  for (let i = 1; i < GRID.length; i++) {
    const r = GRID[i];
    const v = f(r);
    if (Number.isFinite(prevV) && Number.isFinite(v) && prevV * v <= 0) { lo = prevR; hi = r; break; }
    prevR = r; prevV = v;
  }
  if (!Number.isFinite(lo)) return null;

  // Bisection to convergence.
  let flo = f(lo);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (!Number.isFinite(fmid)) return null;
    if (Math.abs(fmid) < 1e-9 || (hi - lo) < 1e-10) { lo = hi = mid; break; }
    if (flo * fmid <= 0) { hi = mid; } else { lo = mid; flo = fmid; }
  }
  const root = (lo + hi) / 2;

  // Newton polish (one/two steps) for extra precision — guarded to the bracket.
  let x = root;
  for (let i = 0; i < 3; i++) {
    const fx = f(x);
    const h = 1e-7;
    const d = (f(x + h) - fx) / h;
    if (!Number.isFinite(d) || d === 0) break;
    const nx = x - fx / d;
    if (!Number.isFinite(nx) || nx <= -0.999 || nx > 10) break;
    x = nx;
  }
  return Number.isFinite(x) ? x : null;
}

// ── Position reconstruction ───────────────────────────────────────────────────

/** Cash actually received by a withdrawal 'out' leg: |valueDelta| when present
 *  (it carries −cash by construction), else the leg's amount (legacy). */
export function withdrawalProceeds(t: Transaction): number {
  const vd = Number(t.valueDelta);
  if (t.valueDelta != null && Number.isFinite(vd)) return r2(Math.abs(vd));
  return r2(t.amount);
}

export interface PositionMovements {
  /** Investment flows of the category, date ascending. */
  flows: Transaction[];
  deposits: Transaction[];
  withdrawals: Transaction[];
  /** Linked commission expenses (groupId of a flow + description Commissione…). */
  fees: Transaction[];
  /** Linked realized gain/loss legs (system categories, groupId of a flow). */
  realizedGain: number;   // Σ plusvalenze − Σ minusvalenze
}

/**
 * Collect the movements of an investment category + linked legs. Templates and
 * projected rows are always excluded; pass `todayISO` to also exclude FUTURE
 * movements (realized-only view — what every performance metric uses).
 */
export function collectPositionMovements(
  transactions: Transaction[],
  categoryId: string,
  todayISO?: string,
): PositionMovements {
  const realized = (t: Transaction) => !todayISO || t.date <= todayISO;
  const flows = transactions
    .filter(t => t.type === 'investment' && t.category === categoryId && !t.projected && !t.recurring && realized(t))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
  const groupIds = new Set(flows.map(t => t.groupId).filter((g): g is string => !!g));
  const fees: Transaction[] = [];
  let realizedGain = 0;
  for (const t of transactions) {
    if (t.projected || t.recurring || !t.groupId || !groupIds.has(t.groupId) || !realized(t)) continue;
    if (t.type === 'expense' && t.category === '__minusvalenza__') realizedGain -= t.amount;
    else if (t.type === 'income' && t.category === '__plusvalenza__') realizedGain += t.amount;
    else if (t.type === 'expense' && t.description.startsWith('Commissione')) fees.push(t);
  }
  return {
    flows,
    deposits: flows.filter(t => t.direction !== 'out'),
    withdrawals: flows.filter(t => t.direction === 'out'),
    fees,
    realizedGain: r2(realizedGain),
  };
}

// ── Performance summary ───────────────────────────────────────────────────────

/** Why a metric is unavailable (UI shows "—" + this explanation). */
export type MetricUnavailableReason =
  | 'no-current-value'      // serve il controvalore
  | 'no-start-date'         // né subscriptionDate né movimenti effettivi
  | 'no-capital'            // capitale versato non valido (≤ 0)
  | 'insufficient-duration' // posizione troppo giovane per annualizzare
  | 'insufficient-data';    // solver XIRR senza soluzione affidabile

export interface PositionPerformance {
  /** Capitale conferito totale: initialBalance + versamenti effettivi (TFR e apporti inclusi). */
  contributed: number;
  grossDeposits: number;
  depositCount: number;
  /** Capitale rimborsato (gambe 'out'). */
  capitalReturned: number;
  /** Incassi reali dai disinvestimenti (|valueDelta| per gamba). */
  proceeds: number;
  /** Capitale investito netto = initialBalance + depositi − capitale rimborsato. */
  netCapital: number;
  fees: number;
  /** Guadagno realizzato (plusvalenze − minusvalenze registrate). */
  realizedGain: number;
  /** Guadagno latente = controvalore − capitale netto (null senza controvalore). */
  latentGain: number | null;
  /** Guadagno totale (KPI) = controvalore + incassi − conferito − commissioni (null senza controvalore). */
  totalGain: number | null;
  /** totalGain / conferito (null senza dati). */
  totalGainPct: number | null;
  /** Data di partenza: subscriptionDate, fallback primo movimento effettivo. */
  startDate: string | null;
  /** Durata in anni (giorni / 365,2425) da startDate alla data di valutazione. */
  years: number | null;
  /** MEDIA ANNUA SEMPLICE — guadagno = controvalore + prelevato − versato
   *  (commissioni escluse per definizione), NON usa XIRR. */
  simpleAnnualGain: number | null;      // €/anno = guadagno / anni
  simpleAnnualGainPct: number | null;   // frazione/anno = (guadagno / versato) / anni
  simpleUnavailableReason: MetricUnavailableReason | null;
  /** Rendimento annualizzato money-weighted (XIRR) — statistica avanzata. */
  annualizedReturn: number | null;
  annualizedUnavailableReason: MetricUnavailableReason | null;
  /** TFR totale (tfrAmount pre-Sunny + quote tfr dei versamenti). */
  tfrTotal: number;
}

export interface PerformanceInput {
  category: CategoryDef;
  transactions: Transaction[];  // ALL transactions (the collector filters)
  /** Data di valutazione: il controvalore corrente è considerato a questa data. */
  todayISO: string;
}

export function buildPositionPerformance({ category, transactions, todayISO }: PerformanceInput): PositionPerformance {
  // Realized-only: future movements and recurring templates never count here.
  const m = collectPositionMovements(transactions, category.id, todayISO);
  const initial = category.initialBalance ?? 0;
  const grossDeposits = r2(m.deposits.reduce((s, t) => s + t.amount, 0));
  const capitalReturned = r2(m.withdrawals.reduce((s, t) => s + t.amount, 0));
  const proceeds = r2(m.withdrawals.reduce((s, t) => s + withdrawalProceeds(t), 0));
  const fees = r2(m.fees.reduce((s, t) => s + t.amount, 0));
  const contributed = r2(initial + grossDeposits);
  const netCapital = r2(initial + grossDeposits - capitalReturned);
  const currentValue = category.currentValue ?? null;

  const tfrTotal = r2((category.tfrAmount ?? 0) + m.deposits.reduce((s, t) => s + (t.tfr ?? 0), 0));

  // Start of the position: subscriptionDate anchors initialBalance; FALLBACK to
  // the first effective movement when the date is missing (same rule for the
  // simple average AND the XIRR).
  const firstOp = m.flows[0]?.date ?? null;
  const startDate = category.subscriptionDate ?? firstOp;
  const years = startDate && startDate <= todayISO
    ? (toTime(todayISO) - toTime(startDate)) / DAY_MS / YEAR_DAYS
    : null;

  const totalGain = currentValue != null
    ? r2(currentValue + proceeds - contributed - fees)
    : null;
  const totalGainPct = totalGain != null && contributed > 0 ? totalGain / contributed : null;
  const latentGain = currentValue != null ? r2(currentValue - netCapital) : null;

  // ── Media annua semplice (NO XIRR) ──────────────────────────────────────────
  //   versato = initialBalance + versamenti effettivi (TFR/apporti inclusi)
  //   guadagno = controvalore + prelevato − versato
  let simpleAnnualGain: number | null = null;
  let simpleAnnualGainPct: number | null = null;
  let simpleReason: MetricUnavailableReason | null = null;
  if (currentValue == null) simpleReason = 'no-current-value';
  else if (!startDate) simpleReason = 'no-start-date';
  else if (!(contributed > 0)) simpleReason = 'no-capital';
  else if (years == null || years < MIN_YEARS_FOR_ANNUALIZED) simpleReason = 'insufficient-duration';
  else {
    const simpleGain = currentValue + proceeds - contributed;
    simpleAnnualGain = r2(simpleGain / years);
    simpleAnnualGainPct = (simpleGain / contributed) / years;
  }

  // ── XIRR (statistica avanzata) — stesse basi: flussi reali, TFR/apporti
  //    inclusi, initialBalance ancorato a startDate (fallback compreso) ───────
  let annualizedReturn: number | null = null;
  let xirrReason: MetricUnavailableReason | null = null;
  if (currentValue == null) {
    xirrReason = 'no-current-value';
  } else if (!startDate) {
    xirrReason = 'no-start-date';
  } else if (years == null || years < MIN_YEARS_FOR_ANNUALIZED) {
    xirrReason = 'insufficient-duration';
  } else {
    const flows: CashFlow[] = [];
    if (initial > 0) flows.push({ date: startDate, amount: -initial });
    for (const d of m.deposits) flows.push({ date: d.date, amount: -d.amount });
    for (const w of m.withdrawals) flows.push({ date: w.date, amount: withdrawalProceeds(w) });
    for (const f of m.fees) flows.push({ date: f.date, amount: -f.amount });
    if (currentValue > 0) flows.push({ date: todayISO, amount: currentValue });
    annualizedReturn = xirr(flows);
    if (annualizedReturn == null) xirrReason = 'insufficient-data';
  }

  return {
    contributed, grossDeposits, depositCount: m.deposits.length,
    capitalReturned, proceeds, netCapital, fees,
    realizedGain: m.realizedGain, latentGain,
    totalGain, totalGainPct,
    startDate, years,
    simpleAnnualGain, simpleAnnualGainPct,
    simpleUnavailableReason: simpleAnnualGain == null ? simpleReason : null,
    annualizedReturn,
    annualizedUnavailableReason: annualizedReturn == null ? xirrReason : null,
    tfrTotal,
  };
}

/** Punti del capitale versato cumulato nel tempo (per il grafico): parte da
 *  initialBalance alla data di partenza e cambia a ogni movimento REALE
 *  (i movimenti futuri non compaiono). */
export function buildPaidInSeries(
  category: CategoryDef,
  transactions: Transaction[],
  todayISO: string,
): { date: string; value: number }[] {
  const m = collectPositionMovements(transactions, category.id, todayISO);
  const initial = category.initialBalance ?? 0;
  const start = category.subscriptionDate ?? m.flows[0]?.date ?? null;
  if (!start) return [];
  const points: { date: string; value: number }[] = [];
  let value = initial;
  points.push({ date: start, value: r2(value) });
  for (const t of m.flows) {
    value += t.direction === 'out' ? -t.amount : t.amount;
    points.push({ date: t.date, value: r2(Math.max(0, value)) });
  }
  if (points[points.length - 1].date < todayISO) points.push({ date: todayISO, value: points[points.length - 1].value });
  return points;
}
