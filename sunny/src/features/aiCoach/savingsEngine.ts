/**
 * Motore di risparmio dell'AI Coach — modulo PURO.
 *
 * Il problema del Coach non era il prompt: era che al modello arrivavano
 * quattro numeri (reddito, spese, obiettivo, costo) e da lì doveva inventarsi
 * tutto il resto. Senza sapere quanto del mese è già promesso a rate e
 * abbonamenti, quanto pesa davvero ogni categoria e quali mesi sono
 * storicamente più cari, i consigli non potevano che essere generici — e i
 * numeri, quando li produceva il modello, potevano essere semplicemente
 * sbagliati.
 *
 * Qui i numeri li calcola il codice. Il modello riceve un contesto ricco e un
 * piano già fatto, e il suo lavoro diventa spiegarlo: quello che sa fare bene.
 *
 * Le tre domande a cui risponde:
 *   1. `planPurchase`  — "posso permettermi X, e per quando?"
 *   2. `planCuts`      — "dove taglio N € al mese?"
 *   3. `projectGoal`   — "arrivo a Y entro dicembre?"
 *
 * Tutto viene dalle stesse primitive del resto dell'app (`ownShare`,
 * `isPending`, `aggregateFlow`), quindi il Coach non può raccontare numeri
 * diversi da quelli che la dashboard mostra. La data arriva sempre come
 * `todayISO`: nessun `new Date()` qui dentro.
 */
import { Transaction, CategoryDef, ownShare } from '../../types';
import { isPending } from '../../shared/recurrence';
import { aggregateFlow } from '../../shared/financialFlow';

/** Finestre su cui si misura il ritmo, dalla più recente alla più lunga. */
export const AVERAGE_WINDOWS = [3, 6, 12] as const;

/** Quota massima di una categoria che si può considerare tagliabile. Oltre,
 *  il "risparmio" è una promessa che nessuno mantiene. */
export const MAX_CUT_SHARE = 0.3;

/** Sotto questa spesa media mensile una categoria non vale un consiglio. */
export const MIN_CUT_EUR = 15;

/** Un mese è "caro" se supera la media di questo margine. */
export const HEAVY_MONTH_MARGIN = 0.15;

/** Categorie su cui un taglio è realistico: le altre sono affitto, mutuo,
 *  bollette — si cambiano con un trasloco, non con un consiglio. */
const NON_DISCRETIONARY = /affitto|mutuo|casa|bollett|utenz|assicur|tass|scuola|asilo|condomin/i;

export interface MonthlyAverage {
  months: number;
  income: number;
  expense: number;
  /** Flusso netto medio: quanto resta davvero, al mese. */
  net: number;
}

export interface CategoryLoad {
  id: string;
  label: string;
  icon: string;
  color: string;
  /** Media mensile sulla finestra più lunga disponibile. */
  monthlyAvg: number;
  /** Quota sulle uscite totali, 0–1. */
  share: number;
  /** Un taglio qui è realistico. */
  discretionary: boolean;
  /** Quanto si può togliere al mese senza chiedere l'impossibile. */
  cuttable: number;
}

export interface SavingsContext {
  todayISO: string;
  /** Mesi chiusi disponibili nello storico. */
  monthsOfHistory: number;
  averages: MonthlyAverage[];
  /**
   * Il ritmo su cui contare. Non è la media dell'ultimo mese (troppo
   * volatile) né quella dei dodici (troppo vecchia): è la PIÙ BASSA delle
   * medie disponibili, perché un piano costruito sul mese migliore salta al
   * primo mese normale.
   */
  sustainableMonthly: number;
  /** Uscite già promesse ogni mese: rate, abbonamenti, ricorrenti. */
  fixedMonthlyCost: number;
  liquidity: number;
  /** Liquidità al netto di ciò che è già programmato entro fine mese. */
  freeLiquidity: number;
  savingsTarget: number;
  categories: CategoryLoad[];
  /** Mesi (1–12) storicamente più cari della media. */
  heavyMonths: number[];
  /** Quanto si libera, e quando, alla fine dei piani a rate in corso. */
  endingInstallments: { description: string; monthly: number; endsISO: string }[];
}

export interface SavingsInput {
  transactions: Transaction[];
  categories: CategoryDef[];
  todayISO: string;
  liquidity: number;
  freeLiquidity?: number;
  savingsTarget?: number;
  fixedMonthlyCost?: number;
  endingInstallments?: { description: string; monthly: number; endsISO: string }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM` di `offset` mesi prima del mese di `todayISO` (1 = mese scorso). */
function monthKeyBefore(todayISO: string, offset: number): string {
  const [y, m] = todayISO.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - offset, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Movimenti realizzati di un mese chiuso. */
function closedMonth(txs: Transaction[], key: string, todayISO: string): Transaction[] {
  return txs.filter(t => !t.projected && t.date.slice(0, 7) === key && !isPending(t, todayISO));
}

/** Media su una finestra di mesi CHIUSI (il mese in corso non conta: è mezzo). */
function averageOver(txs: Transaction[], months: number, todayISO: string): MonthlyAverage {
  let income = 0, expense = 0, net = 0, seen = 0;
  for (let i = 1; i <= months; i++) {
    const monthTx = closedMonth(txs, monthKeyBefore(todayISO, i), todayISO);
    if (monthTx.length === 0) continue;
    seen++;
    const flow = aggregateFlow(monthTx);
    income += flow.ordinaryIncome;
    expense += flow.expenses;
    net += flow.netFlow;
  }
  const n = Math.max(1, seen);
  return { months, income: r2(income / n), expense: r2(expense / n), net: r2(net / n) };
}

/** Quanti mesi chiusi hanno almeno un movimento. */
function historyDepth(txs: Transaction[], todayISO: string): number {
  let depth = 0;
  for (let i = 1; i <= 24; i++) {
    if (closedMonth(txs, monthKeyBefore(todayISO, i), todayISO).length > 0) depth = i;
  }
  return depth;
}

function buildCategories(
  txs: Transaction[], cats: CategoryDef[], months: number, todayISO: string,
): CategoryLoad[] {
  const totals = new Map<string, number>();
  let overall = 0;
  for (let i = 1; i <= months; i++) {
    for (const t of closedMonth(txs, monthKeyBefore(todayISO, i), todayISO)) {
      if (t.type !== 'expense') continue;
      const v = ownShare(t);
      totals.set(t.category, (totals.get(t.category) ?? 0) + v);
      overall += v;
    }
  }
  const span = Math.max(1, months);
  return [...totals.entries()]
    .map(([id, total]) => {
      const def = cats.find(c => c.id === id);
      const label = def?.label ?? id;
      const monthlyAvg = r2(total / span);
      const discretionary = !NON_DISCRETIONARY.test(label);
      return {
        id, label,
        icon: def?.icon ?? '•',
        color: def?.color ?? '#8A9270',
        monthlyAvg,
        share: overall > 0 ? total / overall : 0,
        discretionary,
        cuttable: discretionary && monthlyAvg >= MIN_CUT_EUR ? r2(monthlyAvg * MAX_CUT_SHARE) : 0,
      };
    })
    .filter(c => c.monthlyAvg > 0)
    .sort((a, b) => b.monthlyAvg - a.monthlyAvg);
}

/** Mesi dell'anno storicamente più cari della media: servono a non promettere
 *  un traguardo che cade a dicembre come se fosse un mese qualunque. */
function heavyMonths(txs: Transaction[], todayISO: string): number[] {
  const byMonth = new Map<number, { sum: number; count: number }>();
  for (const t of txs) {
    if (t.projected || t.type !== 'expense' || isPending(t, todayISO)) continue;
    const m = Number(t.date.slice(5, 7));
    const e = byMonth.get(m) ?? { sum: 0, count: 0 };
    e.sum += ownShare(t);
    byMonth.set(m, e);
  }
  // Un mese va contato una volta per anno in cui compare, non per transazione.
  const years = new Map<number, Set<string>>();
  for (const t of txs) {
    if (t.projected || t.type !== 'expense' || isPending(t, todayISO)) continue;
    const m = Number(t.date.slice(5, 7));
    if (!years.has(m)) years.set(m, new Set());
    years.get(m)!.add(t.date.slice(0, 4));
  }
  const avgOf = (m: number) => {
    const e = byMonth.get(m);
    const y = years.get(m)?.size ?? 0;
    return e && y > 0 ? e.sum / y : 0;
  };
  const present = [...byMonth.keys()];
  if (present.length < 6) return [];   // troppo poco storico per parlare di stagionalità
  const mean = present.reduce((s, m) => s + avgOf(m), 0) / present.length;
  if (mean <= 0) return [];
  return present.filter(m => avgOf(m) > mean * (1 + HEAVY_MONTH_MARGIN)).sort((a, b) => a - b);
}

export function buildSavingsContext(input: SavingsInput): SavingsContext {
  const { transactions, categories, todayISO, liquidity } = input;
  const depth = historyDepth(transactions, todayISO);
  const windows = AVERAGE_WINDOWS.filter(w => w <= Math.max(1, depth));
  const averages = (windows.length ? windows : [Math.max(1, depth)])
    .map(w => averageOver(transactions, w, todayISO));

  // Il ritmo su cui contare è il PIÙ BASSO fra quelli misurati: un piano
  // costruito sul mese migliore salta al primo mese normale.
  const sustainableMonthly = averages.length
    ? r2(Math.min(...averages.map(a => a.net)))
    : 0;

  return {
    todayISO,
    monthsOfHistory: depth,
    averages,
    sustainableMonthly,
    fixedMonthlyCost: r2(input.fixedMonthlyCost ?? 0),
    liquidity: r2(liquidity),
    freeLiquidity: r2(input.freeLiquidity ?? liquidity),
    savingsTarget: input.savingsTarget ?? 0,
    categories: buildCategories(transactions, categories, Math.max(1, Math.min(depth, 6)), todayISO),
    heavyMonths: heavyMonths(transactions, todayISO),
    endingInstallments: input.endingInstallments ?? [],
  };
}

// ── Domanda 1: posso permettermelo? ──────────────────────────────────────────

export interface CutPlan {
  categoryId: string;
  label: string;
  icon: string;
  color: string;
  /** Quanto togliere al mese da questa categoria. */
  amount: number;
  /** Su quanto si spende oggi. */
  currentMonthly: number;
}

export interface PurchasePlan {
  cost: number;
  /** Entra nel risparmio di un mese solo. */
  fitsThisMonth: boolean;
  /** Si può pagare subito con la liquidità libera senza intaccare il ritmo. */
  affordableNow: boolean;
  /** Mesi al traguardo al ritmo sostenibile; null se non si risparmia. */
  monthsToAfford: number | null;
  readyByISO: string | null;
  /** Con una scadenza: quanto serve al mese, e se è raggiungibile. */
  requiredMonthly: number | null;
  feasible: boolean | null;
  /** Quanto manca ogni mese per rispettare la scadenza. */
  gapMonthly: number;
  cuts: CutPlan[];
  cutsTotal: number;
  monthsWithCuts: number | null;
  /** Avvertenze deterministiche da dare al modello già scritte. */
  notes: string[];
}

/** Quanto si può realisticamente liberare, in ordine di impatto. */
export function planCuts(ctx: SavingsContext, targetMonthly: number): CutPlan[] {
  if (targetMonthly <= 0) return [];
  const out: CutPlan[] = [];
  let left = targetMonthly;
  for (const c of ctx.categories) {
    if (left <= 0 || c.cuttable <= 0) continue;
    const take = r2(Math.min(c.cuttable, left));
    if (take < 1) continue;
    out.push({
      categoryId: c.id, label: c.label, icon: c.icon, color: c.color,
      amount: take, currentMonthly: c.monthlyAvg,
    });
    left = r2(left - take);
  }
  return out;
}

/** Data ISO di `months` mesi dopo il mese di `todayISO`, al primo del mese. */
function monthsAhead(todayISO: string, months: number): string {
  const [y, m] = todayISO.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

/** Mesi pieni fra il mese di `todayISO` e quello di `targetISO`. */
export function monthsUntil(todayISO: string, targetISO: string): number {
  const [ty, tm] = todayISO.split('-').map(Number);
  const [gy, gm] = targetISO.split('-').map(Number);
  return (gy - ty) * 12 + (gm - tm);
}

export function planPurchase(
  ctx: SavingsContext,
  cost: number,
  targetDateISO?: string,
): PurchasePlan {
  const pace = ctx.sustainableMonthly;
  const fitsThisMonth = pace > 0 && cost <= pace;
  const affordableNow = cost <= ctx.freeLiquidity;

  const monthsToAfford = pace > 0 ? Math.ceil(cost / pace) : null;
  const readyByISO = monthsToAfford != null ? monthsAhead(ctx.todayISO, monthsToAfford) : null;

  const horizon = targetDateISO ? Math.max(0, monthsUntil(ctx.todayISO, targetDateISO)) : null;
  const requiredMonthly = horizon != null && horizon > 0 ? r2(cost / horizon) : null;
  const gapMonthly = requiredMonthly != null ? r2(Math.max(0, requiredMonthly - pace)) : 0;

  const cuts = gapMonthly > 0 ? planCuts(ctx, gapMonthly) : [];
  const cutsTotal = r2(cuts.reduce((s, c) => s + c.amount, 0));
  const feasible = requiredMonthly == null ? null : pace + cutsTotal >= requiredMonthly;
  const paceWithCuts = pace + cutsTotal;
  const monthsWithCuts = paceWithCuts > 0 ? Math.ceil(cost / paceWithCuts) : null;

  const notes: string[] = [];
  if (ctx.monthsOfHistory < 3) {
    notes.push(`Lo storico è di ${ctx.monthsOfHistory} ${ctx.monthsOfHistory === 1 ? 'mese' : 'mesi'}: la stima è indicativa.`);
  }
  if (pace <= 0) {
    notes.push('Nei mesi misurati non è avanzato niente: senza tagli il traguardo non si sposta.');
  }
  if (ctx.fixedMonthlyCost > 0) {
    notes.push(`${ctx.fixedMonthlyCost.toFixed(0)} € al mese sono già impegnati in rate, abbonamenti e ricorrenti.`);
  }
  // Se il traguardo cade in un mese storicamente caro, dirlo prima.
  const landing = targetDateISO ?? readyByISO;
  if (landing && ctx.heavyMonths.includes(Number(landing.slice(5, 7)))) {
    notes.push(`Il traguardo cade in un mese che storicamente ti costa più della media.`);
  }
  for (const inst of ctx.endingInstallments) {
    if (!landing || inst.endsISO <= landing) {
      notes.push(`Da ${inst.endsISO.slice(0, 7)} si liberano ${inst.monthly.toFixed(0)} € al mese: finisce "${inst.description}".`);
    }
  }
  if (affordableNow && !fitsThisMonth) {
    notes.push('La liquidità libera basterebbe già oggi, ma la spesa non rientra nel risparmio di un mese.');
  }

  return {
    cost: r2(cost), fitsThisMonth, affordableNow,
    monthsToAfford, readyByISO, requiredMonthly, feasible, gapMonthly,
    cuts, cutsTotal, monthsWithCuts, notes,
  };
}

// ── Domanda 3: arrivo all'obiettivo entro…? ──────────────────────────────────

export interface GoalProjection {
  /** Quanto si vuole avere da parte. */
  goal: number;
  /** Da dove si parte. */
  startingFrom: number;
  targetISO: string;
  monthsAvailable: number;
  requiredMonthly: number;
  pace: number;
  onTrack: boolean;
  gapMonthly: number;
  cuts: CutPlan[];
  cutsTotal: number;
  /** Quanto si arriva ad avere al ritmo attuale entro la data. */
  projectedAtTarget: number;
  notes: string[];
}

export function projectGoal(
  ctx: SavingsContext,
  goal: number,
  targetISO: string,
  startingFrom = 0,
): GoalProjection {
  const monthsAvailable = Math.max(0, monthsUntil(ctx.todayISO, targetISO));
  const missing = Math.max(0, goal - startingFrom);
  const requiredMonthly = monthsAvailable > 0 ? r2(missing / monthsAvailable) : missing;
  const pace = ctx.sustainableMonthly;
  const gapMonthly = r2(Math.max(0, requiredMonthly - pace));
  const cuts = gapMonthly > 0 ? planCuts(ctx, gapMonthly) : [];
  const cutsTotal = r2(cuts.reduce((s, c) => s + c.amount, 0));

  const notes: string[] = [];
  if (monthsAvailable === 0) notes.push('La data è nel mese corrente: non c\'è un mese pieno per accumulare.');
  if (gapMonthly > 0 && cutsTotal < gapMonthly) {
    notes.push(`Anche tagliando il massimo realistico restano ${r2(gapMonthly - cutsTotal).toFixed(0)} € al mese scoperti.`);
  }

  return {
    goal: r2(goal), startingFrom: r2(startingFrom), targetISO, monthsAvailable,
    requiredMonthly, pace, onTrack: pace >= requiredMonthly, gapMonthly,
    cuts, cutsTotal,
    projectedAtTarget: r2(startingFrom + pace * monthsAvailable),
    notes,
  };
}
