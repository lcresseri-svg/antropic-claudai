import { describe, it, expect } from 'vitest';
import { Transaction, CategoryDef, AccountDef } from '../../types';
import { isCategoryUsed, isAccountUsed, removeCategoryDef, removeAccountDef, visibleDefs } from './softDelete';

const cat = (id: string, extra: Partial<CategoryDef> = {}): CategoryDef =>
  ({ id, label: id, icon: '•', color: '#888', kind: 'expense', ...extra });
const acc = (id: string, extra: Partial<AccountDef> = {}): AccountDef =>
  ({ id, label: id, icon: '🏦', color: '#888', ...extra });

const tx = (over: Partial<Transaction>): Transaction =>
  ({ id: 'x', date: '2026-01-01', description: '', amount: 1, type: 'expense', category: 'spesa', account: 'cc', ...over });

describe('softDelete — categories', () => {
  const categories = [cat('spesa'), cat('svago'), cat('casa')];

  it('archives (keeps) a category referenced in the history', () => {
    const txs = [tx({ category: 'svago' })];
    const next = removeCategoryDef(categories, 'svago', txs);
    // still present in the full array (so getCat keeps resolving it for history)…
    const archived = next.find(c => c.id === 'svago');
    expect(archived).toBeDefined();
    expect(archived?.archived).toBe(true);
    expect(next).toHaveLength(categories.length);
    // …but hidden from the visible subset that feeds pickers/enumerations.
    expect(visibleDefs(next).some(c => c.id === 'svago')).toBe(false);
  });

  it('hard-removes a category that was never used', () => {
    const txs = [tx({ category: 'spesa' })];
    const next = removeCategoryDef(categories, 'casa', txs);
    expect(next.find(c => c.id === 'casa')).toBeUndefined();
    expect(next).toHaveLength(categories.length - 1);
  });

  it('isCategoryUsed reflects references', () => {
    const txs = [tx({ category: 'spesa' })];
    expect(isCategoryUsed(txs, 'spesa')).toBe(true);
    expect(isCategoryUsed(txs, 'casa')).toBe(false);
  });
});

describe('softDelete — accounts', () => {
  const accounts = [acc('cc'), acc('risparmio'), acc('contanti')];

  it('archives an account referenced as the source account', () => {
    const txs = [tx({ account: 'risparmio' })];
    const next = removeAccountDef(accounts, 'risparmio', txs);
    expect(next.find(a => a.id === 'risparmio')?.archived).toBe(true);
    expect(next).toHaveLength(accounts.length);
    expect(visibleDefs(next).some(a => a.id === 'risparmio')).toBe(false);
  });

  it('archives an account referenced as a transfer destination (toAccount)', () => {
    const txs = [tx({ type: 'transfer', account: 'cc', toAccount: 'risparmio' })];
    expect(isAccountUsed(txs, 'risparmio')).toBe(true);
    const next = removeAccountDef(accounts, 'risparmio', txs);
    expect(next.find(a => a.id === 'risparmio')?.archived).toBe(true);
  });

  it('hard-removes an unused account', () => {
    const txs = [tx({ account: 'cc' })];
    const next = removeAccountDef(accounts, 'contanti', txs);
    expect(next.find(a => a.id === 'contanti')).toBeUndefined();
    expect(next).toHaveLength(accounts.length - 1);
  });
});

describe('visibleDefs', () => {
  it('excludes archived entries while keeping the rest in order', () => {
    const defs = [cat('a'), cat('b', { archived: true }), cat('c')];
    expect(visibleDefs(defs).map(c => c.id)).toEqual(['a', 'c']);
  });

  it('an archived entry stays resolvable in the full array (getCat semantics)', () => {
    // getCat does `categories.find(c => c.id === id)` against the FULL array, so an
    // archived entry that remains in that array is still resolved for display.
    const full = [cat('a'), cat('b', { archived: true })];
    expect(full.find(c => c.id === 'b')).toBeDefined();
    expect(visibleDefs(full).find(c => c.id === 'b')).toBeUndefined();
  });
});
