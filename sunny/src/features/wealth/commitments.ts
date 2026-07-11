/**
 * Impegni (admin-only, flag `commitments`) — pure module.
 *
 * Aggregates every ACTIVE recurring series (subscription / installment / plain
 * recurring) into a single view: monthly-equivalent cost, next due dates,
 * residual installments and expected end.
 *
 * No duplication by construction: everything derives from the series TEMPLATE
 * (one per seriesId, via buildSeriesSummary). Recorded instances only feed the
 * "paid so far" figures; projections are display-only and never summed here.
 *
 *   costi fissi mensili = abbonamenti + rate + ricorrenti
 *                         (+ quota mensile delle voci annuali, già inclusa
 *                          dalla normalizzazione monthlyEquivalent: yearly/12)
 */
import { Transaction, SeriesKind, Freq } from '../../types';
import { buildSeriesSummary, monthlyEquivalent, SeriesSummary } from '../../shared/recurrence';

export interface Commitment {
  seriesId: string;
  kind: SeriesKind;
  description: string;
  category: string;
  amount: number;             // per-occurrence amount
  freq?: Freq;
  monthlyEquivalent: number;  // amount normalized to a month (yearly → /12)
  nextDate: string | null;
  /** Installments only. */
  remainingInstallments?: number;
  remainingAmount?: number;
  /** Expected last occurrence: `until` for recurring, computed for installments. */
  expectedEnd?: string;
}

export interface CommitmentsSummary {
  subscriptions: Commitment[];
  installments: Commitment[];
  recurring: Commitment[];
  /** Σ monthlyEquivalent of the three groups (expense-type only). */
  fixedMonthlyCost: number;
  /** Next 30 days of due dates across all commitments, ascending. */
  upcoming: { date: string; description: string; amount: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function addMonthsClamped(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + delta, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

function toCommitment(s: SeriesSummary): Commitment {
  const monthly = s.freq ? monthlyEquivalent(s.amount, s.freq) : s.amount;
  const c: Commitment = {
    seriesId: s.seriesId,
    kind: s.kind,
    description: s.description,
    category: s.category,
    amount: r2(s.amount),
    freq: s.freq,
    monthlyEquivalent: r2(monthly),
    nextDate: s.nextDate,
    expectedEnd: s.until,
  };
  if (s.installment) {
    c.remainingInstallments = s.installment.remainingInstallments;
    c.remainingAmount = r2(s.installment.remainingAmount);
    // Expected conclusion: next due date + (remaining − 1) monthly periods.
    if (s.nextDate && s.installment.remainingInstallments > 0 && s.freq === 'monthly') {
      c.expectedEnd = addMonthsClamped(s.nextDate, s.installment.remainingInstallments - 1);
    } else if (s.installment.remainingInstallments === 0) {
      c.expectedEnd = s.occurrences.length > 0 ? s.occurrences[s.occurrences.length - 1].date : s.until;
    }
  }
  return c;
}

export function buildCommitments(
  allTransactions: Transaction[],
  todayISO: string,
): CommitmentsSummary {
  // One summary per logical series: dedupe on the template's seriesId.
  const seen = new Set<string>();
  const summaries: SeriesSummary[] = [];
  for (const t of allTransactions) {
    if (!t.recurring || t.projected) continue;
    const sid = t.seriesId ?? t.id;
    if (seen.has(sid)) continue;
    seen.add(sid);
    summaries.push(buildSeriesSummary(allTransactions, t, todayISO));
  }

  const active = summaries.filter(s => !s.ended && s.type === 'expense');
  const subscriptions = active.filter(s => s.kind === 'subscription').map(toCommitment);
  const installments = active.filter(s => s.kind === 'installment').map(toCommitment);
  const recurring = active.filter(s => s.kind === 'recurring').map(toCommitment);

  const byMonthly = (a: Commitment, b: Commitment) => b.monthlyEquivalent - a.monthlyEquivalent;
  subscriptions.sort(byMonthly); installments.sort(byMonthly); recurring.sort(byMonthly);

  const fixedMonthlyCost = r2(
    [...subscriptions, ...installments, ...recurring].reduce((s, c) => s + c.monthlyEquivalent, 0),
  );

  // Prossime scadenze (30 giorni): direttamente dai template attivi.
  const horizon = new Date(Date.parse(todayISO) + 30 * 86_400_000).toISOString().slice(0, 10);
  const upcoming = active
    .filter(s => s.nextDate && s.nextDate > todayISO && s.nextDate <= horizon)
    .map(s => ({ date: s.nextDate as string, description: s.description, amount: r2(s.amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { subscriptions, installments, recurring, fixedMonthlyCost, upcoming };
}
