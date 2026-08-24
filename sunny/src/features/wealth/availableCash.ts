/**
 * Liquidità disponibile (admin-only, flag `available_cash`) — pure module.
 *
 *   liquidità disponibile = liquidità − uscite future già impegnate − riserva
 *
 * "Già impegnate" nel periodo scelto (7/14/30 giorni o fine mese): l'elenco
 * degli eventi è quello CONDIVISO con la schermata Impegni
 * (commitmentProjection.buildCommitmentEvents — ricorrenti proiettate senza
 * doppioni + una-tantum future). Qui cambia solo COME si somma: ogni evento
 * conta per la sola quota propria (`ownShare`), mentre Impegni somma l'importo
 * pieno. I trasferimenti non sono mai spese (esclusi) e le entrate future NON
 * compensano (prudenza).
 */
import { Transaction, ownShare } from '../../types';
import { buildCommitmentEvents, addDaysISO } from './commitmentProjection';

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
  /** Motivo BREVE per cui l'autonomia non è calcolabile; null quando lo è.
   *  Serve accanto al "—" in UI: un trattino senza spiegazione non dice nulla. */
  autonomyUnavailableReason: string | null;
  /** Deterministic, human-readable explanation of the computation. */
  explanation: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

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

  // Stessa lista di eventi della schermata Impegni; la quota propria si applica
  // QUI, in fase di somma (una spesa condivisa impegna solo la parte tua).
  const items: CommittedItem[] = buildCommitmentEvents(transactions, todayISO, horizonEndISO)
    .map(e => ({ date: e.date, description: e.description, amount: r2(ownShare(e.source)), kind: e.kind }));

  const committed = r2(items.reduce((s, i) => s + i.amount, 0));
  const available = r2(liquidity - committed - reserve);

  const medExp = medianMonthlyExpenses(transactions, todayISO);
  const monthsOfAutonomy = medExp && medExp > 0 ? r2(liquidity / medExp) : null;
  const autonomyUnavailableReason = monthsOfAutonomy !== null
    ? null
    : medExp === null
      ? 'servono mesi completi di storico spese'
      : 'nessuna uscita nei mesi completi di storico';

  const horizonLabel = horizon === 'eom' ? `fine mese (${horizonEndISO})` : `${horizon} giorni (fino al ${horizonEndISO})`;
  const explanation = [
    `Liquidità attuale: ${r2(liquidity)} €.`,
    `Uscite già impegnate entro ${horizonLabel}: ${committed} € (${items.filter(i => i.kind === 'ricorrente').length} ricorrenti, ${items.filter(i => i.kind === 'pianificata').length} pianificate). Trasferimenti e quote condivise altrui esclusi.`,
    `Riserva di sicurezza: ${r2(reserve)} €.`,
    `Disponibile = liquidità − impegni − riserva = ${available} €.`,
    monthsOfAutonomy !== null
      ? `Autonomia: ~${monthsOfAutonomy} mesi (liquidità / mediana uscite mensili degli ultimi mesi completi).`
      : `Autonomia non calcolabile: ${autonomyUnavailableReason}.`,
  ];

  return {
    horizon, horizonEndISO,
    liquidity: r2(liquidity), committed, committedItems: items,
    reserve: r2(reserve), available, monthsOfAutonomy, autonomyUnavailableReason, explanation,
  };
}
