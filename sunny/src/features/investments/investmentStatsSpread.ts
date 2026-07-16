/**
 * Distribuzione SOLO statistica dei depositi d'investimento — PURE helper.
 *
 * Un deposito una tantum può portare `statsSpreadMonths` (2–120): nei trend,
 * nelle medie, nei confronti e negli insight degli investimenti il suo importo
 * viene ripartito in quote mensili uguali A PARTIRE dal mese del movimento
 * (incluso), in avanti. Esempio: 1.200 € a luglio su 12 mesi → quota 100 €/mese
 * da luglio a giugno.
 *
 * REGOLE (invarianti, testate):
 *  - resta UN solo movimento reale: conto, liquidità, patrimonio, capitale
 *    investito e currentValue cambiano interamente alla data reale;
 *  - cash flow, recap contabile, forecast e pagamenti programmati usano sempre
 *    l'importo reale — questo modulo NON li tocca;
 *  - la quota TFR viene ripartita insieme al resto (statistiche investimento);
 *  - quote arrotondate al centesimo, residuo assegnato all'ULTIMO mese;
 *  - le quote nei mesi futuri compaiono solo per competenza quando quel mese
 *    arriva (il chiamante taglia al mese corrente);
 *  - modifica/eliminazione del movimento ricalcolano tutto dinamicamente (le
 *    quote sono derivate a runtime, mai persistite).
 */
import { Transaction } from '../../types';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const STATS_SPREAD_MIN = 2;
export const STATS_SPREAD_MAX = 120;

/** The valid spread of a transaction, or null when it doesn't apply:
 *  one-off investment DEPOSITS only (never withdrawals, series or templates). */
export function statsSpreadOf(t: Pick<Transaction,
  'type' | 'direction' | 'recurring' | 'seriesId' | 'projected' | 'statsSpreadMonths'>): number | null {
  const n = t.statsSpreadMonths;
  if (n == null) return null;
  if (t.type !== 'investment' || t.direction === 'out') return null;
  if (t.recurring || t.seriesId || t.projected) return null;
  if (!Number.isInteger(n) || n < STATS_SPREAD_MIN || n > STATS_SPREAD_MAX) return null;
  return n;
}

/** Shift a YYYY-MM key by `delta` months. */
export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface MonthlyQuota { month: string; amount: number }

/**
 * Equal monthly quotas of `amount` starting at `startMonth` (YYYY-MM, included)
 * over `months` months. Cents-rounded; the rounding residue lands on the LAST
 * month so the quotas always sum exactly to `amount`.
 */
export function spreadQuotas(amount: number, startMonth: string, months: number): MonthlyQuota[] {
  if (!(months >= 1) || !Number.isFinite(amount)) return [];
  const base = r2(amount / months);
  const out: MonthlyQuota[] = [];
  let assigned = 0;
  for (let i = 0; i < months; i++) {
    const isLast = i === months - 1;
    const q = isLast ? r2(amount - assigned) : base;
    assigned = r2(assigned + q);
    out.push({ month: addMonths(startMonth, i), amount: q });
  }
  return out;
}

/**
 * STATISTICAL monthly investment flows per month key, spread-aware:
 *  - deposits WITH a valid statsSpreadMonths contribute their monthly quota to
 *    each covered month (from the movement's month forward);
 *  - everything else contributes ±amount to its real month (direction-aware);
 *  - `untilMonth` (competenza) caps forward quotas: months after it are
 *    dropped — future quotas only appear once that month is reached.
 *
 * Restrict to a category by pre-filtering the input transactions.
 */
export function monthlyInvestmentStats(
  transactions: Transaction[],
  opts?: { untilMonth?: string },
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (month: string, v: number) => {
    if (opts?.untilMonth && month > opts.untilMonth) return;
    out.set(month, r2((out.get(month) ?? 0) + v));
  };
  for (const t of transactions) {
    if (t.type !== 'investment' || t.projected) continue;
    if (t.recurring) continue; // templates are pointers, not flows
    const month = t.date.slice(0, 7);
    if (t.direction === 'out') { add(month, -t.amount); continue; }
    const spread = statsSpreadOf(t);
    if (!spread) { add(month, t.amount); continue; }
    for (const q of spreadQuotas(t.amount, month, spread)) add(q.month, q.amount);
  }
  return out;
}
