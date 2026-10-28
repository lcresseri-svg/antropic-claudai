/** Shared client/server credit-card ledger. No Firebase or UI dependencies. */
export interface CreditCardPolicy {
  fromMonth: string;
  enabled: boolean;
  paymentDay: number;
  paymentAccountId: string;
}
export interface CreditCardSettlement {
  cardId: string;
  period: string;
  paymentDay: number;
  paymentAccountId: string;
  policyFromMonth: string;
}
export interface CreditCardAccount {
  id: string;
  label?: string;
  isInvestment?: boolean;
  archived?: boolean;
  creditCardPolicies?: CreditCardPolicy[];
}
export interface CreditCardTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'expense' | 'income' | 'investment' | 'transfer' | 'refund';
  category: string;
  account: string;
  toAccount?: string;
  shared?: number;
  direction?: 'in' | 'out';
  tfr?: number;
  recurring?: { freq: 'daily' | 'weekly' | 'monthly' | 'yearly'; until?: string };
  projected?: boolean;
  createdAt?: number;
  creditCardSettlement?: CreditCardSettlement;
  /** CLIENT ONLY. Cash effect after removing deferred card legs. Never store. */
  cashDelta?: number;
}
export interface CreditCardSettlementTransaction extends CreditCardTransaction {
  type: 'transfer';
  toAccount: string;
  creditCardSettlement: CreditCardSettlement;
}
export const CREDIT_CARD_SETTLEMENT_PREFIX = '__cc__';
const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);
const money = (amount: number) => amount / 100;
const validMonth = (period: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period);

/** Latest dated policy; an explicit disabled entry stops new deferral. */
export function creditCardPolicyForMonth(account: CreditCardAccount, period: string): CreditCardPolicy | undefined {
  let selected: CreditCardPolicy | undefined;
  for (const policy of account.creditCardPolicies ?? []) {
    if (!validMonth(policy.fromMonth) || policy.fromMonth > period) continue;
    if (!selected || policy.fromMonth >= selected.fromMonth) selected = policy;
  }
  return selected;
}

export function isCreditCardSettlement(tx: Pick<CreditCardTransaction, 'id' | 'creditCardSettlement'>): boolean {
  return !!tx.creditCardSettlement || tx.id.startsWith(CREDIT_CARD_SETTLEMENT_PREFIX);
}

/** Same account ledger as financialFlow.accountDelta, in integer cents. */
function accountCents(tx: CreditCardTransaction, accountId: string): number {
  if (!accountId || !Number.isFinite(tx.amount)) return 0;
  const amount = cents(tx.amount);
  if (tx.type === 'transfer') return (tx.toAccount === accountId ? amount : 0) - (tx.account === accountId ? amount : 0);
  if (tx.account !== accountId) return 0;
  if (tx.type === 'expense') return -Math.max(0, amount - cents(tx.shared ?? 0));
  if (tx.type === 'income' || tx.type === 'refund') return amount;
  if (tx.type === 'investment') return tx.direction === 'out' ? amount : -(amount - Math.max(0, Math.min(amount, cents(tx.tfr ?? 0))));
  return 0;
}

/** Portion of an account movement carried as card liability rather than cash.
 * The settlement's card leg belongs to its SOURCE period, not its payment month.
 */
export function deferredCardDelta(tx: CreditCardTransaction, account: CreditCardAccount): number {
  if (tx.creditCardSettlement) {
    return tx.creditCardSettlement.cardId === account.id ? money(accountCents(tx, account.id)) : 0;
  }
  const policy = creditCardPolicyForMonth(account, tx.date.slice(0, 7));
  return policy?.enabled ? money(accountCents(tx, account.id)) : 0;
}

export function creditCardSettlementId(cardId: string, period: string): string {
  return `${CREDIT_CARD_SETTLEMENT_PREFIX}${encodeURIComponent(cardId)}__${period}`;
}

/** Following calendar month, clamped independently so February never shifts March. */
export function creditCardPaymentDate(period: string, paymentDay: number): string {
  const [year, month] = period.split('-').map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(paymentDay, last));
  return next.toISOString().slice(0, 10);
}

function frozenPolicy(row: CreditCardTransaction | undefined, current: CreditCardPolicy | undefined, todayISO: string): CreditCardPolicy | undefined {
  const saved = row?.creditCardSettlement;
  if (saved && row!.date <= todayISO) {
    return { fromMonth: saved.policyFromMonth, enabled: true, paymentDay: saved.paymentDay, paymentAccountId: saved.paymentAccountId };
  }
  return current;
}

function validPaymentAccount(card: CreditCardAccount, policy: CreditCardPolicy, accounts: readonly CreditCardAccount[], paymentMonth: string, existingBankId?: string): boolean {
  if (!Number.isInteger(policy.paymentDay) || policy.paymentDay < 1 || policy.paymentDay > 31) return false;
  const bank = accounts.find(a => a.id === policy.paymentAccountId);
  return !!bank && bank.id !== card.id && !bank.isInvestment && (!bank.archived || existingBankId === bank.id)
    && !creditCardPolicyForMonth(bank, paymentMonth)?.enabled;
}

/** Canonical known statements, including future dated payments. Source events
 * must be persisted documents, never templates or virtual rows. Future dated
 * purchases contribute only to their own future payment.
 * Net credits roll forward and never produce a fictional bank credit.
 */
export function buildCreditCardSettlements(txs: readonly CreditCardTransaction[], accounts: readonly CreditCardAccount[], todayISO: string): CreditCardSettlementTransaction[] {
  const stored = new Map<string, CreditCardTransaction>();
  for (const tx of txs) if (tx.creditCardSettlement) stored.set(creditCardSettlementId(tx.creditCardSettlement.cardId, tx.creditCardSettlement.period), tx);
  const sources = txs.filter(t => !isCreditCardSettlement(t) && !t.recurring && !t.projected);
  const result: CreditCardSettlementTransaction[] = [];
  for (const card of accounts) {
    if (!(card.creditCardPolicies?.length)) continue;
    const totals = new Map<string, number>();
    const policies = new Map<string, CreditCardPolicy>();
    for (const tx of sources) {
      const period = tx.date.slice(0, 7);
      if (!validMonth(period)) continue;
      const old = stored.get(creditCardSettlementId(card.id, period));
      const policy = frozenPolicy(old, creditCardPolicyForMonth(card, period), todayISO);
      if (!policy?.enabled) continue;
      const delta = accountCents(tx, card.id);
      if (delta === 0) continue;
      totals.set(period, (totals.get(period) ?? 0) - delta);
      policies.set(period, policy);
    }
    let credit = 0;
    for (const period of [...totals.keys()].sort()) {
      const total = totals.get(period)! + credit;
      credit = Math.min(0, total);
      if (total <= 0) continue;
      const id = creditCardSettlementId(card.id, period);
      const old = stored.get(id);
      const policy = policies.get(period)!;
      const frozen = !!old?.creditCardSettlement && old.date <= todayISO;
      if (!Number.isInteger(policy.paymentDay) || policy.paymentDay < 1 || policy.paymentDay > 31) continue;
      const date = frozen ? old!.date : creditCardPaymentDate(period, policy.paymentDay);
      // A paid statement retains its real route even if that bank was later
      // archived/retyped. New instructions must always name a usable cash bank.
      if (!frozen && !validPaymentAccount(card, policy, accounts, date.slice(0, 7), old?.creditCardSettlement?.paymentAccountId)) continue;
      result.push({
        id, date, type: 'transfer', amount: money(total),
        description: `Addebito carta · ${card.label ?? card.id} · ${period}`,
        category: 'trasferimento', account: policy.paymentAccountId, toAccount: card.id,
        creditCardSettlement: {
          cardId: card.id, period, paymentDay: policy.paymentDay,
          paymentAccountId: policy.paymentAccountId, policyFromMonth: policy.fromMonth,
        },
      });
    }
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** Client canonical overlay makes pending writes and delayed triggers harmless. */
export function resolveCreditCardTransactions<T extends CreditCardTransaction>(txs: readonly T[], accounts: readonly CreditCardAccount[], todayISO: string): T[] {
  return [...txs.filter(t => !isCreditCardSettlement(t)), ...buildCreditCardSettlements(txs, accounts, todayISO) as T[]];
}

/** Annotate ONLY affected movements; preserve the legacy math for every other
 * transaction. Remove inherited derived values before recomputing an annotation.
 */
export function withCreditCardCashEffects<T extends CreditCardTransaction>(txs: readonly T[], accounts: readonly CreditCardAccount[]): T[] {
  return txs.map(tx => {
    const { cashDelta: _derived, ...rest } = tx;
    const deferred = accounts.reduce((sum, account) => sum + cents(deferredCardDelta(tx, account)), 0);
    if (deferred === 0) return rest as T;
    let base = 0;
    if (tx.type === 'income' || tx.type === 'refund') base = cents(tx.amount);
    else if (tx.type === 'expense') base = -Math.max(0, cents(tx.amount) - cents(tx.shared ?? 0));
    else if (tx.type === 'investment' && tx.account) base = accountCents(tx, tx.account);
    return { ...rest, cashDelta: money(base - deferred) } as T;
  });
}
