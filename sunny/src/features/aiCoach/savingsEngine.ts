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

/** In quanti mesi su quelli osservati una categoria deve comparire perché sia
 *  "sempre quella": sotto, è una spesa saltuaria, non un costo fisso. */
export const FIXED_PRESENCE = 0.8;

/** Quanto può oscillare, in proporzione alla mediana, una spesa che si
 *  considera fissa. L'affitto è identico ogni mese; la spesa al supermercato
 *  no, anche se la si fa tutti i mesi. */
export const FIXED_VARIATION = 0.15;

/** Un mese che supera di tanto la mediana degli altri è un evento, non il
 *  ritmo: la caldaia nuova non è "quanto spendi di casa al mese". */
export const SPIKE_FACTOR = 3;

/** Mesi minimi di storico per poter dire qualcosa sulla natura di una spesa. */
export const MIN_MONTHS_FOR_NATURE = 3;

/**
 * Che tipo di spesa è.
 *
 *   fixed     torna ogni mese quasi identica — affitto, mutuo, bollette,
 *             abbonamenti. Non si taglia con un consiglio: si taglia con un
 *             trasloco o con una disdetta, che sono decisioni diverse.
 *   variable  c'è quasi sempre ma oscilla — spesa, ristoranti, benzina. È qui
 *             che un taglio è possibile davvero.
 *   oneOff    un evento isolato, o una cifra concentrata in un mese solo. La
 *             sua media mensile non è un ritmo e prometterne il 30% sarebbe
 *             promettere il taglio di una spesa che non tornerà.
 */
export type CategoryNature = 'fixed' | 'variable' | 'oneOff';

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
  /** Media aritmetica mensile sulla finestra osservata. */
  monthlyAvg: number;
  /**
   * Il mese TIPICO: la mediana delle mensilità, non la media.
   *
   * Con una caldaia da 2.400 € a marzo la media di "Casa" su sei mesi sale di
   * 400 €/mese e il consiglio diventa "taglia 120 € di casa" — una cifra che
   * non esiste. La mediana ignora il picco e resta il ritmo vero.
   */
  typicalMonthly: number;
  /** Quota sulle uscite totali, 0–1. */
  share: number;
  /** Che tipo di spesa è, dedotto dai dati e non dal nome. */
  nature: CategoryNature;
  /** In quanti mesi osservati compare. */
  monthsPresent: number;
  /** Quota della spesa che arriva da serie ricorrenti (0–1). */
  recurringShare: number;
  /** Perché non si taglia — vuoto quando si taglia. */
  fixedReason: string;
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

/** Mediana di una serie di numeri (array non vuoto). */
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Che spesa è, letta dai dati e non dal nome della categoria.
 *
 * Il nome non basta e non è affidabile: le categorie le crea l'utente, e
 * "Casa" può essere l'affitto per uno e l'Ikea per un altro. Quello che si
 * può osservare invece è come la spesa si comporta nel tempo — se torna, se
 * torna uguale, e se arriva da una serie ricorrente che qualcuno ha firmato.
 */
function natureOf(
  monthly: number[], months: number, recurringShare: number,
): { nature: CategoryNature; reason: string } {
  const present = monthly.filter(v => v > 0);
  const spent = present.length;

  // Con meno di tre mesi non si distingue un costo fisso da una coincidenza:
  // meglio non tagliare che promettere un taglio su un'ipotesi.
  if (months < MIN_MONTHS_FOR_NATURE) {
    return { nature: 'fixed', reason: 'storico troppo corto per capire se è una spesa ricorrente' };
  }

  // Una spesa concentrata in un mese solo è un evento: la sua media mensile
  // è un artefatto della divisione, non un ritmo che si possa tagliare.
  if (spent <= 1) {
    return { nature: 'oneOff', reason: 'spesa una tantum, non si ripete ogni mese' };
  }
  const med = median(present);
  if (med > 0 && Math.max(...present) > med * SPIKE_FACTOR && spent < months * FIXED_PRESENCE) {
    return { nature: 'oneOff', reason: 'quasi tutto in un mese solo: è stato un evento, non un ritmo' };
  }

  // Firmata: un contratto non si taglia con un consiglio, si disdice.
  if (recurringShare >= 0.6) {
    return { nature: 'fixed', reason: 'arriva da una serie ricorrente: si cambia disdicendo, non spendendo meno' };
  }

  // C'è sempre e non oscilla quasi mai: è un costo fisso anche senza serie.
  const everyMonth = spent >= Math.ceil(months * FIXED_PRESENCE);
  const spread = med > 0 ? (Math.max(...present) - Math.min(...present)) / med : 0;
  if (everyMonth && spread <= FIXED_VARIATION) {
    return { nature: 'fixed', reason: 'identica ogni mese: è un costo fisso' };
  }

  return { nature: 'variable', reason: '' };
}

function buildCategories(
  txs: Transaction[], cats: CategoryDef[], months: number, todayISO: string,
): CategoryLoad[] {
  // Per categoria: quanto in ciascun mese, e quanto arriva da serie ricorrenti.
  const byCat = new Map<string, { monthly: number[]; recurring: number }>();
  let overall = 0;
  const span = Math.max(1, months);
  for (let i = 1; i <= span; i++) {
    for (const t of closedMonth(txs, monthKeyBefore(todayISO, i), todayISO)) {
      if (t.type !== 'expense') continue;
      const v = ownShare(t);
      let e = byCat.get(t.category);
      if (!e) byCat.set(t.category, (e = { monthly: new Array(span).fill(0), recurring: 0 }));
      e.monthly[i - 1] += v;
      if (t.recurring || t.seriesId) e.recurring += v;
      overall += v;
    }
  }

  return [...byCat.entries()]
    .map(([id, e]) => {
      const def = cats.find(c => c.id === id);
      const total = e.monthly.reduce((a, b) => a + b, 0);
      const present = e.monthly.filter(v => v > 0);
      const recurringShare = total > 0 ? e.recurring / total : 0;
      const { nature, reason } = natureOf(e.monthly, span, recurringShare);
      // Il ritmo è la mediana dei mesi in cui la spesa c'è stata: un mese a
      // zero non abbassa il ritmo, lo rende solo meno frequente.
      const typicalMonthly = present.length ? r2(median(present)) : 0;
      return {
        id,
        label: def?.label ?? id,
        icon: def?.icon ?? '•',
        color: def?.color ?? '#8A9270',
        monthlyAvg: r2(total / span),
        typicalMonthly,
        share: overall > 0 ? total / overall : 0,
        nature,
        monthsPresent: present.length,
        recurringShare: Math.round(recurringShare * 100) / 100,
        fixedReason: reason,
        // Si taglia SOLO il variabile, e solo sul mese tipico: promettere il
        // 30% di una media gonfiata da un picco è promettere il nulla.
        cuttable: nature === 'variable' && typicalMonthly >= MIN_CUT_EUR
          ? r2(typicalMonthly * MAX_CUT_SHARE)
          : 0,
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
      amount: take, currentMonthly: c.typicalMonthly,
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
  const untouchable = ctx.categories.filter(c => c.nature === 'fixed' && c.typicalMonthly >= MIN_CUT_EUR);
  if (untouchable.length > 0) {
    notes.push(`NON proporre tagli su: ${untouchable.map(c => `${c.label} (${c.typicalMonthly.toFixed(0)} €/mese, ${c.fixedReason})`).join('; ')}.`);
  }
  const oneOffs = ctx.categories.filter(c => c.nature === 'oneOff' && c.monthlyAvg >= MIN_CUT_EUR);
  if (oneOffs.length > 0) {
    notes.push(`Spese una tantum, già escluse dal ritmo mensile: ${oneOffs.map(c => c.label).join(', ')}. Non contarle come risparmio ricorrente.`);
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
