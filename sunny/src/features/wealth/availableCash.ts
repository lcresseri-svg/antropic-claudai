/**
 * Liquidità disponibile (admin-only, flag `available_cash`) — pure module.
 *
 *   liquidità disponibile = liquidità − uscite future già impegnate − riserva
 *
 * "Già impegnate" nel periodo scelto (7/14/30 giorni o fine mese):
 *  - occorrenze future di serie ricorrenti (proiettate in memoria da
 *    buildProjectedOccurrences, che salta ciò che è già materializzato →
 *    nessun doppio conteggio con le spese registrate);
 *  - uscite una-tantum già registrate con data futura (pianificate).
 * I trasferimenti non sono mai spese (esclusi), le spese condivise contano per
 * la sola quota propria, e le entrate future NON compensano (prudenza).
 */
import { Transaction, ownShare } from '../../types';
import { buildProjectedOccurrences, isPending, isExpiredTemplate } from '../../shared/recurrence';

export type CashHorizon = 7 | 14 | 30 | 'eom';

export interface CommittedItem {
  date: string;
  description: string;
  amount: number;          // own share
  kind: 'ricorrente' | 'pianificata';
}

export interface AvailableCashResult {
  horizon: CashHorizon;
  horizonEndISO: string;
  liquidity: number;
  committed: number;
  committedItems: CommittedItem[];
  reserve: number;
  available: number;
  /** liquidity / median monthly total expenses; null without expense history. */
  monthsOfAutonomy: number | null;
  /** Deterministic, human-readable explanation of the computation. */
  explanation: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function endOfMonthISO(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/** Median of the total monthly expenses over the last `n` COMPLETE months. */
export function medianMonthlyExpenses(transactions: Transaction[], todayISO: string, n = 6): number | null {
  const currentMonth = todayISO.slice(0, 7);
  const byMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.projected || t.type !== 'expense' || t.recurring) continue;
    const month = t.date.slice(0, 7);
    if (month >= currentMonth) continue; // only complete months
    byMonth.set(month, (byMonth.get(month) ?? 0) + ownShare(t));
  }
  const values = [...byMonth.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, n)
    .map(([, v]) => v);
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

export function computeAvailableCash(opts: {
  transactions: Transaction[];
  liquidity: number;
  horizon: CashHorizon;
  reserve: number;
  now?: Date;
}): AvailableCashResult {
  const { transactions, liquidity, horizon } = opts;
  const reserve = Math.max(0, opts.reserve);
  const todayISO = (opts.now ?? new Date()).toISOString().slice(0, 10);
  const horizonEndISO = horizon === 'eom' ? endOfMonthISO(todayISO) : addDaysISO(todayISO, horizon);

  const items: CommittedItem[] = [];

  // Next due occurrence of each ACTIVE recurring series: the template's own
  // date (kept current by the catch-up/Cloud Function). Projections below are
  // strictly AFTER this date, so nothing is counted twice.
  for (const t of transactions) {
    if (t.type !== 'expense' || !t.recurring || t.projected || isExpiredTemplate(t)) continue;
    if (t.recurring.until && t.recurring.until < t.date) continue;
    if (t.date <= todayISO || t.date > horizonEndISO) continue;
    items.push({ date: t.date, description: t.description, amount: r2(ownShare(t)), kind: 'ricorrente' });
  }

  // Further future occurrences of recurring series inside the horizon. The
  // projection engine already skips materialized occurrences and expired
  // templates, and starts AFTER the template's own date.
  for (const p of buildProjectedOccurrences(transactions, todayISO, horizonEndISO)) {
    if (p.type !== 'expense') continue;
    items.push({ date: p.date, description: p.description, amount: r2(ownShare(p)), kind: 'ricorrente' });
  }

  // One-off planned expenses already recorded with a future date. Series
  // instances (seriesId) are excluded: their future is covered above and their
  // past is already in the balance.
  for (const t of transactions) {
    if (t.type !== 'expense' || t.recurring || t.seriesId || t.projected) continue;
    if (!isPending(t, todayISO)) continue;
    if (t.date > horizonEndISO) continue;
    items.push({ date: t.date, description: t.description, amount: r2(ownShare(t)), kind: 'pianificata' });
  }

  items.sort((a, b) => a.date.localeCompare(b.date));
  const committed = r2(items.reduce((s, i) => s + i.amount, 0));
  const available = r2(liquidity - committed - reserve);

  const medExp = medianMonthlyExpenses(transactions, todayISO);
  const monthsOfAutonomy = medExp && medExp > 0 ? r2(liquidity / medExp) : null;

  const horizonLabel = horizon === 'eom' ? `fine mese (${horizonEndISO})` : `${horizon} giorni (fino al ${horizonEndISO})`;
  const explanation = [
    `Liquidità attuale: ${r2(liquidity)} €.`,
    `Uscite già impegnate entro ${horizonLabel}: ${committed} € (${items.filter(i => i.kind === 'ricorrente').length} ricorrenti, ${items.filter(i => i.kind === 'pianificata').length} pianificate). Trasferimenti e quote condivise altrui esclusi.`,
    `Riserva di sicurezza: ${r2(reserve)} €.`,
    `Disponibile = liquidità − impegni − riserva = ${available} €.`,
    monthsOfAutonomy !== null
      ? `Autonomia: ~${monthsOfAutonomy} mesi (liquidità / mediana uscite mensili degli ultimi mesi completi).`
      : 'Autonomia non calcolabile: servono mesi completi di storico spese.',
  ];

  return {
    horizon, horizonEndISO,
    liquidity: r2(liquidity), committed, committedItems: items,
    reserve: r2(reserve), available, monthsOfAutonomy, explanation,
  };
}
