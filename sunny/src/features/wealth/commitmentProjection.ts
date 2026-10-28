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
 * I pagamenti carta sono impegni alla scadenza; gli altri trasferimenti sono
 * esclusi e le entrate future non compensano.
 *
 * Di norma sono tutte e sole USCITE (`type: 'expense'`); con
 * `includeInvestments` entrano anche le serie di tipo `investment` — un PAC
 * esce dal conto alla sua data esattamente come una bolletta, ma NON è un
 * costo, quindi ogni evento dichiara il proprio `type` e chi somma decide.
 * L'opzione è spenta di default; Impegni e Liquidità disponibile la attivano.
 */
import { AccountDef, Transaction, TransactionType } from '../../types';
import { buildProjectedOccurrences, isPending, isExpiredTemplate } from '../../shared/recurrence';
import { resolveCreditCardTransactions, withCreditCardCashEffects } from '../../../../functions/src/domain/creditCards';

export type CommitmentAccount = Pick<AccountDef, 'id' | 'excludeFromNetWorth' | 'creditCardPolicies' | 'archived' | 'isInvestment'>;

export interface CommitmentEvent {
  date: string;
  description: string;
  /** Importo PIENO dell'occorrenza — MAI `ownShare`: la quota la applica chi somma. */
  amount: number;
  /** L'occorrenza ha una quota a carico di altri (spesa condivisa). */
  shared: boolean;
  /** Le distinte carta sono `transfer`: consumano cassa senza essere costi. */
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
  opts: { includeInvestments?: boolean; accounts?: CommitmentAccount[] } = {},
): CommitmentEvent[] {
  const accounts = opts.accounts ?? [];
  if (accounts.length) transactions = withCreditCardCashEffects(
    resolveCreditCardTransactions(transactions, accounts, todayISO), accounts);
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

  // Future investment instances may already be stored (e.g. an edited date).
  // Prefer their actual amount/account over a projection of the same occurrence.
  // Scope this to investments: expense-series handling remains unchanged.
  for (const t of transactions) {
    if (!opts.includeInvestments || t.type !== 'investment' || t.recurring || t.projected || !t.seriesId) continue;
    if (!isPending(t, todayISO) || t.date > horizonEndISO) continue;
    push(t, 'ricorrente', t.seriesId);
  }

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

  // A recurring card purchase is still an expense on its original date, but
  // its cash commitment belongs to the following statement. Treat projected
  // occurrences as temporary sources only for this cash forecast.
  const forecastSources: Transaction[] = events.filter(e => e.source.recurring || e.source.projected).map(e => {
    const { recurring: _recurring, projected: _projected, ...source } = e.source;
    return { ...source, id: `__cash_forecast__${e.seriesId ?? source.id}__${source.date}` };
  });
  const cashTransactions = accounts.length
    ? withCreditCardCashEffects(resolveCreditCardTransactions([...transactions, ...forecastSources], accounts, todayISO), accounts)
    : transactions;

  // Statement transfers consume liquidity even though they are never costs.
  for (const t of cashTransactions) {
    if (t.type !== 'transfer' || t.recurring || t.projected || !isPending(t, todayISO) || t.date > horizonEndISO) continue;
    if (!(typeof t.cashDelta === 'number' && t.cashDelta < 0) && !t.creditCardSettlement) continue;
    push(t, 'pianificata');
  }

  // Never reserve both a deferred purchase and the payment which settles it.
  const cashEvents = events.filter(e => {
    if (e.type === 'transfer') return true;
    const [source] = accounts.length ? withCreditCardCashEffects([e.source], accounts) : [e.source];
    return source.cashDelta !== 0;
  });

  // Ordinamento stabile: a parità di data resta l'ordine di inserimento.
  cashEvents.sort((a, b) => a.date.localeCompare(b.date));
  return cashEvents;
}
