/**
 * Ordine dei blocchi della home — modulo puro.
 *
 * L'hero NON è riordinabile: è la risposta alla domanda che la schermata pone
 * ("quanto posso spendere?") e spostarlo più in basso vorrebbe dire farne una
 * schermata diversa. Tutto quello che sta sotto, invece, è preferenza.
 *
 * L'ordine salvato è una lista di id. Viene sempre RICONCILIATO con i blocchi
 * che esistono davvero: id sconosciuti (una versione futura che ne toglie uno)
 * vengono scartati e i blocchi nuovi, che un ordine salvato in passato non può
 * conoscere, finiscono in coda nell'ordine di default. Così un ordine vecchio
 * non fa mai sparire un blocco.
 */

export type HomeBlockId = 'patrimonio' | 'ritmo' | 'uscite' | 'mossa';

export const HOME_BLOCKS: { id: HomeBlockId; label: string; hint: string }[] = [
  { id: 'patrimonio', label: 'Patrimonio netto', hint: 'Quanto hai, e come si muove' },
  { id: 'ritmo', label: 'Ritmo del mese', hint: 'Il calendario delle spese' },
  { id: 'uscite', label: 'Dove vanno i soldi', hint: 'La torta delle uscite' },
  { id: 'mossa', label: 'Prossima mossa', hint: 'Il consiglio più importante' },
];

export const DEFAULT_HOME_ORDER: HomeBlockId[] = HOME_BLOCKS.map(b => b.id);

const KNOWN = new Set<string>(DEFAULT_HOME_ORDER);

/** Ordine effettivo: quello salvato, ripulito e completato con i mancanti. */
export function resolveHomeOrder(saved: readonly string[] | undefined | null): HomeBlockId[] {
  if (!saved || saved.length === 0) return [...DEFAULT_HOME_ORDER];
  const seen = new Set<string>();
  const out: HomeBlockId[] = [];
  for (const id of saved) {
    if (!KNOWN.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as HomeBlockId);
  }
  for (const id of DEFAULT_HOME_ORDER) if (!seen.has(id)) out.push(id);
  return out;
}

/** Sposta un blocco di una posizione. Fuori dai bordi non fa nulla. */
export function moveBlock(order: readonly HomeBlockId[], id: HomeBlockId, delta: -1 | 1): HomeBlockId[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  const next = [...order];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** L'ordine è quello di default? Serve a non salvare preferenze inutili. */
export function isDefaultOrder(order: readonly HomeBlockId[]): boolean {
  return order.length === DEFAULT_HOME_ORDER.length
    && order.every((id, i) => id === DEFAULT_HOME_ORDER[i]);
}
