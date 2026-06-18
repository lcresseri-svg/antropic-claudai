// Soft-delete of categories and accounts. Pure, React-free, easy to unit-test.
//
// Rule: deleting a definition that is REFERENCED in the transaction history must
// NOT drop it (that would orphan every historical row that points to it). Instead
// it's marked `archived: true` — kept in the source-of-truth array (so getCat /
// getAcc keep resolving it for display) but hidden from every picker / management
// / planning list via `visibleDefs`. A definition that was never used is removed
// outright, exactly as before.

import { Transaction, CategoryDef, AccountDef } from '../../types';

/** True when at least one transaction references this category. */
export const isCategoryUsed = (transactions: Transaction[], id: string): boolean =>
  transactions.some(t => t.category === id);

/** True when at least one transaction references this account (source or destination). */
export const isAccountUsed = (transactions: Transaction[], id: string): boolean =>
  transactions.some(t => t.account === id || t.toAccount === id);

/**
 * Remove a category. Returns the FULL definitions array (the source of truth that
 * saveCategories must persist): archived in place if referenced, filtered out otherwise.
 */
export function removeCategoryDef(
  categories: CategoryDef[], id: string, transactions: Transaction[],
): CategoryDef[] {
  return isCategoryUsed(transactions, id)
    ? categories.map(c => (c.id === id ? { ...c, archived: true } : c))
    : categories.filter(c => c.id !== id);
}

/** Remove an account. See removeCategoryDef. */
export function removeAccountDef(
  accounts: AccountDef[], id: string, transactions: Transaction[],
): AccountDef[] {
  return isAccountUsed(transactions, id)
    ? accounts.map(a => (a.id === id ? { ...a, archived: true } : a))
    : accounts.filter(a => a.id !== id);
}

/** Non-archived subset — what every picker / enumeration / planning list shows. */
export const visibleDefs = <T extends { archived?: boolean }>(defs: T[]): T[] =>
  defs.filter(d => !d.archived);
