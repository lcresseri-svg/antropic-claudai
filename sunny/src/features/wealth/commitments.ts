/**
 * Impegni fissi (flag `commitments`, disponibile a tutti) — pure module.
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
 *
 * Gli INVESTIMENTI ricorrenti (PAC, versamenti automatici) sono impegni a
 * tutti gli effetti — partono da soli, alla stessa data, che tu ci pensi o no
 * — ma non sono un costo: quei soldi restano tuoi. Quindi stanno in un gruppo
 * a parte e `fixedMonthlyCost` NON li include: sommarli lì direbbe che il mese
 * è più pesante di quanto sia, e la stessa cifra è già patrimonio altrove.
 */
import { Transaction, SeriesKind, Freq, TransactionType } from '../../types';
import { buildSeriesSummary, monthlyEquivalent, SeriesSummary } from '../../shared/recurrence';
import { buildCommitmentEvents, addDaysISO } from './commitmentProjection';

export interface Commitment {
  seriesId: string;
  kind: SeriesKind;
  /** `expense` o `investment`: distingue un costo da un versamento. */
  type: TransactionType;
  description: string;
  category: string;
  amount: number;             // per-occurrence amount
  freq?: Freq;
  monthlyEquivalent: number;  // amount normalized to a month (yearly → /12)
  nextDate: string | null;
  /** Conto della serie (dal template, in fallback dall'ultima occorrenza).
   *  Vuoto quando la serie non ne ha uno: apre i movimenti senza filtro conto. */
  account: string;
  /** Installments only. */
  remainingInstallments?: number;
  remainingAmount?: number;
  /** Installments only: posizione nel piano (rate pagate / totali). */
  paidInstallments?: number;
  totalInstallments?: number;
  /** Expected last occurrence: `until` for recurring, computed for installments. */
  expectedEnd?: string;
}

export interface CommitmentsSummary {
  subscriptions: Commitment[];
  installments: Commitment[];
  recurring: Commitment[];
  /** Versamenti ricorrenti di tipo `investment`, di qualunque `kind`. */
  investments: Commitment[];
  /** Σ monthlyEquivalent of the three EXPENSE groups — investimenti esclusi. */
  fixedMonthlyCost: number;
  /** Σ monthlyEquivalent degli investimenti ricorrenti. Esce dal conto ogni
   *  mese come i costi fissi, ma è accumulo: si somma a parte, mai a quelli. */
  investedMonthly: number;
  /** Next 30 days of due dates across all commitments, ascending.
   *  Include gli investimenti, marcati da `investment`: alla loro data
   *  quei soldi lasciano il conto esattamente come una bolletta. */
  upcoming: { date: string; description: string; amount: number; investment: boolean }[];
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
    type: s.type,
    description: s.description,
    category: s.category,
    amount: r2(s.amount),
    freq: s.freq,
    monthlyEquivalent: r2(monthly),
    nextDate: s.nextDate,
    account: s.template?.account ?? s.occurrences[s.occurrences.length - 1]?.account ?? '',
    expectedEnd: s.until,
  };
  if (s.installment) {
    c.remainingInstallments = s.installment.remainingInstallments;
    c.remainingAmount = r2(s.installment.remainingAmount);
    // Rate già pagate: derivate dal piano (totali − residue), nessun campo nuovo
    // nel modello dati.
    c.totalInstallments = s.installment.totalInstallments;
    c.paidInstallments = Math.max(0, s.installment.totalInstallments - s.installment.remainingInstallments);
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

  const active = summaries.filter(s => !s.ended);
  const costs = active.filter(s => s.type === 'expense');
  const subscriptions = costs.filter(s => s.kind === 'subscription').map(toCommitment);
  const installments = costs.filter(s => s.kind === 'installment').map(toCommitment);
  const recurring = costs.filter(s => s.kind === 'recurring').map(toCommitment);
  // Un versamento automatico resta un versamento che sia stato registrato come
  // ricorrente, come abbonamento o come piano: il `kind` qui non divide niente,
  // divide il tipo.
  const investments = active.filter(s => s.type === 'investment').map(toCommitment);

  const byMonthly = (a: Commitment, b: Commitment) => b.monthlyEquivalent - a.monthlyEquivalent;
  subscriptions.sort(byMonthly); installments.sort(byMonthly); recurring.sort(byMonthly);
  investments.sort(byMonthly);

  const sum = (items: Commitment[]) => r2(items.reduce((s, c) => s + c.monthlyEquivalent, 0));
  const fixedMonthlyCost = sum([...subscriptions, ...installments, ...recurring]);
  const investedMonthly = sum(investments);

  // Prossime scadenze (30 giorni): la lista di eventi CONDIVISA con la liquidità
  // disponibile (commitmentProjection) — stesse occorrenze, deduplicate allo
  // stesso modo. Qui si somma l'importo PIENO, lì la sola quota propria.
  const upcoming = buildCommitmentEvents(allTransactions, todayISO, addDaysISO(todayISO, 30),
    { includeInvestments: true })
    .map(e => ({
      date: e.date, description: e.description, amount: e.amount,
      investment: e.type === 'investment',
    }));

  return {
    subscriptions, installments, recurring, investments,
    fixedMonthlyCost, investedMonthly, upcoming,
  };
}
