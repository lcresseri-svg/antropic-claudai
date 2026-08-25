/**
 * Sunny Wrapped — costruzione del racconto dell'anno, modulo PURO.
 *
 * Nessuna query nuova, nessuna scrittura: tutto nasce dalle transazioni già in
 * memoria. I totali NON sono ricalcolati qui — arrivano da `monthStats`
 * (features/insights/insightsEngine), la stessa funzione che alimenta
 * dashboard, recap mensile e insight. È l'unico modo perché il Wrapped non
 * possa raccontare un anno diverso da quello che il resto dell'app mostra.
 *
 * PERIODO RACCONTATO: dal 1° gennaio alla fine del mese in corso
 * (`wrappedPeriodEnd`), e dentro quel periodo conta **tutto**: ciò che è già
 * avvenuto e ciò che è già programmato — movimenti futuri registrati
 * (`isPending`) e occorrenze proiettate delle serie ricorrenti. Aperto il 20
 * dicembre, il racconto copre quindi l'anno intero, dicembre compreso: chi lo
 * guarda si aspetta il suo anno, non undici dodicesimi di anno.
 *
 * Il prezzo di questa scelta è che una parte dei numeri è una previsione, non
 * un consuntivo. Il modello lo dichiara (`plannedCount`, `hasPlanned`) e la UI
 * lo scrive in copertina e nel riepilogo: un numero previsto spacciato per
 * fatto è l'unico modo di perdere la fiducia di chi legge.
 *
 * REGOLA DELLE STORIE: una storia senza un dato valido non viene mostrata e le
 * barre in cima si adeguano (`stories`). È anche la risposta al caso "pochi
 * dati": con un mese di storia restano copertina, speso, categoria n.1 e
 * movimenti, senza bisogno di una versione ridotta a parte.
 *
 * Purezza: la data arriva sempre come `todayISO`, mai da `new Date()`.
 */
import { Transaction, CategoryDef, AccountDef, ownShare } from '../../types';
import { isPending } from '../../shared/recurrence';
import { monthStats } from '../insights/insightsEngine';
import { wrappedPeriodEnd } from './wrappedWindow';

/** Sotto questo numero di movimenti il Wrapped non si propone da solo: un
 *  racconto dell'anno costruito su quattro spese è una presa in giro.
 *  L'admin lo apre lo stesso, con i dati che ci sono. */
export const WRAPPED_MIN_TX = 20;

/** Quante categorie stanno in chiaro nel riepilogo prima di "Altre N"
 *  (stessa soglia di SpendingBreakdownCard). */
export const WRAPPED_TOP_CATS = 4;

export type WrappedStoryId =
  | 'cover' | 'expense' | 'topCategory' | 'peakMonth' | 'savingsRate'
  | 'invested' | 'netWorth' | 'streak' | 'largest' | 'count' | 'vsPrev';

export interface WrappedCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  total: number;
  /** Quota sulle uscite dell'anno, 0–1. */
  share: number;
}

export interface WrappedMonth {
  /** `YYYY-MM`. */
  key: string;
  /** 1–12. */
  month: number;
  /** Iniziale del mese, per l'istogramma ("G", "F", "M", …). */
  initial: string;
  label: string;
  income: number;
  expense: number;
  invest: number;
  /** Flusso netto del mese (cashIn − cashOut), come nel resto dell'app. */
  net: number;
  txCount: number;
}

export interface WrappedLargest {
  amount: number;
  description: string;
  categoryLabel: string;
  categoryIcon: string;
  categoryColor: string;
  date: string;
  accountLabel: string;
  /** La spesa è ancora da avvenire (programmata). */
  planned: boolean;
}

export interface WrappedVsPrev {
  /** Variazione delle uscite sullo stesso periodo dell'anno prima (−0.062 = −6,2%). */
  expensePct: number | null;
  /** Variazione del risparmiato. */
  savedPct: number | null;
  prevExpense: number;
  prevSaved: number;
}

export interface WrappedGoal {
  /** Importo mensile preselezionato nello stepper. */
  suggested: number;
  /** I tre importi proposti come chip, crescenti. */
  options: number[];
  /** Passo del ± dello stepper. */
  step: number;
}

export interface YearWrapped {
  year: number;
  /** Ultimo giorno raccontato, incluso. */
  periodEndISO: string;
  /** Mesi coperti, 1–12. */
  monthsCovered: number;
  /** Giorni coperti (dal 1° gennaio a `periodEndISO`). */
  daysCovered: number;

  txCount: number;
  realizedCount: number;
  /** Movimenti già programmati ma non ancora avvenuti, compresi nei totali. */
  plannedCount: number;
  hasPlanned: boolean;
  txPerDay: number;
  /** Abbastanza dati perché il Wrapped si proponga da solo. */
  hasEnough: boolean;

  incomeTotal: number;
  expenseTotal: number;
  expenseMonthlyAvg: number;
  saved: number;
  savedMonthlyAvg: number;
  /** Risparmiato / entrate, 0–1. null senza entrate. */
  savingsRate: number | null;
  investedTotal: number;
  /** Mesi con un versamento netto positivo. */
  investedMonths: number;
  investedShareOfIncome: number | null;

  months: WrappedMonth[];
  peakMonth: WrappedMonth | null;
  lightestMonth: WrappedMonth | null;
  /** Mesi consecutivi chiusi in positivo, contati dall'ultimo all'indietro. */
  savingStreak: number;

  /** Tutte le categorie di spesa, dalla più cara. */
  categories: WrappedCategory[];
  /** Quel che resta oltre le prime WRAPPED_TOP_CATS. */
  otherCategories: { count: number; total: number };

  netWorthStart: number | null;
  netWorthEnd: number | null;
  netWorthDelta: number | null;
  netWorthDeltaPct: number | null;
  netWorthSeries: number[];

  largest: WrappedLargest | null;
  vsPrevYear: WrappedVsPrev | null;
  goal: WrappedGoal;

  /** Le storie con un dato valido, nell'ordine di racconto. */
  stories: WrappedStoryId[];
}

export interface YearWrappedInput {
  /** Documenti reali, già senza template scaduti (`tx.transactions`). */
  transactions: Transaction[];
  /** Occorrenze virtuali delle serie ricorrenti (`editing.projected`).
   *  Sono generate STRETTAMENTE dopo la data del template, quindi non possono
   *  duplicare un documento reale. */
  projected?: Transaction[];
  getCat: (id: string) => CategoryDef;
  getAcc: (id: string) => AccountDef;
  year: number;
  todayISO: string;
  /** Serie del patrimonio, un punto per mese, già calcolata da
   *  `buildWealthHistory` — qui non si ricalcola il patrimonio. */
  netWorth?: { date: string; total: number }[];
}

const MS_DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

/** Iniziali dei mesi in italiano — scritte a mano perché due coppie
 *  coincidono (Gennaio/Giugno, Marzo/Maggio, Aprile/Agosto) e vanno lette
 *  insieme alla posizione, non da sole. */
const MONTH_INITIALS = ['G', 'F', 'M', 'A', 'M', 'G', 'L', 'A', 'S', 'O', 'N', 'D'];

function monthLabel(year: number, month: number): string {
  const s = new Date(year, month - 1, 1).toLocaleDateString('it-IT', { month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Variazione relativa; null quando il riferimento è 0 (niente da cui variare). */
function pct(value: number, ref: number): number | null {
  return Math.abs(ref) < 0.005 ? null : (value - ref) / Math.abs(ref);
}

/** I movimenti dell'anno dentro il periodo raccontato, separati per stato. */
function collect(
  input: YearWrappedInput,
  startISO: string,
  endISO: string,
): { realized: Transaction[]; planned: Transaction[] } {
  const { transactions, projected = [], todayISO } = input;
  const realized: Transaction[] = [];
  const planned: Transaction[] = [];
  const inRange = (d: string) => d >= startISO && d <= endISO;

  for (const t of transactions) {
    // Le proiezioni arrivano dalla loro lista: qui ci sono solo documenti.
    if (t.projected || !inRange(t.date)) continue;
    (isPending(t, todayISO) ? planned : realized).push(t);
  }
  for (const t of projected) {
    if (!inRange(t.date)) continue;
    planned.push(t);
  }
  return { realized, planned };
}

/** Totali per mese, calcolati con la stessa `monthStats` del resto dell'app. */
function buildMonths(txs: Transaction[], year: number, monthsCovered: number): WrappedMonth[] {
  const out: WrappedMonth[] = [];
  for (let m = 1; m <= monthsCovered; m++) {
    const key = `${year}-${pad(m)}`;
    const s = monthStats(txs, key);
    out.push({
      key, month: m,
      initial: MONTH_INITIALS[m - 1],
      label: monthLabel(year, m),
      income: r2(s.income), expense: r2(s.expense), invest: r2(s.invest),
      net: r2(s.savings), txCount: s.txCount,
    });
  }
  return out;
}

function buildCategories(txs: Transaction[], getCat: YearWrappedInput['getCat'], expenseTotal: number): WrappedCategory[] {
  const totals = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + ownShare(t));
  }
  return [...totals.entries()]
    .map(([id, total]) => {
      const cat = getCat(id);
      return {
        id, label: cat.label, icon: cat.icon, color: cat.color,
        total: r2(total),
        share: expenseTotal > 0 ? total / expenseTotal : 0,
      };
    })
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

function buildLargest(
  realized: Transaction[],
  planned: Transaction[],
  getCat: YearWrappedInput['getCat'],
  getAcc: YearWrappedInput['getAcc'],
): WrappedLargest | null {
  let best: Transaction | null = null;
  let bestAmount = 0;
  let bestPlanned = false;
  const scan = (list: Transaction[], isPlanned: boolean) => {
    for (const t of list) {
      if (t.type !== 'expense') continue;
      const amount = ownShare(t);
      if (amount > bestAmount) { best = t; bestAmount = amount; bestPlanned = isPlanned; }
    }
  };
  scan(realized, false);
  scan(planned, true);
  if (!best) return null;
  // `best` è stato assegnato dentro la closure: TS non lo sa.
  const t = best as Transaction;
  const cat = getCat(t.category);
  return {
    amount: r2(bestAmount),
    description: t.description.trim() || cat.label,
    categoryLabel: cat.label, categoryIcon: cat.icon, categoryColor: cat.color,
    date: t.date, accountLabel: getAcc(t.account).label,
    planned: bestPlanned,
  };
}

/**
 * Confronto con l'anno prima SUGLI STESSI MESI: a dicembre è dodici contro
 * dodici, lanciato a marzo dall'admin è tre contro tre. Confrontare un anno
 * intero con un pezzo d'anno è il modo più facile di mentire con numeri veri.
 */
function buildVsPrev(input: YearWrappedInput, monthsCovered: number, expense: number, saved: number): WrappedVsPrev | null {
  const prevYear = input.year - 1;
  const start = `${prevYear}-01-01`;
  const end = `${prevYear}-${pad(monthsCovered)}-31`;
  const prevTx = input.transactions.filter(t => !t.projected && t.date >= start && t.date <= end);
  if (prevTx.length === 0) return null;

  let prevExpense = 0, prevSaved = 0;
  for (let m = 1; m <= monthsCovered; m++) {
    const s = monthStats(prevTx, `${prevYear}-${pad(m)}`);
    prevExpense += s.expense;
    prevSaved += s.savings;
  }
  return {
    expensePct: pct(expense, prevExpense),
    savedPct: pct(saved, prevSaved),
    prevExpense: r2(prevExpense), prevSaved: r2(prevSaved),
  };
}

/**
 * Obiettivo suggerito per l'anno prossimo: la media mensile davvero
 * risparmiata, arrotondata, con un'opzione sotto e una sopra. Si parte da
 * quello che è successo, non da un numero tondo scelto da noi — un obiettivo
 * irraggiungibile viene disatteso al primo mese e poi ignorato per sempre.
 */
function buildGoal(savedMonthlyAvg: number): WrappedGoal {
  const rounded = Math.round(Math.max(0, savedMonthlyAvg) / 100) * 100;
  const base = Math.max(100, rounded);
  const step = base >= 500 ? 200 : 100;
  // Sotto lo zero non si scende: se il passo mangerebbe tutta la base, le tre
  // proposte salgono invece di scendere.
  const options = base - step > 0
    ? [base - step, base, base + step]
    : [base, base + step, base + 2 * step];
  return { suggested: base, options, step: 50 };
}

export function buildYearWrapped(input: YearWrappedInput): YearWrapped {
  const { year, todayISO, getCat, getAcc, netWorth = [] } = input;
  const periodEndISO = wrappedPeriodEnd(year, todayISO);
  const startISO = `${year}-01-01`;
  const monthsCovered = Number(periodEndISO.slice(5, 7));
  const daysCovered = Math.round(
    (Date.parse(`${periodEndISO}T00:00:00Z`) - Date.parse(`${startISO}T00:00:00Z`)) / MS_DAY,
  ) + 1;

  const { realized, planned } = collect(input, startISO, periodEndISO);
  const all = [...realized, ...planned];

  const months = buildMonths(all, year, monthsCovered);
  const incomeTotal = r2(months.reduce((s, m) => s + m.income, 0));
  const expenseTotal = r2(months.reduce((s, m) => s + m.expense, 0));
  const investedTotal = r2(months.reduce((s, m) => s + m.invest, 0));
  const saved = r2(months.reduce((s, m) => s + m.net, 0));

  const withExpense = months.filter(m => m.expense > 0);
  const peakMonth = withExpense.length ? withExpense.reduce((a, b) => (b.expense > a.expense ? b : a)) : null;
  const lightestMonth = withExpense.length ? withExpense.reduce((a, b) => (b.expense < a.expense ? b : a)) : null;

  const withData = months.filter(m => m.txCount > 0);
  let savingStreak = 0;
  for (let i = months.length - 1; i >= 0; i--) {
    if (months[i].txCount === 0 || months[i].net <= 0) break;
    savingStreak++;
  }

  const categories = buildCategories(all, getCat, expenseTotal);
  const head = categories.slice(0, WRAPPED_TOP_CATS);
  const tail = categories.slice(WRAPPED_TOP_CATS);
  const otherCategories = {
    count: tail.length,
    total: r2(tail.reduce((s, c) => s + c.total, 0)),
  };

  const series = netWorth.filter(p => p.date >= startISO && p.date <= periodEndISO).map(p => p.total);
  const netWorthStart = series.length >= 2 ? series[0] : null;
  const netWorthEnd = series.length >= 2 ? series[series.length - 1] : null;
  const netWorthDelta = netWorthStart !== null && netWorthEnd !== null ? r2(netWorthEnd - netWorthStart) : null;
  const netWorthDeltaPct = netWorthStart !== null && netWorthEnd !== null ? pct(netWorthEnd, netWorthStart) : null;

  const txCount = all.length;
  const savedMonthlyAvg = monthsCovered > 0 ? r2(saved / monthsCovered) : 0;

  const wrapped: YearWrapped = {
    year, periodEndISO, monthsCovered, daysCovered,
    txCount, realizedCount: realized.length, plannedCount: planned.length,
    hasPlanned: planned.length > 0,
    txPerDay: daysCovered > 0 ? txCount / daysCovered : 0,
    hasEnough: txCount >= WRAPPED_MIN_TX,

    incomeTotal, expenseTotal,
    expenseMonthlyAvg: monthsCovered > 0 ? r2(expenseTotal / monthsCovered) : 0,
    saved, savedMonthlyAvg,
    savingsRate: incomeTotal > 0 ? saved / incomeTotal : null,
    investedTotal,
    investedMonths: months.filter(m => m.invest > 0).length,
    investedShareOfIncome: incomeTotal > 0 ? investedTotal / incomeTotal : null,

    months, peakMonth, lightestMonth, savingStreak,
    categories, otherCategories,

    netWorthStart, netWorthEnd, netWorthDelta, netWorthDeltaPct,
    netWorthSeries: series,

    largest: buildLargest(realized, planned, getCat, getAcc),
    vsPrevYear: buildVsPrev(input, monthsCovered, expenseTotal, saved),
    goal: buildGoal(savedMonthlyAvg),

    stories: [],
  };

  wrapped.stories = pickStories(wrapped, withData.length, withExpense.length);
  return wrapped;
}

/** Le storie che hanno davvero qualcosa da dire, nell'ordine di racconto. */
function pickStories(w: YearWrapped, monthsWithData: number, monthsWithExpense: number): WrappedStoryId[] {
  const out: WrappedStoryId[] = ['cover'];
  if (w.expenseTotal > 0) out.push('expense');
  if (w.categories.length > 0) out.push('topCategory');
  // Un "mese più caro" ha senso solo se c'è un mese più leggero da cui distinguerlo.
  if (monthsWithExpense >= 2) out.push('peakMonth');
  if (w.savingsRate !== null) out.push('savingsRate');
  if (w.investedTotal > 0) out.push('invested');
  if (w.netWorthSeries.length >= 2) out.push('netWorth');
  // Una striscia di un mese non è una striscia.
  if (monthsWithData >= 3 && w.savingStreak >= 2) out.push('streak');
  if (w.largest) out.push('largest');
  if (w.txCount > 0) out.push('count');
  if (w.vsPrevYear && (w.vsPrevYear.expensePct !== null || w.vsPrevYear.savedPct !== null)) out.push('vsPrev');
  return out;
}
