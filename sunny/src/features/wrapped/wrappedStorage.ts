/**
 * Memoria locale del Wrapped — per DISPOSITIVO, non per account.
 *
 * "Visto" e "più tardi" sono preferenze di comodo, non dati: vivono in
 * localStorage come già fa `RecapPrompt`, così il Wrapped non costa una
 * lettura né una scrittura Firestore. Il prezzo è che chi cambia telefono
 * rivede la card una volta: accettabile per qualcosa che compare undici
 * giorni all'anno.
 *
 * La chiave porta uid e anno: su un dispositivo condiviso il Wrapped di uno
 * non liquida quello dell'altro, e l'anno dopo tutto riparte da capo senza
 * bisogno di pulire niente.
 */

const seenKey = (uid: string, year: number) => `sunny:wrapped:seen:${uid}:${year}`;
const dismissKey = (uid: string, year: number) => `sunny:wrapped:entryDismissed:${uid}:${year}`;

function read(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function write(key: string): void {
  try { localStorage.setItem(key, '1'); } catch { /* modalità privata: pazienza */ }
}

/** Il Wrapped di quest'anno è già stato guardato fino in fondo? */
export function isWrappedSeen(uid: string, year: number): boolean {
  return read(seenKey(uid, year));
}

export function markWrappedSeen(uid: string, year: number): void {
  write(seenKey(uid, year));
}

/** La card in home è già stata liquidata con "Più tardi"? */
export function isEntryDismissed(uid: string, year: number): boolean {
  return read(dismissKey(uid, year));
}

export function markEntryDismissed(uid: string, year: number): void {
  write(dismissKey(uid, year));
}

/** La card di ingresso ha ancora qualcosa da dire? */
export function shouldShowWrappedEntry(uid: string, year: number): boolean {
  return !isWrappedSeen(uid, year) && !isEntryDismissed(uid, year);
}
