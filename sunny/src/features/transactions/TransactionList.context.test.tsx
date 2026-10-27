import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import {PageToolbar} from '../../shared/components/PageToolbar';
import { TransactionList } from './TransactionList';

const state = vi.hoisted(() => ({ query: new URLSearchParams(), session: new Map<string, unknown>(), version: '3.0', locals: [] as unknown[], refs: [] as {current:any}[], index: 0, refIndex: 0, effects: [] as (()=>void)[], dirty: false }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: any) => {
    const index=state.index++;
    if (!(index in state.locals)) state.locals[index]=typeof initial==='function'?initial():initial;
    return [state.locals[index], (next:any)=>{ const value=typeof next==='function'?next(state.locals[index]):next; if(!Object.is(value,state.locals[index])){state.locals[index]=value;state.dirty=true;} }];
  },
  useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
  useEffect: (fn:()=>void)=>state.effects.push(fn), useLayoutEffect: vi.fn(), useRef: (initial:any) => state.refs[state.refIndex++] ?? (state.refs[state.refIndex-1]={current:initial}),
}));
vi.mock('react-router-dom', () => ({ useSearchParams: () => [state.query, (update: URLSearchParams | ((p: URLSearchParams) => URLSearchParams)) => { state.query = typeof update === 'function' ? update(new URLSearchParams(state.query)) : update; }] }));
vi.mock('../../shared/providers/UiVersionProvider', () => ({
  useUiVersion: () => state.version, useUiNavigationMemory: () => state.session,
  useUiSessionState: (key: string, initial: unknown) => [state.session.has(key) ? state.session.get(key) : initial, (value: unknown) => state.session.set(key, value)],
}));
vi.mock('../../shared/providers/settings', () => ({ useSettings: () => ({
  categories: [], accounts: [], theme: 'light',
  getCat: (id: string) => ({ id, label: id, icon: '', kind: 'expense' }),
  getAcc: (id: string) => ({ id, label: id, icon: '' }),
}) }));
const props = { transactions: [], onEdit: vi.fn(), onDelete: vi.fn(), onBulkUpdate: vi.fn(), onBulkDelete: vi.fn(), onAdd: vi.fn() };
function nodes(node: ReactNode): ReactElement<any>[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  const el = node as ReactElement<any>;
  return [el, ...nodes(el.props?.children)];
}
function view(transactions:Parameters<typeof TransactionList>[0]['transactions']=[]) {
  let result:ReactElement<any>[]=[];
  for(let i=0;i<8;i++) {
    state.index=0; state.refIndex=0; state.dirty=false;
    result=nodes(TransactionList({...props,transactions}));
    state.effects.splice(0).forEach(fn=>fn());
    if(!state.dirty)return result;
  }
  throw new Error('Unstable list render');
}
function click(label: string) {
  const target = view().find(el => el.props['aria-label'] === label || el.props.children === label || el.props.label === label);
  expect(target, label).toBeDefined(); target!.props.onClick();
}
function value(name: string) { return state.session.get(`transactions.${name}:${state.query.toString()}`); }

describe('Movimenti independent context', () => {
  beforeEach(() => { state.query = new URLSearchParams('cat=food&account=bank&from=2026-09-01&to=2026-09-30'); state.session.clear(); state.version = '3.0'; state.locals=[]; state.refs=[]; state.effects=[]; });
  it('removes a category while preserving search, account, period, grouping and order after route remount', () => {
    const key = state.query.toString();
    for (const [name, value] of Object.entries({ search: 'market', period: '3m', group: 'account', sort: 'amount', direction: 'asc', projected: '30d' })) state.session.set(`transactions.${name}:${key}`, value);
    const chip = view().find(el => el.props['aria-label'] === 'Rimuovi categoria');
    expect(chip).toBeDefined(); chip!.props.onClick(); view();
    expect(state.query.has('cat')).toBe(false);
    expect(state.query.get('account')).toBe('bank');
    expect(state.query.get('from')).toBe('2026-09-01');
    expect(value('search')).toBe('market');
    expect(value('period')).toBe('3m');
    expect(value('sort')).toBe('amount');
    expect(value('direction')).toBe('asc');
    expect(value('group')).toBe('account');
    expect(value('projected')).toBe('30d');
    state.query = new URLSearchParams('cat=travel');
    expect(view().find(el => el.type === 'input')?.props.value ?? '').toBe('');
  });
  it('keeps the title and labeled search visible, with Filtri outside the type scroller', () => {
    const tree = view();
    expect(tree.some(el => el.type === PageToolbar && el.props.title === 'Movimenti')).toBe(true);
    const scroller = tree.find(el => el.props.className?.includes('overflow-x-auto'))!;
    expect(nodes(scroller).some(el => el.props.children === 'Filtri')).toBe(false);
    expect(tree.some(el => el.props.children === 'Filtri')).toBe(true);
    expect(tree.some(el => el.type === 'input' && el.props['aria-label'] === 'Cerca movimenti')).toBe(true);
  });
  it('clears criteria without clearing search or ordering and clears search independently', () => {
    const key = state.query.toString();
    state.session.set(`transactions.search:${key}`, 'market');
    state.session.set(`transactions.sort:${key}`, 'amount');
    state.session.set(`transactions.direction:${key}`, 'asc');
    click('Azzera filtri'); view();
    expect(state.query.toString()).toBe('');
    expect(value('search')).toBe('market');
    expect(value('sort')).toBe('amount');
    expect(value('direction')).toBe('asc');
    click('Cancella ricerca');
    expect(value('search')).toBe('');
    expect(value('sort')).toBe('amount');
  });
  it('reports when an edited movement leaves the current selection without changing the criteria', () => {
    const tx={id:'original',type:'expense' as const,date:'2026-09-15',description:'Market',amount:20,account:'bank',category:'food'};
    const before=view([tx]);
    before.find(el=>el.props.tx?.id==='original')!.props.onClick(tx);
    const after=view([{...tx,category:'travel'}]);
    expect(after.some(el=>el.props.role==='status' && String(el.props.children).includes('non rientra'))).toBe(true);
    expect(state.query.get('cat')).toBe('food');
    expect(state.query.get('account')).toBe('bank');
  });
  it('retains the UI2 collapsed search control', () => {
    state.version = '2.0';
    expect(view().some(el => el.props.label === 'Cerca')).toBe(true);
    expect(view().some(el => el.type === 'input')).toBe(false);
  });
});
