import type { AccountDef, Transaction } from '../types';
import { accountDelta } from './financialFlow';
import { deferredCardDelta } from '../../../functions/src/domain/creditCards';

/** Ledger balances retain card liabilities. Cash removes only dated deferred
 * legs, preserving existing initial balances and all preactivation history.
 * Callers supply realized transactions (no templates, future or projections).
 */
export function calculateAccountPositions(transactions: readonly Transaction[], accounts: readonly AccountDef[]) {
  const balances: Record<string, number> = {};
  const deferredBalances: Record<string, number> = {};
  const byId = new Map(accounts.map(a => [a.id, a]));
  for (const account of accounts) if (account.initialBalance) balances[account.id] = account.initialBalance;
  for (const tx of transactions) {
    const ids = new Set([tx.account, ...(tx.type === 'transfer' && tx.toAccount ? [tx.toAccount] : [])]);
    for (const id of ids) {
      if (!id) continue;
      balances[id] = (balances[id] ?? 0) + accountDelta(tx, id);
      const account = byId.get(id);
      if (account?.creditCardPolicies?.length) deferredBalances[id] = (deferredBalances[id] ?? 0) + deferredCardDelta(tx, account);
    }
  }
  const included = (id:string) => !byId.get(id)?.excludeFromNetWorth;
  const round = (n:number) => Math.round(n * 100) / 100;
  for (const id of Object.keys(balances)) balances[id] = round(balances[id]);
  for (const id of Object.keys(deferredBalances)) deferredBalances[id] = round(deferredBalances[id]);
  const ledgerTotal = round(Object.entries(balances).reduce((s,[id,v])=>s+(included(id)?v:0),0));
  const deferredBalance = round(Object.entries(deferredBalances).reduce((s,[id,v])=>s+(included(id)?v:0),0));
  return { balances, deferredBalances, ledgerTotal, deferredBalance, liquidity:round(ledgerTotal-deferredBalance) };
}
