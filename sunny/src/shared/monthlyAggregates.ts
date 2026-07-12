/**
 * Aggregati mensili derivati — pure module (groundwork for pagination).
 *
 * Oggi l'app scarica l'intero storico e calcola tutto in memoria. Questo
 * modulo prepara il passo successivo senza cambiare quel comportamento:
 * aggregati mensili VERSIONATI e RIGENERABILI che, una volta persistiti
 * (users/{uid}/derived/monthlyAggregates), permetteranno di caricare solo la
 * finestra recente di transazioni e ricostruire trend/medie dagli aggregati.
 *
 * Contratto:
 *  - version: bump quando cambia la formula ⇒ i client rigenerano;
 *  - deterministico: stessi input → stesso aggregato (rigenerabile sempre);
 *  - fallback: `needsRegeneration` dice quando ricalcolare dai dati originali
 *    (versione diversa o storico più esteso). MAI scritture di massa
 *    all'apertura: la persistenza è on-demand e a carico del chiamante.
 */
import { Transaction, ownShare, investSign } from '../types';

export const MONTHLY_AGGREGATES_VERSION = 1;

export interface MonthAggregate {
  month: string;      // YYYY-MM
  income: number;
  expenses: number;   // own share
  investments: number; // net (deposits − withdrawals)
  /** Expense own-share per categoria. */
  expensesByCategory: Record<string, number>;
  txCount: number;
}

export interface MonthlyAggregatesDoc {
  version: number;
  /** Last COMPLETE month included (current month is never aggregated). */
  lastMonth: string | null;
  months: MonthAggregate[];
  generatedAt: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Build aggregates for every COMPLETE month before `nowISO`'s month. */
export function buildMonthlyAggregates(
  transactions: Transaction[],
  nowISO: string,
  now = Date.now(),
): MonthlyAggregatesDoc {
  const currentMonth = nowISO.slice(0, 7);
  const byMonth = new Map<string, MonthAggregate>();

  for (const t of transactions) {
    if (t.projected || t.recurring) continue; // templates are pointers, not flows
    const month = t.date.slice(0, 7);
    if (month >= currentMonth) continue;
    let agg = byMonth.get(month);
    if (!agg) {
      agg = { month, income: 0, expenses: 0, investments: 0, expensesByCategory: {}, txCount: 0 };
      byMonth.set(month, agg);
    }
    agg.txCount++;
    if (t.type === 'income') agg.income += t.amount;
    else if (t.type === 'expense') {
      const own = ownShare(t);
      agg.expenses += own;
      agg.expensesByCategory[t.category] = (agg.expensesByCategory[t.category] ?? 0) + own;
    } else if (t.type === 'investment') agg.investments += investSign(t) * t.amount;
    // transfers move money between accounts: no monthly flow.
  }

  const months = [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(m => ({
      ...m,
      income: r2(m.income),
      expenses: r2(m.expenses),
      investments: r2(m.investments),
      expensesByCategory: Object.fromEntries(
        Object.entries(m.expensesByCategory).map(([k, v]) => [k, r2(v)]),
      ),
    }));

  return {
    version: MONTHLY_AGGREGATES_VERSION,
    lastMonth: months.length ? months[months.length - 1].month : null,
    months,
    generatedAt: now,
  };
}

/**
 * Fallback check: true when the persisted doc can't be trusted and the caller
 * must recompute from the original transactions (which remain the source of
 * truth in every case).
 */
export function needsRegeneration(
  doc: MonthlyAggregatesDoc | null | undefined,
  nowISO: string,
): boolean {
  if (!doc) return true;
  if (doc.version !== MONTHLY_AGGREGATES_VERSION) return true;
  // A stale doc (missing the most recent complete month) must be refreshed.
  const currentMonth = nowISO.slice(0, 7);
  const [y, m] = currentMonth.split('-').map(Number);
  const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  return doc.lastMonth !== null && doc.lastMonth < prevMonth;
}
