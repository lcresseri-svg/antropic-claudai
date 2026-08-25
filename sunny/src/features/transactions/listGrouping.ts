/**
 * Raggruppamento della lista Movimenti — modulo puro.
 *
 * La vista di default non è più "un mese, una lista lunga" ma due livelli:
 * un'intestazione di mese (con il netto e la sua barra) e sotto una card per
 * GIORNO. Leggere "Oggi · 24 agosto — 41 €" costa meno che ricostruire la
 * stessa cosa scorrendo trenta righe datate.
 *
 * L'ordine dei mesi e dei giorni segue ESATTAMENTE quello delle righe che
 * arrivano, cioè l'ordinamento scelto dall'utente: qui non si riordina nulla,
 * senza eccezioni.
 *
 * In particolare i giorni fatti di soli movimenti PROGRAMMATI restano al loro
 * posto cronologico — in cima quando la lista va dal più recente al più
 * vecchio, in fondo quando va al contrario. Prima venivano spinti in coda al
 * mese; era sbagliato due volte: rompeva la cronologia dentro il mese (dopo il
 * 28 previsto si tornava indietro al 24 fatto) e nascondeva in fondo proprio
 * le uniche righe su cui si può ancora agire. Che non siano ancora successi lo
 * dice già la loro etichetta oro "Programmato", non serve esiliarli.
 */
import { Transaction } from '../../types';

export interface DayGroup {
  iso: string;
  txs: Transaction[];
  /** Il giorno contiene SOLO movimenti previsti (proiezioni o pianificati). */
  upcoming: boolean;
}

export interface MonthSection {
  /** `YYYY-MM`. */
  ym: string;
  txs: Transaction[];
  days: DayGroup[];
  realizedCount: number;
  upcomingCount: number;
}

/**
 * @param rows        righe già filtrate e ordinate dalla lista
 * @param isUpcoming  predicato "è una previsione" (proiezione o pianificato)
 */
export function buildMonthSections(
  rows: Transaction[],
  isUpcoming: (t: Transaction) => boolean,
): MonthSection[] {
  const months = new Map<string, Map<string, Transaction[]>>();
  for (const t of rows) {
    const ym = t.date.slice(0, 7);
    let days = months.get(ym);
    if (!days) months.set(ym, (days = new Map()));
    const list = days.get(t.date);
    if (list) list.push(t);
    else days.set(t.date, [t]);
  }

  return [...months.entries()].map(([ym, days]) => {
    const groups: DayGroup[] = [...days.entries()].map(([iso, txs]) => ({
      iso, txs, upcoming: txs.every(isUpcoming),
    }));
    const txs = groups.flatMap(g => g.txs);
    const upcomingCount = txs.filter(isUpcoming).length;
    return {
      ym, txs, days: groups,
      realizedCount: txs.length - upcomingCount,
      upcomingCount,
    };
  });
}

const DAY_MS = 86_400_000;

/** Giorni interi fra due date ISO (positivo = `iso` è nel futuro). */
export function daysBetween(iso: string, todayISO: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayISO}T00:00:00Z`)) / DAY_MS);
}

/** "24 agosto" — giorno e mese per esteso, senza anno. */
export function longDayLabel(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })
    .format(new Date(`${iso}T00:00:00`));
}

/** "Oggi · 24 agosto" · "Ieri · 23 agosto" · "7 agosto". */
export function dayLabel(iso: string, todayISO: string): string {
  const long = longDayLabel(iso);
  const delta = daysBetween(iso, todayISO);
  if (delta === 0) return `Oggi · ${long}`;
  if (delta === -1) return `Ieri · ${long}`;
  if (delta === 1) return `Domani · ${long}`;
  return long;
}

/** "oggi" · "domani" · "fra 4 giorni" — per la meta dei movimenti previsti. */
export function relativeDayLabel(iso: string, todayISO: string): string {
  const delta = daysBetween(iso, todayISO);
  if (delta <= 0) return 'oggi';
  if (delta === 1) return 'domani';
  return `fra ${delta} giorni`;
}
