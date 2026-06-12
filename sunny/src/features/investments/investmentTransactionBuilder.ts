import { Transaction, RecurrenceRule, STALE_DAYS } from '../../types';

/** Round to cents — all generated amounts are money. */
const r2 = (n: number) => Math.round(n * 100) / 100;

// ── Latent P/L ─────────────────────────────────────────────────────────────────

/** Latent plus/minus for a position: market value − net deposited.
 *  null when the market value has never been entered. */
export function plusMinusLatente(deposited: number, currentValue?: number): number | null {
  return currentValue == null ? null : r2(currentValue - deposited);
}

/** True when the manually-entered market value is older than STALE_DAYS. */
export function isStaleValue(lastValueUpdate?: string, now: Date = new Date()): boolean {
  if (!lastValueUpdate) return true;
  const updated = new Date(lastValueUpdate).getTime();
  return now.getTime() - updated > STALE_DAYS * 86_400_000;
}

// ── Deposit (Versa) ────────────────────────────────────────────────────────────

export interface DepositInput {
  category: string;
  amount: number;
  date: string;          // YYYY-MM-DD
  account: string;       // '' = source-less (TFR / employer contribution)
  description?: string;
  categoryLabel?: string; // fallback description when none given
  notes?: string;
  fee?: number;          // commission — only meaningful with a source account
  tfr?: number;          // pension funds: TFR portion of this contribution
  recurring?: RecurrenceRule;
  seriesId?: string;
  groupId?: string;      // preserved on edit so the fee link survives
}

/**
 * Build the transactions for an investment deposit. Replicates the historical
 * TransactionModal investment path: main tx (direction 'in') + optional linked
 * commission expense sharing a groupId. The TFR portion is capped at the amount;
 * the commission requires a source account (nothing to charge otherwise).
 */
export function buildInvestmentDeposit(input: DepositInput): Omit<Transaction, 'id'>[] {
  const desc = input.description?.trim() || input.categoryLabel?.trim() || 'Investimento';
  const feeVal = input.account !== '' && input.fee && input.fee > 0 ? r2(input.fee) : 0;
  const groupId = feeVal > 0 ? (input.groupId ?? crypto.randomUUID()) : input.groupId;
  const tfrClean = input.tfr && input.tfr > 0 ? Math.min(r2(input.tfr), input.amount) : undefined;

  const txs: Omit<Transaction, 'id'>[] = [{
    type: 'investment', direction: 'in',
    description: desc, amount: r2(input.amount), date: input.date,
    category: input.category, account: input.account,
    notes: input.notes?.trim() || undefined,
    recurring: input.recurring, seriesId: input.seriesId,
    ...(tfrClean ? { tfr: tfrClean } : {}),
    ...(groupId ? { groupId } : {}),
  }];
  if (feeVal > 0) {
    txs.push({
      type: 'expense', description: `Commissione · ${desc}`,
      amount: feeVal, date: input.date, category: 'altro',
      account: input.account, groupId: groupId!,
    });
  }
  return txs;
}

// ── Withdrawal (Disinvesti) ────────────────────────────────────────────────────

export interface WithdrawalInput {
  category: string;
  categoryLabel: string;
  amount: number;       // cash withdrawn (gross of commission)
  currentValue: number; // market value of the position BEFORE this withdrawal
  deposited: number;    // net deposited capital of the category (versato netto)
  toAccount: string;    // destination account for the cash
  date: string;
  fee?: number;
  feeAccount?: string;  // defaults to toAccount
  notes?: string;
}

export interface WithdrawalResult {
  transactions: Omit<Transaction, 'id'>[];
  /** Fraction of the position liquidated (amount / currentValue, capped at 1). */
  quota: number;
  /** Deposited capital proportionally returned (deposited × quota). */
  capitaleRimborsato: number;
  /** Realized gain (>0) or loss (<0): amount − capitaleRimborsato. */
  plusMinus: number;
  /** Market value left on the position after the withdrawal (to store on the category). */
  newCurrentValue: number;
}

/**
 * Build the transactions for an investment withdrawal, proportional to the
 * deposited capital (no per-share cost basis):
 *
 *   quota              = amount / currentValue   (capped at 1)
 *   capitaleRimborsato = deposited × quota
 *   plusMinus          = amount − capitaleRimborsato
 *
 * Generated (same groupId):
 *  - ALWAYS  investment direction 'out' for capitaleRimborsato → credits toAccount
 *  - plus    income  '__plusvalenza__'  on toAccount (real income, enters savings)
 *  - minus   expense '__minusvalenza__' on toAccount
 *  - fee     expense 'altro' on feeAccount ?? toAccount
 *
 * INVARIANT (tested): net credited to toAccount = amount − fee-on-toAccount.
 * Note on the loss leg: it debits toAccount (capRimborsato credited − loss
 * debited = amount actually received). Booking it on no account would leave the
 * balance over-credited by the loss, because the 'out' leg credits the full
 * capitaleRimborsato — which in a loss exceeds the cash that really arrived.
 */
export function buildInvestmentWithdrawal(input: WithdrawalInput): WithdrawalResult {
  const amount = r2(input.amount);
  const quota = Math.min(1, amount / input.currentValue);
  const capitaleRimborsato = r2(input.deposited * quota);
  const plusMinus = r2(amount - capitaleRimborsato);
  const newCurrentValue = r2(Math.max(0, input.currentValue - amount));
  const groupId = crypto.randomUUID();
  const notes = input.notes?.trim() || undefined;
  const feeVal = input.fee && input.fee > 0 ? r2(input.fee) : 0;

  const transactions: Omit<Transaction, 'id'>[] = [{
    type: 'investment', direction: 'out',
    description: `Disinvestimento · ${input.categoryLabel}`,
    amount: capitaleRimborsato, date: input.date,
    category: input.category, account: input.toAccount,
    notes, groupId,
  }];
  if (plusMinus > 0) {
    transactions.push({
      type: 'income', description: `Plusvalenza · ${input.categoryLabel}`,
      amount: plusMinus, date: input.date,
      category: '__plusvalenza__', account: input.toAccount, groupId,
    });
  } else if (plusMinus < 0) {
    transactions.push({
      type: 'expense', description: `Minusvalenza · ${input.categoryLabel}`,
      amount: r2(-plusMinus), date: input.date,
      category: '__minusvalenza__', account: input.toAccount, groupId,
    });
  }
  if (feeVal > 0) {
    transactions.push({
      type: 'expense', description: `Commissione disinvestimento · ${input.categoryLabel}`,
      amount: feeVal, date: input.date,
      category: 'altro', account: input.feeAccount || input.toAccount, groupId,
    });
  }
  return { transactions, quota, capitaleRimborsato, plusMinus, newCurrentValue };
}
