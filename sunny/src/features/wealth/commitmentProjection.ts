/**
 * Proiezione condivisa degli impegni futuri (admin-only) — modulo puro.
 *
 * UNICA sorgente di verità per "che cosa è già impegnato da oggi all'orizzonte":
 * la usano sia `commitments.ts` (Impegni → prossime scadenze, somma l'importo
 * PIENO) sia `availableCash.ts` (Liquidità disponibile, somma la quota propria).
 * Prima ognuno dei due costruiva la propria lista: stesso dataset, stesso
 * orizzonte e due elenchi potenzialmente diversi. Ora l'insieme degli eventi è
 * uno solo — cambia qui, cambiano entrambe le schermate — e l'unica differenza
 * resta COME si sommano (importo pieno vs `ownShare`).
 *
 * Gli eventi sono deduplicati per (serie|data): un template e una proiezione
 * non possono mai descrivere la stessa occorrenza due volte.
 *
 * Tre sorgenti:
 *  1. la prossima occorrenza di ogni serie ricorrente ATTIVA (il template, che
 *     catch-up/Cloud Function tengono aggiornato);
 *  2. le occorrenze successive proiettate in memoria (`buildProjectedOccurrences`
 *     parte DOPO la data del template e salta ciò che è già materializzato →
 *     nessun doppio conteggio con le spese registrate);
 *  3. le uscite una-tantum già registrate con data futura (pianificate).
 * I trasferimenti non sono spese (esclusi) e le entrate future non compensano.
 *
 * Di norma sono tutte e sole USCITE (`type: 'expense'`); con
 * `includeInvestments` entrano anche le serie di tipo `investment` — un PAC
 * esce dal conto alla sua data esattamente come una bolletta, ma NON è un
 * costo, quindi ogni evento dichiara il proprio `type` e chi somma decide.
 * L'opzione è spenta di default: la liquidità disponibile continua a contare
 * le sole uscite, come prima.
 */
import { Transaction, TransactionType } from '../../types';
import { buildProjectedOccurrences, isPending, isExpiredTemplate } from '../../shared/recurrence';

export interface CommitmentEvent {
  date: string;
  description: string;
  /** Importo PIENO dell'occorrenza — MAI `ownShare`: la quota la applica chi somma. */
  amount: number;
  /** L'occorrenza ha una quota a carico di altri (spesa condivisa). */
  shared: boolean;
  /** `expense` o `investment`: un investimento esce dal conto ma non è un costo. */
  type: TransactionType;
  kind: 'ricorrente' | 'pianificata';
  /** Serie di appartenenza (assente per le una-tantum pianificate). */
  seriesId?: string;
  /** Riga sorgente (template, occorrenza proiettata o una-tantum): permette a
   *  chi somma di applicare `ownShare` senza duplicarne qui la logica. */
  source: Transaction;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** `iso` + `days` giorni, aritmetica in UTC (come il motore di ricorrenza). */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Occorrenze future deduplicate nell'intervallo (todayISO, horizonEndISO],
 * ordinate per data crescente (a parità di data, nell'ordine delle sorgenti:
 * ricorrenti prima, pianificate poi).
 */
export function buildCommitmentEvents(
  transactions: Transaction[],
  todayISO: string,
  horizonEndISO: string,
  opts: { includeInvestments?: boolean } = {},
): CommitmentEvent[] {
  const wanted = (t: Transaction) =>
    t.type === 'expense' || (opts.includeInvestments === true && t.type === 'investment');

  const events: CommitmentEvent[] = [];
  const seen = new Set<string>();

  const push = (t: Transaction, kind: CommitmentEvent['kind'], seriesId?: string) => {
    const key = `${seriesId ?? t.id}|${t.date}`;
    if (seen.has(key)) return;
    seen.add(key);
    events.push({
      date: t.date,
      description: t.description,
      amount: r2(t.amount),
      shared: (t.shared ?? 0) > 0,
      type: t.type,
      kind,
      seriesId,
      source: t,
    });
  };

  // 1. Prossima scadenza di ogni serie ATTIVA (la data del template stesso).
  for (const t of transactions) {
    if (!wanted(t) || !t.recurring || t.projected || isExpiredTemplate(t)) continue;
    if (t.date <= todayISO || t.date > horizonEndISO) continue;
    push(t, 'ricorrente', t.seriesId ?? t.id);
  }

  // 2. Occorrenze successive della stessa serie dentro l'orizzonte.
  for (const p of buildProjectedOccurrences(transactions, todayISO, horizonEndISO)) {
    if (!wanted(p)) continue;
    push(p, 'ricorrente', p.seriesId ?? p.id);
  }

  // 3. Uscite una-tantum già registrate con data futura. Le istanze di serie
  //    (seriesId) sono escluse: il loro futuro è coperto sopra e il loro passato
  //    è già nel saldo.
  for (const t of transactions) {
    if (!wanted(t) || t.recurring || t.seriesId || t.projected) continue;
    if (!isPending(t, todayISO) || t.date > horizonEndISO) continue;
    push(t, 'pianificata');
  }

  // Ordinamento stabile: a parità di data resta l'ordine di inserimento.
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}
