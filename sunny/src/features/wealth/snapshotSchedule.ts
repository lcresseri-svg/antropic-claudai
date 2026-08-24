/**
 * Cadenza degli snapshot di patrimonio — modulo puro.
 *
 * Lo snapshot esiste per una ragione sola: costruire uno STORICO che i dati
 * non hanno. Il controvalore degli investimenti vive solo come "valore di
 * oggi" (`CategoryDef.currentValue`) e le rivalutazioni inserite a mano non
 * lasciano traccia datata: senza fotografie periodiche, il passato non è
 * ricostruibile: si può solo riproiettare il versato all'indietro.
 *
 * Cadenza settimanale, misurata in GIORNI trascorsi e non in settimane di
 * calendario: chi apre l'app ogni dieci giorni deve comunque avere un punto
 * ogni volta, e chi la apre tre volte al giorno non deve scriverne tre.
 */

const DAY_MS = 86_400_000;

/** Giorni pieni fra due chiavi `YYYY-MM-DD`, in UTC (niente ora legale di mezzo). */
export function daysBetweenKeys(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export const SNAPSHOT_EVERY_DAYS = 7;

/**
 * Va scritta una fotografia oggi?
 *
 * @param lastKey  ultimo giorno fotografato da QUESTO dispositivo, o null
 * @param todayKey giorno corrente (Europe/Rome)
 *
 * Una data futura in `lastKey` (orologio spostato indietro, backup ripristinato)
 * non deve bloccare gli snapshot per sempre: la trattiamo come "mai fatto".
 */
export function shouldWriteSnapshot(
  lastKey: string | null,
  todayKey: string,
  everyDays: number = SNAPSHOT_EVERY_DAYS,
): boolean {
  if (!lastKey) return true;
  const elapsed = daysBetweenKeys(lastKey, todayKey);
  if (elapsed < 0) return true;
  return elapsed >= everyDays;
}
