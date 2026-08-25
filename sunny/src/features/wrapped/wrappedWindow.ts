/**
 * Finestra del Sunny Wrapped — modulo puro.
 *
 * Il Wrapped non è una campagna una tantum da accendere a mano ogni dicembre:
 * il codice resta in app e la retrospettiva si apre DA SOLA il 20 dicembre di
 * ogni anno, restando disponibile fino al 31. Nessun anno è scritto nel codice
 * — l'anno raccontato è sempre quello della data corrente — quindi il 2027
 * arriva senza che nessuno tocchi niente.
 *
 * Il periodo raccontato NON si ferma ai mesi chiusi: va dal 1° gennaio alla
 * fine del mese in corso e comprende sia ciò che è già avvenuto sia ciò che è
 * già programmato (previsti e ricorrenti proiettati). A fine dicembre questo
 * significa l'anno intero, dicembre compreso: chi guarda il Wrapped il 20
 * dicembre vede l'anno che sta per chiudersi, non undici dodicesimi.
 *
 * L'admin può aprirlo in qualsiasi momento dell'anno (voce in Impostazioni):
 * lì la finestra non conta, ma la regola del periodo sì — a marzo racconta
 * gennaio-marzo, con marzo che include il programmato.
 *
 * Modulo puro: la data arriva sempre come `todayISO`, mai da `new Date()`.
 */

/** Il Wrapped vive a dicembre. */
export const WRAPPED_MONTH = 12;
/** Giorno di apertura automatica. */
export const WRAPPED_OPEN_DAY = 20;
/** Ultimo giorno in cui resta aperto. */
export const WRAPPED_LAST_DAY = 31;

const pad = (n: number) => String(n).padStart(2, '0');

/** Giorni del mese (1-based) di un anno — gestisce i bisestili. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** `YYYY-MM-DD` valida? Solo forma e intervalli, non il calendario. */
function isISODate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [, m, d] = iso.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** L'anno il cui Wrapped è in finestra a `todayISO`; null fuori stagione. */
export function wrappedSeasonYear(todayISO: string): number | null {
  if (!isISODate(todayISO)) return null;
  const [y, m, d] = todayISO.split('-').map(Number);
  if (m !== WRAPPED_MONTH) return null;
  if (d < WRAPPED_OPEN_DAY || d > WRAPPED_LAST_DAY) return null;
  return y;
}

/** Siamo dentro la finestra di apertura automatica? */
export function isWrappedInSeason(todayISO: string): boolean {
  return wrappedSeasonYear(todayISO) !== null;
}

/**
 * Il Wrapped di `year` è apribile a `todayISO`?
 *
 * Si racconta SOLO l'anno in corso: un deep link vecchio (`/wrapped/2026`
 * aperto nel 2027) non deve riaprire una retrospettiva fuori stagione con
 * numeri che nel frattempo non significano più niente.
 * L'admin salta la finestra, non l'anno.
 */
export function canOpenWrapped(
  year: number,
  todayISO: string,
  opts: { admin?: boolean } = {},
): boolean {
  if (!Number.isInteger(year) || !isISODate(todayISO)) return false;
  if (year !== Number(todayISO.slice(0, 4))) return false;
  return opts.admin === true || isWrappedInSeason(todayISO);
}

/**
 * Ultimo giorno raccontato, incluso: la fine del mese in corso per l'anno
 * corrente, il 31 dicembre per un anno già chiuso. È il confine entro cui il
 * "programmato" viene contato — oltre, si starebbe raccontando un anno che
 * ancora non esiste.
 */
export function wrappedPeriodEnd(year: number, todayISO: string): string {
  const [ty, tm] = todayISO.split('-').map(Number);
  if (year < ty) return `${year}-12-31`;
  // Anno futuro: non c'è niente da raccontare, ma la funzione resta totale.
  const month = year === ty ? tm : 1;
  return `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
}

/** Quanti mesi copre il racconto (1–12). */
export function wrappedMonthsCovered(year: number, todayISO: string): number {
  return Number(wrappedPeriodEnd(year, todayISO).slice(5, 7));
}
