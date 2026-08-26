/**
 * "Ritmo del mese" — aggregazione pura per il calendario della home.
 *
 * Un quadratino per giorno del mese: quanto è pieno dice quanto hai
 * speso quel giorno. Il mese è un parametro (`monthKey`), non è per forza
 * quello corrente: la stessa funzione alimenta la card della home e la scheda
 * che scorre lo storico, così i due non possono divergere.
 *
 * Tre stati possibili, mutuamente esclusivi:
 *
 *   - giorno PASSATO (o oggi) → intensità = spesa del giorno / spesa massima
 *     del mese, su 5 gradini fissi (RHYTHM_ALPHA);
 *   - giorno FUTURO senza impegni → cella neutra;
 *   - giorno FUTURO con impegni ("programmato") → cella tratteggiata oro.
 *
 * Le spese realizzate seguono la stessa regola del resto della dashboard:
 * `ownShare` (la quota tua, al netto di condivisioni e storni) e i movimenti
 * ancora `isPending` NON contano come spesi.
 *
 * Il "programmato" non viene ricalcolato qui: arriva già proiettato e
 * deduplicato da chi chiama (`commitmentProjection` → `availableCash`), la
 * stessa lista che alimenta la liquidità libera dell'hero. Così il calendario
 * e il numero in cima al mese non possono raccontare due storie diverse.
 */
import { Transaction, ownShare } from '../../types';
import { isPending } from '../../shared/recurrence';
import { localISO } from './categoryAnalytics';

/** Uscita futura già impegnata (quota propria), nel formato di `CommittedItem`. */
export interface ScheduledOutflow {
  date: string;
  amount: number;
  description?: string;
}

export interface RhythmDay {
  /** Giorno del mese, 1-based. */
  day: number;
  iso: string;
  /** Spesa realizzata del giorno (ownShare). */
  spent: number;
  /** Uscite già impegnate su un giorno futuro. */
  scheduled: number;
  isFuture: boolean;
  isToday: boolean;
  /** Gradino di intensità 0–4 (indice in RHYTHM_ALPHA); −1 quando non c'è spesa. */
  level: number;
  /** Descrizione della spesa più grande del giorno — per la riga di chiusura. */
  topDescription: string | null;
}

export interface MonthRhythm {
  /** Mese rappresentato, `YYYY-MM`. */
  monthKey: string;
  /** Nome del mese in italiano, minuscolo ("agosto"). */
  monthLabel: string;
  /** Nome del mese con l'anno ("agosto 2026") — serve quando si scorre. */
  monthLabelFull: string;
  /** Giorni del mese, dal 1 all'ultimo. */
  days: RhythmDay[];
  /** Celle vuote prima del giorno 1 (lunedì = prima colonna). */
  leadingBlanks: number;
  totalSpent: number;
  /** Media sui giorni TRASCORSI (oggi incluso), non sull'intero mese. */
  dailyAverage: number;
  todaySpent: number;
  /** Giorno più caro del mese; null se non si è ancora speso nulla. */
  peak: RhythmDay | null;
  /** Quanto è già programmato da domani a fine mese. */
  scheduledAhead: number;
  /** Il mese è finito: nessun giorno può ancora cambiare. */
  isClosed: boolean;
}

/** I 5 gradini di riempimento della cella (alpha sull'oro). */
export const RHYTHM_ALPHA = [0.14, 0.3, 0.45, 0.7, 0.95] as const;

/** Sopra questa soglia il numero passa al colore di contrasto. */
export const RHYTHM_INK_HI_FROM = 0.6;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Gradino 0–4 dal rapporto spesa/picco. Cinque fasce uguali. */
function levelOf(ratio: number): number {
  if (ratio <= 0.2) return 0;
  if (ratio <= 0.4) return 1;
  if (ratio <= 0.6) return 2;
  if (ratio <= 0.8) return 3;
  return 4;
}

export function buildMonthRhythm(opts: {
  transactions: Transaction[];
  /** Uscite già impegnate (quota propria) — da `computeAvailableCash`. */
  scheduled?: ScheduledOutflow[];
  now?: Date;
  /** Mese da costruire (`YYYY-MM`). Senza, il mese corrente. */
  monthKey?: string;
}): MonthRhythm {
  const now = opts.now ?? new Date();
  const todayISO = localISO(now);
  const ym = opts.monthKey ?? todayISO.slice(0, 7);
  const [year, month1] = ym.split('-').map(Number);   // month1: 1-based
  const month = month1 - 1;
  const daysInMonth = new Date(year, month1, 0).getDate();

  const spentByDay = new Array<number>(daysInMonth + 1).fill(0);
  const scheduledByDay = new Array<number>(daysInMonth + 1).fill(0);
  // Spesa singola più grande del giorno, per la riga "Giorno più caro".
  const topByDay: ({ amount: number; description: string } | null)[] = new Array(daysInMonth + 1).fill(null);

  for (const t of opts.transactions) {
    if (t.type !== 'expense') continue;
    if (t.date.slice(0, 7) !== ym) continue;
    // Programmato ≠ speso: i movimenti futuri arrivano dalla lista `scheduled`.
    if (isPending(t, todayISO)) continue;
    const day = Number(t.date.slice(8, 10));
    if (!day || day > daysInMonth) continue;
    const share = ownShare(t);
    if (share <= 0) continue;
    spentByDay[day] += share;
    const top = topByDay[day];
    if (!top || share > top.amount) topByDay[day] = { amount: share, description: t.description };
  }

  for (const s of opts.scheduled ?? []) {
    if (s.date.slice(0, 7) !== ym || s.date <= todayISO) continue;
    const day = Number(s.date.slice(8, 10));
    if (!day || day > daysInMonth) continue;
    scheduledByDay[day] += s.amount;
  }

  const peakSpent = Math.max(...spentByDay);

  const days: RhythmDay[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const spent = r2(spentByDay[day]);
    const iso = `${ym}-${String(day).padStart(2, '0')}`;
    // Passato/futuro si decidono sulla data, non sul numero del giorno: in un
    // mese chiuso nessun giorno è futuro, in uno a venire lo sono tutti.
    const isFuture = iso > todayISO;
    days.push({
      day,
      iso,
      spent,
      scheduled: r2(scheduledByDay[day]),
      isFuture,
      isToday: iso === todayISO,
      level: !isFuture && spent > 0 && peakSpent > 0 ? levelOf(spent / peakSpent) : -1,
      topDescription: topByDay[day]?.description ?? null,
    });
  }

  const elapsed = days.filter(d => !d.isFuture);
  const totalSpent = r2(elapsed.reduce((s, d) => s + d.spent, 0));
  const peak = elapsed.reduce<RhythmDay | null>(
    (best, d) => (d.spent > 0 && (!best || d.spent > best.spent) ? d : best), null);

  // Lunedì in prima colonna: getDay() è 0=domenica, quindi (giorno+6)%7.
  const first = new Date(year, month, 1);
  const leadingBlanks = (first.getDay() + 6) % 7;
  const monthLabel = new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(first);

  return {
    monthKey: ym,
    monthLabel,
    monthLabelFull: `${monthLabel} ${year}`,
    days,
    leadingBlanks,
    totalSpent,
    dailyAverage: elapsed.length > 0 ? r2(totalSpent / elapsed.length) : 0,
    todaySpent: days.find(d => d.isToday)?.spent ?? 0,
    peak,
    scheduledAhead: r2(days.reduce((s, d) => s + d.scheduled, 0)),
    isClosed: days.length > 0 && days[days.length - 1].iso < todayISO,
  };
}

/**
 * I mesi fra cui si può scorrere: dal primo con un movimento registrato fino a
 * quello corrente, **senza buchi**.
 *
 * I mesi vuoti restano nell'elenco di proposito: "a novembre non ho speso
 * niente" è un'informazione, saltarlo farebbe sembrare che manchino dei dati.
 * Il futuro non c'è: il calendario racconta quello che è successo, e un mese
 * a venire sarebbe una griglia vuota con qualche tratteggio.
 */
export function rhythmMonths(transactions: Transaction[], now?: Date): string[] {
  const todayISO = localISO(now ?? new Date());
  const current = todayISO.slice(0, 7);
  let earliest = current;
  for (const t of transactions) {
    if (t.projected || t.recurring) continue;      // template e proiezioni non sono storia
    if (t.date > todayISO) continue;
    const ym = t.date.slice(0, 7);
    if (ym < earliest) earliest = ym;
  }
  const months: string[] = [];
  let [y, m] = earliest.split('-').map(Number);
  const [cy, cm] = current.split('-').map(Number);
  while (y < cy || (y === cy && m <= cm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return months;
}

export interface MonthComparison {
  /** Speso nel mese selezionato, sui giorni confrontati. */
  current: number;
  /** Speso nel mese precedente, sugli STESSI giorni. */
  previous: number;
  delta: number;
  /** Variazione relativa; null quando il mese precedente è a zero. */
  deltaPct: number | null;
  /** Giorni confrontati quando il mese è ancora in corso; null se è chiuso. */
  throughDay: number | null;
}

/**
 * Confronto fra un mese e il precedente, a parità di giorni.
 *
 * Un mese in corso al giorno 12 confrontato con un mese intero perderebbe
 * sempre: qui il precedente viene troncato agli stessi giorni trascorsi, e la
 * scheda lo dichiara ("primi 12 giorni"). Su un mese chiuso il confronto è
 * fra totali pieni.
 */
export function compareMonths(current: MonthRhythm, previous: MonthRhythm): MonthComparison {
  const elapsed = current.days.filter(d => !d.isFuture).length;
  const throughDay = current.isClosed ? null : elapsed;
  const prevSpent = r2(
    (throughDay == null ? previous.days : previous.days.slice(0, throughDay))
      .reduce((s, d) => s + d.spent, 0),
  );
  const delta = r2(current.totalSpent - prevSpent);
  return {
    current: current.totalSpent,
    previous: prevSpent,
    delta,
    deltaPct: prevSpent > 0 ? delta / prevSpent : null,
    throughDay,
  };
}

/** Mese precedente / successivo di `YYYY-MM` (`delta` in mesi). */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
