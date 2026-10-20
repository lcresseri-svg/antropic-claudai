import type { AccountDef } from '../types';

/** Display availability only; the financial calculations keep their semantics. */
export function hasRecordedAccountBalance(accounts: Pick<AccountDef,'id'|'initialBalance'|'excludeFromNetWorth'>[], balances: Record<string,number>) {
  const excluded = new Set(accounts.filter(a=>a.excludeFromNetWorth).map(a=>a.id));
  return accounts.some(a=>!a.excludeFromNetWorth && typeof a.initialBalance==='number' && Number.isFinite(a.initialBalance))
    || Object.entries(balances).some(([id,value])=>!excluded.has(id) && Number.isFinite(value));
}
