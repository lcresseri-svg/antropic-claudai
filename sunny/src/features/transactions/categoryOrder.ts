/**
 * Ordine delle categorie per USO reale — modulo puro.
 *
 * L'ordine manuale (il drag in Impostazioni) è una preferenza dichiarata una
 * volta e poi dimenticata: dopo qualche mese le categorie che si toccano
 * davvero non sono più le prime della fila. Qui l'ordine lo decide il
 * comportamento — quante volte una categoria è stata usata e quanto di
 * recente — e l'ordine manuale resta come tie-break e come default a freddo.
 *
 * Il punteggio è una somma di pesi con DECADIMENTO ESPONENZIALE: ogni
 * transazione qualificante vale `0.5 ^ (giorni / USAGE_HALF_LIFE_DAYS)`, cioè
 * dimezza il proprio peso ogni 30 giorni. Non è né un conteggio né una media,
 * ed è questo che lo rende leggibile: dieci spese di due mesi fa
 * (10 × 0,25 = 2,5) battono ancora due spese di ieri (2 × 0,98 = 1,95), ma una
 * singola spesa di ieri batte dieci spese uscite dalla finestra dei 180 giorni,
 * che non contano affatto.
 *
 * Sotto USAGE_MIN_TRANSACTIONS transazioni qualificanti non si riordina nulla
 * (cold start): con pochi dati il punteggio racconterebbe il rumore invece
 * dell'abitudine, e chi ha appena sistemato le proprie categorie a mano si
 * aspetta di ritrovarle in quell'ordine.
 *
 * Modulo puro in ogni senso: la data di riferimento arriva sempre come
 * `todayISO` (nessun `new Date()` qui dentro, così i test non dipendono
 * dall'orologio) e nessun input viene mutato.
 */
import { CategoryDef, Transaction, TransactionType } from '../../types';
import { isPending } from '../../shared/recurrence';

/** Dopo questi giorni una transazione pesa la metà. */
export const USAGE_HALF_LIFE_DAYS = 30;
/** Oltre questa distanza una transazione non entra affatto nel punteggio. */
export const USAGE_WINDOW_DAYS = 180;
/** Sotto questo numero di transazioni qualificanti si resta sull'ordine manuale. */
export const USAGE_MIN_TRANSACTIONS = 10;

const DAY_MS = 86_400_000;

/** Una transazione ammessa al punteggio, ridotta a ciò che serve. */
interface Usage {
  category: string;
  /** Giorni interi trascorsi fra la data della transazione e `todayISO`. */
  days: number;
}

/** Giorni interi trascorsi da `iso` a `todayISO`; NaN se una delle due non è
 *  una data valida (documento sporco: viene semplicemente scartato). */
function daysAgo(iso: string, todayISO: string): number {
  return Math.round(
    (Date.parse(`${todayISO}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / DAY_MS,
  );
}

/**
 * Le transazioni che contano come "uso" di una categoria.
 *
 * Ammissibilità:
 *   - stesso genere della categoria che stiamo ordinando;
 *   - REALIZZATE: `isPending` è lo stesso filtro usato ovunque nell'app, così
 *     un previsto non fa salire una categoria prima che la spesa esista
 *     davvero; le righe `projected` sono proiezioni di sola vista e non sono
 *     documenti;
 *   - dentro la finestra: fra 0 e USAGE_WINDOW_DAYS giorni fa. Il limite a 0
 *     scarta anche i TEMPLATE SCADUTI di una serie finita, che `isPending`
 *     lascia passare ma che sono per costruzione datati nel futuro;
 *   - con una categoria: uno storno (che eredita quella della spesa) o un
 *     documento senza categoria non è evidenza di uso.
 *
 * TODO: quando arriverà la feature "pagamenti da verificare", escludere anche
 * le transazioni con `status === 'da_verificare'`: finché l'utente non le ha
 * confermate non sono un'abitudine, sono un'ipotesi. Il campo non esiste
 * ancora, quindi il controllo non è scritto qui.
 */
function qualifying(
  transactions: Transaction[],
  kind: TransactionType,
  todayISO: string,
): Usage[] {
  const out: Usage[] = [];
  for (const t of transactions) {
    if (t.type !== kind) continue;
    if (t.projected || isPending(t, todayISO)) continue;
    if (!t.category) continue;
    const days = daysAgo(t.date, todayISO);
    if (!Number.isFinite(days) || days < 0 || days > USAGE_WINDOW_DAYS) continue;
    out.push({ category: t.category, days });
  }
  return out;
}

function scoreFrom(usages: Usage[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const u of usages) {
    const weight = Math.pow(0.5, u.days / USAGE_HALF_LIFE_DAYS);
    scores.set(u.category, (scores.get(u.category) ?? 0) + weight);
  }
  return scores;
}

/** Punteggio d'uso per categoria: somma dei pesi con decadimento esponenziale
 *  (emivita USAGE_HALF_LIFE_DAYS) sulle transazioni realizzate degli ultimi
 *  USAGE_WINDOW_DAYS giorni. Ritorna una Map categoryId -> score; le categorie
 *  mai usate semplicemente non compaiono. */
export function scoreCategoryUsage(
  transactions: Transaction[],
  kind: TransactionType,
  todayISO: string,
): Map<string, number> {
  return scoreFrom(qualifying(transactions, kind, todayISO));
}

/** Riordina i CategoryDef per score decrescente; a parità di score (incluso
 *  score 0) conserva l'ordine dell'array in ingresso, che è l'ordine manuale
 *  dell'utente. Se le transazioni qualificanti sono < USAGE_MIN_TRANSACTIONS
 *  ritorna `cats` invariato (cold start). Funzione pura, non muta l'input. */
export function orderCategoriesByUsage(
  cats: CategoryDef[],
  transactions: Transaction[],
  kind: TransactionType,
  todayISO: string,
): CategoryDef[] {
  const usages = qualifying(transactions, kind, todayISO);
  if (usages.length < USAGE_MIN_TRANSACTIONS) return cats;
  const scores = scoreFrom(usages);
  // L'indice di partenza è il tie-break esplicito: non ci si affida alla
  // stabilità di `sort`, e la regola resta leggibile nella firma stessa del
  // comparatore.
  return cats
    .map((cat, index) => ({ cat, index, score: scores.get(cat.id) ?? 0 }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map(entry => entry.cat);
}
