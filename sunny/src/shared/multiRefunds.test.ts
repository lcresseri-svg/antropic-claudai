import { describe, it, expect } from 'vitest';
import type { Transaction } from '../types';
import { allocateRefundReceipt, isRefundableSource, refundAllocationRowId, refundGroupIdOf, toRefundCents } from './multiRefunds';
const expense = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, type: 'expense', amount, date: '2026-10-01', description: id, category: id, account: 'bank', ...extra });
const sources = [expense('a', 60), expense('b', 40)];
describe('multi expense refund allocation', () => {
  it.each([[80, [4800,3200], 0], [100,[6000,4000],0], [120,[6000,4000],2000]])('allocates actual receipt %s without moving original dates/categories', (amount, expected, gain) => {
    const result = allocateRefundReceipt(sources, sources, amount);
    expect(result.allocations.map(a => a.allocatedCents)).toEqual(expected);
    expect(result.gainCents).toBe(gain);
    expect(result.refundedCents + result.gainCents).toBe(toRefundCents(amount));
    expect(sources.map(t => [t.amount,t.date,t.category])).toEqual([[60,'2026-10-01','a'],[40,'2026-10-01','b']]);
  });
  it('uses remaining personal portions and excludes the receipt being edited', () => {
    const shared = expense('a',100,{shared:40});
    const refund = { ...expense('r',20),type:'refund' as const,refundOf:'a' };
    const own = {...expense('own',10),type:'refund' as const,refundOf:'a',refundGroupId:'editing'};
    const result = allocateRefundReceipt([shared, expense('b',40)],[shared,refund,own],40,'editing');
    expect(result.allocations.map(a=>[a.availableCents,a.allocatedCents])).toEqual([[4000,2000],[4000,2000]]);
  });
  it('breaks largest-remainder ties by source id, independent of input order', () => {
    const thirds = ['c','b','a'].map(id=>expense(id,1));
    const result=allocateRefundReceipt(thirds,thirds,0.02);
    expect(Object.fromEntries(result.allocations.map(a=>[a.expenseId,a.allocatedCents]))).toEqual({c:0,b:1,a:1});
    expect(result.allocations.reduce((s,a)=>s+a.remainingCents,0)).toBe(298);
  });
  it('handles decimal money and large valid amounts exactly', () => {
    const big=[expense('a',999999999.99),expense('b',0.01)];
    const result=allocateRefundReceipt(big,big,999999999.99);
    expect(result.refundedCents).toBe(99999999999);
    expect(result.allocations.reduce((s,a)=>s+a.allocatedCents,0)).toBe(99999999999);
    expect(toRefundCents(1.005)).toBe(101);
  });
  it('rejects mixed, missing, duplicate, fully-covered or excessive selections and invalid money',()=>{
    for(const invalid of [[],[sources[0],sources[0]],[expense('x',0)],[expense('x',10,{type:'income'})],[expense('x',10,{projected:true})],[expense('x',10,{recurring:{frequency:'monthly'} as any})],Array.from({length:101},(_,i)=>expense(String(i),1))]) {
      expect(()=>allocateRefundReceipt(invalid,invalid,1)).toThrow();
    }
    for(const amount of [0,-1,NaN,Infinity,0.001,1000000001])expect(()=>allocateRefundReceipt(sources,sources,amount)).toThrow();
    expect(()=>allocateRefundReceipt([sources[0]],[{...expense('r',60),type:'refund',refundOf:'a'}],1)).toThrow();
  });
  it('namespaces allocation ids so a source named gain cannot collide with receipt income',()=>{
    expect(refundAllocationRowId('receipt','gain')).not.toBe('receipt__gain');
    expect(refundAllocationRowId('receipt','a')).not.toBe(refundAllocationRowId('receipt','b'));
  });
  it('ignores projected refunds and recognizes group membership without treating groupId as a receipt',()=>{
    expect(allocateRefundReceipt([sources[0]],[{...expense('r',60),type:'refund',refundOf:'a',projected:true}],60).refundedCents).toBe(6000);
    expect(isRefundableSource(expense('x',1))).toBe(true);
    expect(isRefundableSource({...expense('x',1),creditCardSettlement:{}} as any)).toBe(false);
    expect(refundGroupIdOf({...expense('r',1),groupId:'shared'})).toBeUndefined();
  });
});
