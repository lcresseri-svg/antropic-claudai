import { describe,it,expect } from 'vitest';
import { transactionRoute, readTransactionRange } from './transactionRoute';
describe('transaction route period contract',()=>{
 it('carries category, type and local dates without converting Rome midnight to UTC',()=>{
  const url=transactionRoute({cat:'casa & utenze',type:'expense'},new Date(2026,8,1),new Date(2026,8,30));
  const q=new URLSearchParams(url.split('?')[1]);
  expect(q.get('cat')).toBe('casa & utenze');expect(q.get('from')).toBe('2026-09-01');expect(q.get('to')).toBe('2026-09-30');
 });
 it('rejects malformed, impossible and reversed dates',()=>{
  for(const q of ['from=2026-02-31&to=2026-03-01','from=https://evil&to=2026-10-12','from=2026-10-12&to=2026-09-01'])expect(readTransactionRange(new URLSearchParams(q))).toBeNull();
 });
 it('accepts leap days and an inclusive one-day interval',()=>expect(readTransactionRange(new URLSearchParams('from=2024-02-29&to=2024-02-29'))).toEqual({from:'2024-02-29',to:'2024-02-29'}));
});
