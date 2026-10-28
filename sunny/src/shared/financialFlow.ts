/**
 * Flusso finanziario unico — PURE helper (no React, no Firestore).
 *
 * SINGLE SOURCE OF TRUTH for how every transaction moves cash. Used by the
 * dashboard month cards, the account balances (useTransactions), the per-account
 * analytics, the wealth series, the transaction-list subtotals, the recap and
 * the AI digest — the numbers can never disagree between screens.
 *
 * Per-transaction rules:
 *   income                      → cashIn  += amount            (entrata ordinaria;
 *                                 include le plusvalenze realizzate — restano
 *                                 nella loro transazione, nessun doppio conteggio)
 *   expense                     → cashOut += grossOwnShare      (spese effettive;
 *                                 include minusvalenze e commissioni). LORDO
 *                                 degli storni: il conto ha visto uscire tutto
 *                                 alla data della spesa; lo storno rientra alla
 *                                 SUA data come movimento a sé.
 *   refund                      → cashIn  += amount             (storno di una
 *                                 spesa: riaccredita il conto alla data reale,
 *                                 ma NON è un'entrata — componente separato,
 *                                 vedi shared/refunds.ts)
 *   investment deposit          → TFR = clamp(tfr ?? 0, 0, amount)
 *     (direction absent/'in')     quota non-TFR = amount − TFR
 *     · con conto               → cashOut += quota non-TFR      (uscita reale)
 *     · senza conto             → FUORI dal flusso (apporto esterno): non tocca
 *                                 nessun conto, quindi non è né entrata né
 *                                 uscita di cassa — resta un componente a sé,
 *                                 mostrato nella card "Investimenti"
 *     · TFR                     → SEMPRE escluso dal flusso (resta nel capitale
 *                                 investito / controvalore / patrimonio)
 *   investment withdrawal        → cashIn += amount              (capitale
 *     (direction 'out')            rimborsato — la plus/minusvalenza viaggia
 *                                 nella sua transazione income/expense collegata)
 *   transfer                    → escluso (movimento interno), salvo la quota
 *                                 banca↔carta differita dichiarata in cashDelta
 *
 * `cashDelta` è derivato client-side: separa la cassa dalle spese/statistiche
 * quando un conto carta differisce il pagamento. Gli addebiti carta restano
 * componenti di cassa separati e non diventano nuove spese o entrate.
 *
 *   cashIn  = entrate ordinarie + capitale rientrato dai disinvestimenti + storni
 *   cashOut = spese effettive + depositi non-TFR finanziati dai conti
 *   netFlow = cashIn − cashOut          (= variazione reale della liquidità)
 *
 * Nel flusso entra SOLO ciò che tocca davvero i conti: apporti esterni e TFR
 * aumentano il capitale investito e il patrimonio senza spostare liquidità,
 * quindi restano fuori da cashIn/cashOut (li si legge nei loro componenti).
 *
 * Filtering (projected rows, pending/future dates, period) is the CALLER's
 * responsibility, mirroring the other pure aggregators.
 */
import { Transaction, grossOwnShare, investSign, ownShare } from '../types';

const r2 = (n: number) => Math.round(n * 100) / 100;
const hasCashDelta = (t: Transaction): t is Transaction & { cashDelta: number } =>
  typeof t.cashDelta === 'number' && Number.isFinite(t.cashDelta);

/** TFR portion of an investment DEPOSIT, clamped to [0, amount]. 0 otherwise. */
export function tfrPortion(t: Pick<Transaction, 'type' | 'direction' | 'amount' | 'tfr'>): number {
  if (t.type !== 'investment' || t.direction === 'out') return 0;
  const tfr = t.tfr ?? 0;
  return Math.min(Math.max(tfr, 0), t.amount);
}

/**
 * Signed impact of ONE transaction on ONE account's cash balance.
 * The TFR portion of a deposit NEVER touches the account; a source-less
 * investment (account === '') touches no account at all.
 */
export function accountDelta(t: Transaction, accountId: string): number {
  if (!accountId) return 0;
  switch (t.type) {
    case 'income':     return t.account === accountId ? t.amount : 0;
    case 'expense':    return t.account === accountId ? -grossOwnShare(t) : 0;
    // Storno: riaccredita il conto scelto alla sua data reale.
    case 'refund':     return t.account === accountId ? t.amount : 0;
    case 'investment': {
      if (t.account !== accountId) return 0;
      // Deposit: only the non-TFR share leaves the account.
      // Withdrawal ('out'): the returned capital credits the account in full.
      return t.direction === 'out' ? t.amount : -(t.amount - tfrPortion(t));
    }
    case 'transfer': {
      let d = 0;
      if (t.account === accountId) d -= t.amount;
      if (t.toAccount === accountId) d += t.amount;
      return d;
    }
    default: return 0;
  }
}

/** Signed impact on the invested capital of the transaction's category
 *  (deposits + full amount incl. TFR, withdrawals − amount). 0 for non-investments. */
export function investedDelta(t: Transaction): number {
  return t.type === 'investment' ? investSign(t) * t.amount : 0;
}

/** Signed impact on TOTAL liquidity (sum across all tracked accounts):
 *  transfers net to 0, TFR and source-less deposits never move cash. */
export function liquidityDelta(t: Transaction): number {
  if (hasCashDelta(t)) return t.cashDelta;
  switch (t.type) {
    case 'income':  return t.amount;
    case 'expense': return -grossOwnShare(t);
    case 'refund':  return t.amount;
    case 'investment':
      if (!t.account) return 0;
      return t.direction === 'out' ? t.amount : -(t.amount - tfrPortion(t));
    default: return 0; // transfers are internal
  }
}

/** Component breakdown of the unified cash flow over a set of transactions. */
export interface FlowBreakdown {
  /** Entrate ordinarie (type income, incl. plusvalenze realizzate). */
  ordinaryIncome: number;
  /** Apporti esterni: quota non-TFR dei depositi SENZA conto. FUORI dal flusso
   *  (non tocca i conti): confluisce negli investimenti, non nelle entrate. */
  externalContributions: number;
  /** Capitale rientrato dai disinvestimenti (gamba 'out'). */
  capitalReturned: number;
  /** Spese effettive (LORDE di storni; incl. minusvalenze e commissioni). */
  expenses: number;
  /** Storni incassati: riaccreditano i conti ma non sono entrate. */
  refundsReceived: number;
  /** Depositi non-TFR finanziati dai conti. */
  investedFromAccounts: number;
  /** Quota TFR esclusa dal flusso (informativa). */
  tfrExcluded: number;
  /** Bank cash used to settle card debt; never an additional expense. */
  creditCardPayments?: number;
  /** Cash credited by a transfer from a deferred card account. */
  creditCardCredits?: number;
  cashIn: number;   // ordinaryIncome + capitalReturned + refundsReceived + creditCardCredits
  cashOut: number;  // expenses + investedFromAccounts + creditCardPayments
  netFlow: number;  // cashIn − cashOut (variazione della liquidità)
}

export const EMPTY_FLOW: FlowBreakdown = Object.freeze({
  ordinaryIncome: 0, externalContributions: 0, capitalReturned: 0,
  expenses: 0, refundsReceived: 0, investedFromAccounts: 0, tfrExcluded: 0,
  cashIn: 0, cashOut: 0, netFlow: 0,
});

/** The flow contribution of a single transaction (component-level). */
export function flowParts(t: Transaction): Pick<FlowBreakdown,
  'ordinaryIncome' | 'externalContributions' | 'capitalReturned' | 'expenses' | 'refundsReceived' | 'investedFromAccounts' | 'tfrExcluded' | 'creditCardPayments' | 'creditCardCredits'> {
  const parts = {
    ordinaryIncome: 0, externalContributions: 0, capitalReturned: 0,
    expenses: 0, refundsReceived: 0, investedFromAccounts: 0, tfrExcluded: 0,
  };
  const cash = hasCashDelta(t) ? t.cashDelta : undefined;
  if (t.type === 'transfer' && cash !== undefined) {
    if (cash < 0) return { ...parts, creditCardPayments: -cash };
    if (cash > 0) return { ...parts, creditCardCredits: cash };
  }
  if (t.type === 'income') parts.ordinaryIncome = cash === undefined ? t.amount : Math.max(0, cash);
  else if (t.type === 'expense') parts.expenses = cash === undefined ? grossOwnShare(t) : Math.max(0, -cash);
  else if (t.type === 'refund') parts.refundsReceived = cash === undefined ? t.amount : Math.max(0, cash);
  else if (t.type === 'investment') {
    if (t.direction === 'out') {
      parts.capitalReturned = cash === undefined ? t.amount : Math.max(0, cash);
    } else {
      const tfr = tfrPortion(t);
      const nonTfr = t.amount - tfr;
      parts.tfrExcluded = tfr;
      if (t.account) parts.investedFromAccounts = cash === undefined ? nonTfr : Math.max(0, -cash);
      else parts.externalContributions = nonTfr;
    }
  }
  return parts;
}

/** Signed netFlow contribution of a single transaction (cashIn − cashOut share).
 *  This is the CASH view: expenses are gross and refunds credit their receipt date. */
export function netFlowDelta(t: Transaction): number {
  if (hasCashDelta(t)) return t.cashDelta;
  const p = flowParts(t);
  return (p.ordinaryIncome + p.capitalReturned + p.refundsReceived)
    - (p.expenses + p.investedFromAccounts);
}

/**
 * Signed contribution for STATISTICAL summaries.
 *
 * Refunds themselves are neutral: their amount is already reattributed to the
 * original expense through `refundedTotal` / `ownShare`. Investments keep the
 * existing cash-flow sign and transfers remain neutral.
 */
export function statisticalNetDelta(t: Transaction): number {
  if (t.type === 'refund') return 0;
  if (t.type === 'expense') {
    const expense = ownShare(t);
    return expense > 0 ? -expense : 0;
  }
  // Statistics follow the original transaction regardless of the date its
  // card liability reaches the bank. Never feed the derived cash override back
  // into income, investment or shared-transfer statistical summaries.
  if (t.type === 'transfer') return 0;
  if (t.type === 'income') return t.amount;
  if (t.type === 'investment') {
    if (t.direction === 'out') return t.amount;
    return t.account ? -(t.amount - tfrPortion(t)) : 0;
  }
  return 0;
}

/** Aggregate the unified flow over transactions (already filtered by the caller). */
export function aggregateFlow(transactions: Iterable<Transaction>): FlowBreakdown {
  const acc = {
    ordinaryIncome: 0, externalContributions: 0, capitalReturned: 0,
    expenses: 0, refundsReceived: 0, investedFromAccounts: 0, tfrExcluded: 0,
  };
  let cardPayments = 0, cardCredits = 0;
  for (const t of transactions) {
    const p = flowParts(t);
    acc.ordinaryIncome += p.ordinaryIncome;
    acc.externalContributions += p.externalContributions;
    acc.capitalReturned += p.capitalReturned;
    acc.expenses += p.expenses;
    acc.refundsReceived += p.refundsReceived;
    acc.investedFromAccounts += p.investedFromAccounts;
    acc.tfrExcluded += p.tfrExcluded;
    cardPayments += p.creditCardPayments ?? 0;
    cardCredits += p.creditCardCredits ?? 0;
  }
  const cashIn = r2(acc.ordinaryIncome + acc.capitalReturned + acc.refundsReceived + cardCredits);
  const cashOut = r2(acc.expenses + acc.investedFromAccounts + cardPayments);
  return {
    ordinaryIncome: r2(acc.ordinaryIncome),
    externalContributions: r2(acc.externalContributions),
    capitalReturned: r2(acc.capitalReturned),
    expenses: r2(acc.expenses),
    refundsReceived: r2(acc.refundsReceived),
    investedFromAccounts: r2(acc.investedFromAccounts),
    tfrExcluded: r2(acc.tfrExcluded),
    ...(r2(cardPayments) > 0 ? { creditCardPayments: r2(cardPayments) } : {}),
    ...(r2(cardCredits) > 0 ? { creditCardCredits: r2(cardCredits) } : {}),
    cashIn, cashOut, netFlow: r2(cashIn - cashOut),
  };
}
