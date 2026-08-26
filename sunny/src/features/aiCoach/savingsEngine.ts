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

/** Quota minima: su una spesa davvero variabile un ritocco è sempre possibile,
 *  anche quando nei mesi misurati è rimasta stabile per caso. */
export const MIN_CUT_SHARE = 0.1;

/** Sotto questa spesa media mensile una categoria non vale un consiglio. */
export const MIN_CUT_EUR = 15;

/** Sotto questa cifra un taglio non è un consiglio, è una riga in più. */
export const MIN_CUT_PROPOSAL = 5;

/** Un mese è "caro" se supera la media di questo margine. */
export const HEAVY_MONTH_MARGIN = 0.15;

/** In quanti mesi su quelli osservati una categoria deve comparire perché sia
 *  "sempre quella": sotto, è una spesa saltuaria, non un costo fisso. */
export const FIXED_PRESENCE = 0.8;

/** Quanto può oscillare, in proporzione alla mediana, una spesa che si
 *  considera fissa. L'affitto è identico ogni mese; la spesa al supermercato
 *  no, anche se la si fa tutti i mesi. */
export const FIXED_VARIATION = 0.15;

/**
 * Quante transazioni al mese può avere una spesa fissa.
 *
 * È il segnale che separa una bolletta da una spesa discrezionale stabile:
 * l'affitto è UN addebito da 900 €, i ristoranti sono dodici scontrini che
 * per caso fanno sempre 400. Guardando solo il totale mensile le due cose
 * sono identiche — e il Coach finiva per dichiarare "non tagliabile" una
 * spesa che invece è la prima da cui partire.
 */
export const FIXED_MAX_TX_PER_MONTH = 2;

/** Un mese che supera di tanto la mediana degli altri è un evento, non il
 *  ritmo: la caldaia nuova non è "quanto spendi di casa al mese". */
export const SPIKE_FACTOR = 3;

/** Mesi minimi di storico per poter dire qualcosa sulla natura di una spesa. */
export const MIN_MONTHS_FOR_NATURE = 3;

/** Quanto indietro si guarda per riconoscere le spese che tornano a intervalli
 *  lunghi: un'assicurazione annuale si vede solo su due anni. */
export const SCAN_MONTHS = 24;

/** Intervalli riconosciuti come periodici: bimestrale, trimestrale,
 *  quadrimestrale, semestrale, annuale. */
export const CADENCE_MONTHS: readonly number[] = [2, 3, 4, 6, 12];

/** Quanto possono differire fra loro gli importi di una spesa periodica. */
export const CADENCE_AMOUNT_SPREAD = 0.35;

/** Sotto questa variazione fra la prima e la seconda metà dello storico una
 *  categoria è stabile, non "in crescita". */
export const TREND_MIN_CHANGE = 0.1;

/** Quante avvertenze passare al modello: oltre, il prompt si diluisce. */
export const MAX_NOTES = 14;

/**
 * Che tipo di spesa è.
 *
 *   fixed     torna ogni mese quasi identica — affitto, mutuo, bollette,
 *             abbonamenti. Non si taglia con un consiglio: si taglia con un
 *             trasloco o con una disdetta, che sono decisioni diverse.
 *   periodic  torna a intervalli regolari più lunghi del mese — assicurazione,
 *             bollo, bollette bimestrali. Non si taglia e non è un costo del
 *             mese in cui arriva: è una quota da accantonare ogni mese.
 *   variable  c'è quasi sempre ma oscilla — spesa, ristoranti, benzina. È qui
 *             che un taglio è possibile davvero.
 *   oneOff    un evento isolato, o una cifra concentrata in un mese solo. La
 *             sua media mensile non è un ritmo e prometterne il 30% sarebbe
 *             promettere il taglio di una spesa che non tornerà.
 */
export type CategoryNature = 'fixed' | 'periodic' | 'variable' | 'oneOff';

/** Dove sta andando una spesa: serve a dire "sta crescendo" prima che diventi
 *  un problema, non dopo. */
export type Trend = 'up' | 'down' | 'flat';

/** Quanto ci si può fidare del ritmo misurato. */
export type Confidence = 'alta' | 'media' | 'bassa';

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
  /** Quante transazioni ha, in un mese tipico. */
  txPerMonth: number;
  /** Il mese più basso fra quelli in cui la spesa c'è stata. */
  lowestMonth: number;
  /** Quanto si è già speso in meno almeno una volta: il taglio DIMOSTRATO. */
  provenReduction: number;
  /** Speso mese per mese sull'intero storico scansionato, indice 0 = mese
   *  scorso. È la serie su cui si leggono cadenza e tendenza. */
  monthlySeries: number[];
  /** Ogni quanti mesi torna, quando è periodica; null altrimenti. */
  cadenceMonths: number | null;
  /** Quota mensile da mettere da parte per una spesa periodica. */
  monthlyReserve: number;
  /** Dove sta andando la spesa negli ultimi mesi. */
  trend: Trend;
  /** Di quanto è cambiata, in proporzione (0.25 = +25%). */
  trendPct: number;
  /** Perché non si taglia — vuoto quando si taglia. */
  fixedReason: string;
  /** Quanto si può togliere al mese senza chiedere l'impossibile. */
  cuttable: number;
}

/**
 * Il mese diviso per quello che si può davvero decidere.
 *
 * È la risposta alla domanda che il Coach non sapeva dare: di tutto quello che
 * spendo, quanto è già deciso e quanto è ancora mio.
 */
export interface SpendingBreakdown {
  /** Spese che tornano ogni mese quasi identiche. */
  fixedMonthly: number;
  /** Quota mensile delle spese che tornano a intervalli più lunghi. */
  periodicMonthly: number;
  /** Spese che oscillano: è qui che si decide. */
  variableMonthly: number;
  /** Media mensile delle una tantum: informativa, non è un ritmo. */
  oneOffMonthly: number;
  /** Il massimo che si può liberare tagliando, sommando tutte le categorie. */
  reducibleMonthly: number;
}

export interface SavingsContext {
  todayISO: string;
  /** Mesi chiusi disponibili nello storico. */
  monthsOfHistory: number;
  averages: MonthlyAverage[];
  /**
   * Il ritmo su cui contare. Non è la media dell'ultimo mese (troppo
   * volatile) né quella dei dodici (troppo vecchia): è la PIÙ BASSA delle
   * medie disponibili, al netto delle spese periodiche che nei mesi misurati
   * non sono ancora arrivate.
   */
  sustainableMonthly: number;
  /** Il ritmo prima dell'accantonamento periodico: serve a spiegare la differenza. */
  rawSustainableMonthly: number;
  /** Quanto è stato tolto al ritmo per le spese periodiche non ancora viste. */
  periodicAdjustment: number;
  /** Entrate mensili su cui contare: la più bassa delle medie. */
  monthlyIncome: number;
  /** Uscite mensili su cui contare: la più alta delle medie. */
  monthlyExpense: number;
  /** Quota del reddito che resta: 0–1. */
  savingsRate: number;
  /** Mesi di spese coperti dalla liquidità libera; null senza uscite misurate. */
  runwayMonths: number | null;
  /** Il peggior mese chiuso osservato: il ritmo non è una garanzia. */
  worstMonthNet: number;
  /** Quanto ci si può fidare del ritmo. */
  paceConfidence: Confidence;
  breakdown: SpendingBreakdown;
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
const eur = (n: number) => Math.round(n).toString();

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
  for (let i = 1; i <= SCAN_MONTHS; i++) {
    if (closedMonth(txs, monthKeyBefore(todayISO, i), todayISO).length > 0) depth = i;
  }
  return depth;
}

/** Il flusso netto peggiore fra i mesi chiusi con dati. */
function worstMonth(txs: Transaction[], scan: number, todayISO: string): number {
  let worst: number | null = null;
  for (let i = 1; i <= scan; i++) {
    const monthTx = closedMonth(txs, monthKeyBefore(todayISO, i), todayISO);
    if (monthTx.length === 0) continue;
    const net = aggregateFlow(monthTx).netFlow;
    worst = worst === null ? net : Math.min(worst, net);
  }
  return r2(worst ?? 0);
}

/** Mediana di una serie di numeri (array non vuoto). */
function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Ogni quanto torna una spesa, e quanto vale quando torna.
 *
 * L'assicurazione auto non è una spesa una tantum e non è una spesa mensile:
 * è 600 € che tornano ogni dodici mesi. Trattarla come una tantum significa
 * dimenticarsene fino al giorno prima; spalmarla sulla media di sei mesi
 * significa non vederla affatto. L'unica lettura giusta è la cadenza — e la
 * cadenza si vede solo negli intervalli fra un addebito e il successivo.
 */
function detectCadence(monthly: number[]): { cadence: number; typical: number } | null {
  const idx: number[] = [];
  monthly.forEach((v, i) => { if (v > 0) idx.push(i); });
  if (idx.length < 2) return null;

  const gaps: number[] = [];
  for (let k = 1; k < idx.length; k++) gaps.push(idx[k] - idx[k - 1]);
  const gap = gaps[0];
  if (!CADENCE_MONTHS.includes(gap)) return null;
  if (gaps.some(g => g !== gap)) return null;

  // Su intervalli corti due occorrenze possono essere una coincidenza; su un
  // anno sono già una regola (di più non se ne possono osservare).
  if (idx.length < (gap <= 4 ? 3 : 2)) return null;

  const amounts = idx.map(i => monthly[i]);
  const med = median(amounts);
  if (med <= 0) return null;
  if ((Math.max(...amounts) - Math.min(...amounts)) / med > CADENCE_AMOUNT_SPREAD) return null;

  return { cadence: gap, typical: r2(med) };
}

/** Dove sta andando la spesa: metà recente contro metà vecchia. */
function trendOf(monthly: number[]): { trend: Trend; pct: number } {
  const n = monthly.length;
  if (n < 4) return { trend: 'flat', pct: 0 };
  const half = Math.floor(n / 2);
  // L'indice 0 è il mese scorso: i primi sono i più recenti.
  const recent = monthly.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const older = monthly.slice(n - half).reduce((a, b) => a + b, 0) / half;
  if (older <= 0) return { trend: 'flat', pct: 0 };
  const pct = (recent - older) / older;
  if (Math.abs(pct) < TREND_MIN_CHANGE) return { trend: 'flat', pct: 0 };
  return { trend: pct > 0 ? 'up' : 'down', pct: Math.round(pct * 100) / 100 };
}

interface NatureInput {
  monthly: number[];
  months: number;
  recurringShare: number;
  txPerMonth: number;
  cadence: { cadence: number; typical: number } | null;
}

/**
 * Che spesa è, letta dai dati e non dal nome della categoria.
 *
 * Il nome non basta e non è affidabile: le categorie le crea l'utente, e
 * "Casa" può essere l'affitto per uno e l'Ikea per un altro. Quello che si
 * può osservare invece è come la spesa si comporta nel tempo — se torna, ogni
 * quanto, se torna uguale, in quante transazioni, e se arriva da una serie
 * ricorrente che qualcuno ha firmato.
 */
function natureOf(input: NatureInput): { nature: CategoryNature; reason: string } {
  const { monthly, months, recurringShare, txPerMonth, cadence } = input;
  const present = monthly.filter(v => v > 0);
  const spent = present.length;

  // Con meno di tre mesi non si distingue un costo fisso da una coincidenza:
  // meglio non tagliare che promettere un taglio su un'ipotesi.
  if (months < MIN_MONTHS_FOR_NATURE) {
    return { nature: 'fixed', reason: 'storico troppo corto per capire se è una spesa ricorrente' };
  }

  // Torna a intervalli regolari: non è una tantum e non è tagliabile, è una
  // quota da accantonare ogni mese.
  if (cadence) {
    return {
      nature: 'periodic',
      reason: `torna ogni ${cadence.cadence} mesi (~${eur(cadence.typical)} €): non si taglia, si accantona`,
    };
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

  // C'è sempre, non oscilla quasi mai ED è un addebito solo: è una bolletta.
  // Con dodici scontrini al mese lo stesso totale stabile non è un costo
  // fisso — è una scelta ripetuta, e una scelta si può cambiare.
  const everyMonth = spent >= Math.ceil(months * FIXED_PRESENCE);
  const spread = med > 0 ? (Math.max(...present) - Math.min(...present)) / med : 0;
  if (everyMonth && spread <= FIXED_VARIATION && txPerMonth <= FIXED_MAX_TX_PER_MONTH) {
    return { nature: 'fixed', reason: 'identica ogni mese, in un solo addebito: è un costo fisso' };
  }

  return { nature: 'variable', reason: '' };
}

/**
 * Quanto si può togliere davvero.
 *
 * Il 30% secco era una regola inventata: su una categoria che oscilla fra 250
 * e 350 € promettere −90 € significa chiedere un mese mai visto. La prova sta
 * nei dati — il mese più basso è una cifra che l'utente ha GIÀ centrato — con
 * un ritocco minimo sempre concesso e il tetto del 30% come limite superiore.
 */
function cuttableOf(
  nature: CategoryNature, typicalMonthly: number, lowestMonth: number, monthsPresent: number,
): number {
  if (nature !== 'variable' || typicalMonthly < MIN_CUT_EUR) return 0;
  const cap = typicalMonthly * MAX_CUT_SHARE;
  const floor = typicalMonthly * MIN_CUT_SHARE;
  const proven = monthsPresent >= MIN_MONTHS_FOR_NATURE
    ? Math.max(0, typicalMonthly - lowestMonth)
    : floor;
  return r2(Math.min(cap, Math.max(floor, proven)));
}

interface CatSeries {
  /** Speso per mese, indice 0 = mese scorso, sull'intera finestra di scansione. */
  monthly: number[];
  /** Transazioni per mese, stessa indicizzazione. */
  counts: number[];
  /** Quanto, nella finestra di calcolo, arriva da serie ricorrenti. */
  recurring: number;
}

function buildCategories(
  txs: Transaction[], cats: CategoryDef[], span: number, scan: number, todayISO: string,
): CategoryLoad[] {
  const byCat = new Map<string, CatSeries>();
  let overall = 0;
  for (let i = 1; i <= scan; i++) {
    for (const t of closedMonth(txs, monthKeyBefore(todayISO, i), todayISO)) {
      if (t.type !== 'expense') continue;
      const v = ownShare(t);
      let e = byCat.get(t.category);
      if (!e) {
        byCat.set(t.category, (e = {
          monthly: new Array(scan).fill(0), counts: new Array(scan).fill(0), recurring: 0,
        }));
      }
      e.monthly[i - 1] += v;
      e.counts[i - 1] += 1;
      if (i <= span) {
        if (t.recurring || t.seriesId) e.recurring += v;
        overall += v;
      }
    }
  }

  return [...byCat.entries()]
    .map(([id, e]) => {
      const def = cats.find(c => c.id === id);
      // Il peso si misura sulla finestra breve — quanto pesa OGGI — mentre la
      // cadenza ha bisogno di tutto lo storico per vedersi.
      const window = e.monthly.slice(0, span);
      const total = window.reduce((a, b) => a + b, 0);
      const present = window.filter(v => v > 0);
      const recurringShare = total > 0 ? e.recurring / total : 0;
      const txMonths = e.counts.slice(0, span).filter(c => c > 0);
      const txPerMonth = txMonths.length ? median(txMonths) : 0;
      const cadence = detectCadence(e.monthly);
      const { nature, reason } = natureOf({
        monthly: window, months: span, recurringShare, txPerMonth, cadence,
      });
      // Il ritmo è la mediana dei mesi in cui la spesa c'è stata: un mese a
      // zero non abbassa il ritmo, lo rende solo meno frequente.
      const typicalMonthly = present.length ? r2(median(present)) : (cadence?.typical ?? 0);
      const lowestMonth = present.length ? r2(Math.min(...present)) : 0;
      const { trend, pct } = trendOf(window);
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
        txPerMonth: r2(txPerMonth),
        lowestMonth,
        provenReduction: r2(Math.max(0, typicalMonthly - lowestMonth)),
        monthlySeries: e.monthly.map(r2),
        cadenceMonths: cadence?.cadence ?? null,
        monthlyReserve: cadence ? r2(cadence.typical / cadence.cadence) : 0,
        trend,
        trendPct: pct,
        fixedReason: reason,
        cuttable: cuttableOf(nature, typicalMonthly, lowestMonth, present.length),
      };
    })
    // Una periodica può non essere caduta nella finestra breve e avere media
    // zero: resta comunque una spesa da accantonare, non sparisce.
    .filter(c => c.monthlyAvg > 0 || c.monthlyReserve > 0)
    .sort((a, b) => monthlyWeight(b) - monthlyWeight(a));
}

/** Quanto pesa al mese, con la lettura giusta per la sua natura. */
function monthlyWeight(c: CategoryLoad): number {
  return c.nature === 'periodic' ? Math.max(c.monthlyAvg, c.monthlyReserve) : c.monthlyAvg;
}

function breakdownOf(categories: CategoryLoad[]): SpendingBreakdown {
  const sum = (pick: (c: CategoryLoad) => number) => r2(categories.reduce((s, c) => s + pick(c), 0));
  return {
    fixedMonthly: sum(c => (c.nature === 'fixed' ? c.typicalMonthly : 0)),
    periodicMonthly: sum(c => (c.nature === 'periodic' ? c.monthlyReserve : 0)),
    variableMonthly: sum(c => (c.nature === 'variable' ? c.typicalMonthly : 0)),
    oneOffMonthly: sum(c => (c.nature === 'oneOff' ? c.monthlyAvg : 0)),
    reducibleMonthly: sum(c => c.cuttable),
  };
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

/** Quanto ci si può fidare del ritmo: storico corto o medie che ballano
 *  troppo fra loro sono un ritmo che non si può promettere. */
function confidenceOf(depth: number, averages: MonthlyAverage[]): Confidence {
  if (depth < MIN_MONTHS_FOR_NATURE || averages.length === 0) return 'bassa';
  const nets = averages.map(a => a.net);
  const hi = Math.max(...nets), lo = Math.min(...nets);
  const spread = Math.abs(hi) > 0 ? (hi - lo) / Math.abs(hi) : 0;
  if (depth < 6 || spread > 0.4) return 'media';
  return 'alta';
}

export function buildSavingsContext(input: SavingsInput): SavingsContext {
  const { transactions, categories, todayISO, liquidity } = input;
  const depth = historyDepth(transactions, todayISO);
  const windows = AVERAGE_WINDOWS.filter(w => w <= Math.max(1, depth));
  const averages = (windows.length ? windows : [Math.max(1, depth)])
    .map(w => averageOver(transactions, w, todayISO));

  const span = Math.max(1, Math.min(depth, 6));
  const scan = Math.max(span, Math.min(depth, SCAN_MONTHS));
  const cats = buildCategories(transactions, categories, span, scan, todayISO);
  const breakdown = breakdownOf(cats);

  // Il ritmo su cui contare è il PIÙ BASSO fra quelli misurati: un piano
  // costruito sul mese migliore salta al primo mese normale.
  const rawSustainable = averages.length ? r2(Math.min(...averages.map(a => a.net))) : 0;

  // Le medie hanno già assorbito le spese periodiche CADUTE nella finestra che
  // detta il ritmo; quelle che devono ancora arrivare no, e sono il motivo per
  // cui un piano apparentemente in regola salta al mese dell'assicurazione.
  // Si sottrae solo la differenza: contare due volte la stessa assicurazione
  // sarebbe prudenza finta, che è un altro modo di sbagliare i numeri.
  const binding = averages.reduce((best, a) => (a.net < best.net ? a : best), averages[0]);
  const bindingMonths = Math.max(1, binding?.months ?? 1);
  const absorbed = cats
    .filter(c => c.nature === 'periodic')
    .reduce((s, c) => s + c.monthlySeries.slice(0, bindingMonths).reduce((x, y) => x + y, 0) / bindingMonths, 0);
  const periodicAdjustment = r2(Math.max(0, breakdown.periodicMonthly - absorbed));

  // Prudenza: sulle entrate si conta la media più bassa, sulle uscite la più
  // alta. È la stessa logica del ritmo, applicata alle due metà.
  const monthlyIncome = averages.length ? r2(Math.min(...averages.map(a => a.income))) : 0;
  const monthlyExpense = averages.length ? r2(Math.max(...averages.map(a => a.expense))) : 0;

  const sustainableMonthly = r2(rawSustainable - periodicAdjustment);
  const freeLiquidity = r2(input.freeLiquidity ?? liquidity);

  return {
    todayISO,
    monthsOfHistory: depth,
    averages,
    sustainableMonthly,
    rawSustainableMonthly: rawSustainable,
    periodicAdjustment,
    monthlyIncome,
    monthlyExpense,
    savingsRate: monthlyIncome > 0 ? Math.round((sustainableMonthly / monthlyIncome) * 100) / 100 : 0,
    runwayMonths: monthlyExpense > 0 ? Math.round((freeLiquidity / monthlyExpense) * 10) / 10 : null,
    worstMonthNet: worstMonth(transactions, scan, todayISO),
    paceConfidence: confidenceOf(depth, averages),
    breakdown,
    fixedMonthlyCost: r2(input.fixedMonthlyCost ?? 0),
    liquidity: r2(liquidity),
    freeLiquidity,
    savingsTarget: input.savingsTarget ?? 0,
    categories: cats,
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
  /** Il mese più basso già registrato: la prova che quel taglio è possibile. */
  provenLow: number;
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
    if (take < MIN_CUT_PROPOSAL) continue;
    out.push({
      categoryId: c.id, label: c.label, icon: c.icon, color: c.color,
      amount: take, currentMonthly: c.typicalMonthly, provenLow: c.lowestMonth,
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

/**
 * Tutto quello che il modello NON deve sbagliare, già scritto.
 *
 * Sono vincoli, non colore: ogni riga qui dentro è una cosa che il modello,
 * lasciato solo con quattro numeri, aveva sbagliato — proporre di tagliare
 * l'affitto, contare una caldaia come risparmio ricorrente, promettere un
 * traguardo a dicembre come se fosse maggio.
 */
function contextNotes(ctx: SavingsContext): string[] {
  const notes: string[] = [];
  const b = ctx.breakdown;

  const untouchable = ctx.categories.filter(c =>
    (c.nature === 'fixed' || c.nature === 'periodic') && monthlyWeight(c) >= MIN_CUT_EUR);
  if (untouchable.length > 0) {
    notes.push(`NON proporre tagli su: ${untouchable
      .map(c => `${c.label} (${eur(monthlyWeight(c))} €/mese, ${c.fixedReason})`).join('; ')}.`);
  }

  notes.push(
    `Ripartizione del mese: ${eur(b.fixedMonthly)} € fissi, ${eur(b.periodicMonthly)} € da accantonare ` +
    `per spese periodiche, ${eur(b.variableMonthly)} € variabili. ` +
    `Il massimo realisticamente tagliabile è ${eur(b.reducibleMonthly)} €/mese IN TUTTO: non proporre più di così.`);

  const periodic = ctx.categories.filter(c => c.nature === 'periodic');
  if (periodic.length > 0) {
    notes.push(`Spese che tornano a intervalli: ${periodic
      .map(c => `${c.label} ogni ${c.cadenceMonths} mesi (~${eur(c.typicalMonthly)} €, ${eur(c.monthlyReserve)} €/mese da mettere da parte)`)
      .join('; ')}. Il ritmo di risparmio è già al netto di questi accantonamenti.`);
  }

  const oneOffs = ctx.categories.filter(c => c.nature === 'oneOff' && c.monthlyAvg >= MIN_CUT_EUR);
  if (oneOffs.length > 0) {
    notes.push(`Spese una tantum, già escluse dal ritmo mensile: ${oneOffs.map(c => c.label).join(', ')}. Non contarle come risparmio ricorrente.`);
  }

  const growing = ctx.categories.filter(c => c.trend === 'up' && c.nature === 'variable' && c.typicalMonthly >= MIN_CUT_EUR);
  if (growing.length > 0) {
    notes.push(`In crescita negli ultimi mesi: ${growing
      .map(c => `${c.label} +${Math.round(c.trendPct * 100)}%`).join(', ')}.`);
  }

  if (ctx.monthsOfHistory < 3) {
    notes.push(`Lo storico è di ${ctx.monthsOfHistory} ${ctx.monthsOfHistory === 1 ? 'mese' : 'mesi'}: la stima è indicativa.`);
  } else if (ctx.paceConfidence !== 'alta') {
    notes.push(`Affidabilità del ritmo: ${ctx.paceConfidence} (${ctx.monthsOfHistory} mesi di storico, medie che oscillano). Non darlo per garantito.`);
  }
  if (ctx.fixedMonthlyCost > 0) {
    notes.push(`${eur(ctx.fixedMonthlyCost)} € al mese sono già impegnati in rate, abbonamenti e ricorrenti.`);
  }
  if (ctx.worstMonthNet < 0) {
    notes.push(`In almeno un mese recente il bilancio è stato negativo (${eur(ctx.worstMonthNet)} €): il ritmo medio non è una garanzia.`);
  }
  if (ctx.runwayMonths !== null && ctx.runwayMonths < 3) {
    notes.push(`La liquidità libera copre circa ${ctx.runwayMonths} mesi di spese: prima di svuotarla, dirlo.`);
  }
  return notes;
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

  const notes = contextNotes(ctx);
  if (pace <= 0) {
    notes.push('Nei mesi misurati non è avanzato niente: senza tagli il traguardo non si sposta.');
  }
  if (ctx.periodicAdjustment > 0) {
    notes.push(`Il ritmo è già ridotto di ${eur(ctx.periodicAdjustment)} €/mese per le spese periodiche che devono ancora arrivare.`);
  }
  // Se il traguardo cade in un mese storicamente caro, dirlo prima.
  const landing = targetDateISO ?? readyByISO;
  if (landing && ctx.heavyMonths.includes(Number(landing.slice(5, 7)))) {
    notes.push('Il traguardo cade in un mese che storicamente ti costa più della media.');
  }
  for (const inst of ctx.endingInstallments) {
    if (!landing || inst.endsISO <= landing) {
      notes.push(`Da ${inst.endsISO.slice(0, 7)} si liberano ${eur(inst.monthly)} € al mese: finisce "${inst.description}".`);
    }
  }
  if (affordableNow && !fitsThisMonth) {
    notes.push('La liquidità libera basterebbe già oggi, ma la spesa non rientra nel risparmio di un mese.');
  }

  return {
    cost: r2(cost), fitsThisMonth, affordableNow,
    monthsToAfford, readyByISO, requiredMonthly, feasible, gapMonthly,
    cuts, cutsTotal, monthsWithCuts, notes: notes.slice(0, MAX_NOTES),
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
    notes.push(`Anche tagliando il massimo realistico restano ${eur(gapMonthly - cutsTotal)} € al mese scoperti.`);
  }

  return {
    goal: r2(goal), startingFrom: r2(startingFrom), targetISO, monthsAvailable,
    requiredMonthly, pace, onTrack: pace >= requiredMonthly, gapMonthly,
    cuts, cutsTotal,
    projectedAtTarget: r2(startingFrom + pace * monthsAvailable),
    notes,
  };
}
