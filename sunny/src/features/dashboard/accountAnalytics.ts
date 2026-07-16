// Pure aggregation logic for the "Saldo per conto" analytics screen.
// No React, no Firestore — easy to unit-test. Speculare a categoryAnalytics.ts.
//
// KEY DIFFERENCE vs category spending: a balance is a STOCK (cumulative), not a
// flow. The curve over a period does NOT start at zero — it starts at the
// account's OPENING balance (initial balance + the net of every movement dated
// before the period) and then moves movement-by-movement.
//
// The sign of a movement on a single account's cash balance is delegated to
// shared/financialFlow.accountDelta (the app-wide source of truth, shared with
// useTransactions.ts):
//   income      on account        → +amount
//   expense     on account        → −ownShare
//   investment  deposit           → −(amount − TFR)   (the TFR share never
//                                    touches the account; source-less = 0)
//   investment  withdrawal ('out') → +amount           (credits the destination)
//   transfer    out (account)      → −amount
//   transfer    in  (toAccount)    → +amount

import { Transaction, AccountDef, ownShare } from '../../types';
import { accountDelta } from '../../shared/financialFlow';
import {
  PeriodType, PeriodRange, getPeriodRange, localISO,
} from './categoryAnalytics';

export type { PeriodType, PeriodRange };

const pad = (n: number) => String(n).padStart(2, '0');
const shortMonth = (d: Date) =>
  d.toLocaleString('it-IT', { month: 'short' }).replace('.', '').replace(/^./, c => c.toUpperCase());

/** A movement counts toward balances unless it's a client-only projected row. */
const counts = (t: Transaction) => !t.projected;

/**
 * Signed impact of a single transaction on ONE account's cash balance.
 * Thin re-export of the app-wide helper so the curve, the period quadratura and
 * useTransactions can never disagree. Date/projected filtering is the caller's
 * responsibility.
 */
export function signedDelta(t: Transaction, accountId: string): number {
  return accountDelta(t, accountId);
}

/**
 * Balance of an account up to and INCLUDING `dateISO`:
 * initial balance + net of every (non-projected) movement dated ≤ dateISO.
 */
export function balanceAsOf(transactions: Transaction[], account: AccountDef, dateISO: string): number {
  let bal = account.initialBalance ?? 0;
  for (const t of transactions) {
    if (!counts(t) || t.date > dateISO) continue;
    bal += signedDelta(t, account.id);
  }
  return bal;
}

export interface AccountFlowSummary {
  accountId: string;
  openingBalance: number;   // balance at the start of the period (excl. the period)
  closingBalance: number;   // balance at the end of the period (capped to today)
  income: number;
  expense: number;
  investment: number;       // NET cash invested out of this account (deposits − withdrawals)
  transferNet: number;      // transfers in − transfers out
  delta: number;            // closingBalance − openingBalance
}

/**
 * Opening/closing balance and the period flows for one account.
 * Quadratura (guaranteed by construction):
 *   closingBalance = openingBalance + income − expense − investment + transferNet
 * and closingBalance === balanceAsOf(account, endISO capped to today).
 */
export function aggregateAccountFlow(
  transactions: Transaction[],
  account: AccountDef,
  range: PeriodRange,
  opts?: { now?: Date },
): AccountFlowSummary {
  const now = opts?.now ?? new Date();
  const todayISO = localISO(now);
  const startISO = localISO(range.start);
  const rangeEndISO = localISO(range.end);
  const endISO = rangeEndISO <= todayISO ? rangeEndISO : todayISO; // never count the future

  let openingBalance = account.initialBalance ?? 0;
  let income = 0, expense = 0, investment = 0, transferIn = 0, transferOut = 0;

  for (const t of transactions) {
    if (!counts(t)) continue;
    if (t.date < startISO) { openingBalance += signedDelta(t, account.id); continue; }
    if (t.date > endISO) continue; // future / beyond the period
    if (t.type === 'income' && t.account === account.id) income += t.amount;
    else if (t.type === 'expense' && t.account === account.id) expense += ownShare(t);
    else if (t.type === 'investment' && t.account === account.id) {
      // Only the cash that really moved through THIS account: non-TFR share of
      // deposits out, returned capital of withdrawals back in.
      investment += -signedDelta(t, account.id);
    }
    else if (t.type === 'transfer') {
      if (t.toAccount === account.id) transferIn += t.amount;
      if (t.account === account.id) transferOut += t.amount;
    }
  }

  const transferNet = transferIn - transferOut;
  const closingBalance = openingBalance + income - expense - investment + transferNet;
  return {
    accountId: account.id,
    openingBalance,
    closingBalance,
    income,
    expense,
    investment,
    transferNet,
    delta: closingBalance - openingBalance,
  };
}

export interface AccountBalancePoint {
  label: string;
  balance: number;          // balance at the END of the bucket (may be negative)
}

/**
 * Balance curve over the period. Bucketing mirrors aggregateCategoryTrend:
 *  - '1m'  → weekly buckets within the month (~5 points)
 *  - else  → one point per month across the window
 * Each point = balance at the END of the bucket, capped to today (no future).
 * The first point is the opening balance + that bucket — never zero.
 */
export function aggregateAccountBalanceTrend(
  transactions: Transaction[],
  account: AccountDef,
  period: PeriodType,
  offset: number,
  now: Date = new Date(),
): AccountBalancePoint[] {
  const range = getPeriodRange(period, offset, now);
  const start = range.start;
  const todayISO = localISO(now);
  const cap = (iso: string) => (iso <= todayISO ? iso : todayISO);

  const buckets: { label: string; end: string }[] = [];
  if (period === '1m') {
    const y = start.getFullYear(), m = start.getMonth();
    const ym = `${y}-${pad(m + 1)}`;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let ds = 1; ds <= daysInMonth; ds += 7) {
      const de = Math.min(ds + 6, daysInMonth);
      buckets.push({ label: String(ds), end: cap(`${ym}-${pad(de)}`) });
    }
  } else {
    for (let i = 0; i < range.months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      buckets.push({ label: shortMonth(d), end: cap(`${ym}-${pad(last)}`) });
    }
  }

  return buckets.map(b => ({ label: b.label, balance: balanceAsOf(transactions, account, b.end) }));
}

/** Recent movements that REALLY move this account's balance within the period,
 *  newest first. A source-less deposit or a fully-TFR contribution has zero
 *  cash impact on any account, so it never appears here. */
export function getAccountMovements(
  transactions: Transaction[],
  account: AccountDef,
  range: PeriodRange,
  now: Date = new Date(),
): Transaction[] {
  const todayISO = localISO(now);
  const startISO = localISO(range.start);
  const rangeEndISO = localISO(range.end);
  const endISO = rangeEndISO <= todayISO ? rangeEndISO : todayISO;
  return transactions
    .filter(t =>
      counts(t) && t.date >= startISO && t.date <= endISO &&
      (t.account === account.id || t.toAccount === account.id) &&
      Math.abs(signedDelta(t, account.id)) > 0.005,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** Total liquidity today: sum of closing balances of the NON-investment accounts. */
export function totalLiquidity(
  transactions: Transaction[],
  accounts: AccountDef[],
  now: Date = new Date(),
): number {
  const todayISO = localISO(now);
  return accounts
    .filter(a => !a.isInvestment)
    .reduce((s, a) => s + balanceAsOf(transactions, a, todayISO), 0);
}
