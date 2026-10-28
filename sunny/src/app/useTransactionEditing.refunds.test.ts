import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import type { Transaction } from '../types';
import { useTransactionEditing } from './useTransactionEditing';
import { saveRefundReceipt, saveSingleRefund, deleteRefundReceipt } from '../features/transactions/refundReceiptStore';

const state=vi.hoisted(()=>({locals:[] as any[],refs:[] as {current:any}[],index:0,refIndex:0,getHeader:vi.fn(),today:'2026-10-28'}));
vi.mock('react',()=>({
  useState:(initial:any)=>{const i=state.index++;if(!(i in state.locals))state.locals[i]=typeof initial==='function'?initial():initial;return[state.locals[i],(next:any)=>{state.locals[i]=typeof next==='function'?next(state.locals[i]):next;}];},
  useRef:(initial:any)=>state.refs[state.refIndex++]??(state.refs[state.refIndex-1]={current:initial}),
  useMemo:(fn:()=>unknown)=>fn(),
}));
vi.mock('../lib/firebase',()=>({db:{test:true}}));
vi.mock('firebase/firestore',()=>({doc:vi.fn((...args)=>args),getDocFromServer:(...args:unknown[])=>state.getHeader(...args)}));
vi.mock('../shared/featureFlags',()=>({isAdminUser:()=>false}));
vi.mock('../shared/analytics/metrics',()=>({logEvent:vi.fn()}));
vi.mock('../shared/hooks/useTodayRomeISO',()=>({useTodayRomeISO:()=>state.today}));
vi.mock('../features/transactions/refundReceiptStore',()=>({saveSingleRefund:vi.fn(),saveRefundReceipt:vi.fn(),deleteRefundReceipt:vi.fn()}));
const expense=(id:string,amount:number):Transaction=>({id,type:'expense',amount,date:'2026-09-01',description:id,category:'food',account:'bank'});
const sources=[expense('a',60),expense('b',40)];
const tx={transactions:sources,allTransactions:sources,addTransactions:vi.fn(),replaceInPlace:vi.fn(),replaceGroup:vi.fn(),deleteTransactions:vi.fn()};
function hook(rows:Transaction[]=sources){state.index=0;state.refIndex=0;return useTransactionEditing({uid:'user'} as User,{...tx,transactions:rows,allTransactions:rows} as unknown as Parameters<typeof useTransactionEditing>[1]);}
describe('transaction refund and card editor routing',()=>{
  beforeEach(()=>{state.locals=[];state.refs=[];state.today='2026-10-28';vi.clearAllMocks();state.getHeader.mockResolvedValue({exists:()=>true,data:()=>({expenseIds:['a','b','zero-allocation-source']})});});
  it('keeps single-sheet save identity across a failed retry, with a new identity for the next flow',async()=>{
    hook().openSelectedRefund(['a']);expect(hook().refundOpen).toBe(true);expect(hook().multiRefundOpen).toBe(false);
    const data={...sources[0],type:'refund' as const,refundOf:'a',amount:20};
    vi.mocked(saveSingleRefund).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    await expect(hook().saveRefund(data)).rejects.toThrow('offline');
    await hook().saveRefund(data);
    const first=vi.mocked(saveSingleRefund).mock.calls[0][2];expect(vi.mocked(saveSingleRefund).mock.calls[1][2]).toBe(first);
    expect(tx.addTransactions).not.toHaveBeenCalled();expect(tx.replaceInPlace).not.toHaveBeenCalled();
    hook().closeRefund();hook().openRefund('a');await hook().saveRefund(data);
    expect(vi.mocked(saveSingleRefund).mock.calls[2][2]).not.toBe(first);
  });
  it('opens multiple sources and routes every allocation and gain through the complete receipt header',async()=>{
    hook().openSelectedRefund(['a','b']);expect(hook().multiRefundExpenseIds).toEqual(['a','b']);expect(hook().refundOpen).toBe(false);
    hook().closeMultiRefund();
    const gain={...expense('gain',20),type:'income' as const,refundGroupId:'receipt'};
    hook().openEdit(gain);expect(hook().multiRefundLoading).toBe(true);expect(hook().modalOpen).toBe(false);
    await Promise.resolve();expect(hook().multiRefundExpenseIds).toEqual(['a','b','zero-allocation-source']);expect(hook().multiRefundGroupId).toBe('receipt');
    const draft={receiptId:'receipt',expenseIds:['a','b'],amount:120,date:'2026-10-01',account:'bank'};
    await hook().saveMultiRefund(draft);expect(saveRefundReceipt).toHaveBeenCalledWith(expect.anything(),'user',draft);
    await hook().deleteMultiRefund();expect(deleteRefundReceipt).toHaveBeenCalledWith(expect.anything(),'user','receipt');
    hook().openRefund(undefined,{...gain,type:'refund',refundOf:'a'});expect(hook().refundOpen).toBe(false);
  });
  it('keeps an unavailable receipt visibly blocked and rejects mixed new selections',async()=>{
    state.getHeader.mockRejectedValueOnce(new Error('Connessione assente'));
    hook().openEdit({...expense('gain',20),type:'income',refundGroupId:'receipt'});
    await Promise.resolve();expect(hook().multiRefundError).toBe('Connessione assente');expect(hook().multiRefundExpenseIds).toEqual([]);
    expect(()=>hook([...sources,{...expense('income',10),type:'income'}]).openSelectedRefund(['a','income'])).toThrow();
  });
  it('shows automatic settlements in read-only detail even through direct startEdit',()=>{
    const settlement={...expense('__cc__card__2026-09',100),type:'transfer' as const,toAccount:'card'};
    hook().openEdit(settlement);expect(hook().settlementDetail).toEqual(settlement);expect(hook().modalOpen).toBe(false);
    hook().closeSettlementDetail();hook().startEdit(settlement,false);expect(hook().settlementDetail).toEqual(settlement);expect(hook().modalOpen).toBe(false);
  });
  it('propagates an ordinary edit failure while retaining its original editor state',async()=>{
    hook().startEdit(sources[0],false);
    tx.replaceInPlace.mockRejectedValueOnce(new Error('offline'));
    await expect(hook().handleSave(['a'],[{...sources[0],amount:50}])).rejects.toThrow('offline');
    expect(hook().modalOpen).toBe(true);expect(hook().editing).toEqual(sources[0]);
  });
  it('advances projections with the Rome day and preserves today when dissolving a series',async()=>{
    const source={...sources[0],date:'2026-10-27',seriesId:'series',recurring:{freq:'daily' as const,until:'2026-10-30'}};
    const todayOccurrence={...sources[1],date:'2026-10-29',seriesId:'series'};
    const rows=[source,todayOccurrence];
    expect(hook(rows).projected.map(t=>t.date)).toContain('2026-10-28');
    state.today='2026-10-29';
    expect(hook(rows).projected.map(t=>t.date)).not.toContain('2026-10-28');
    hook(rows).startEdit(source,true);
    await hook(rows).handleSave(['a'],[{...source,recurring:undefined}]);
    expect(tx.replaceInPlace).toHaveBeenCalledWith('b',expect.objectContaining({date:'2026-10-29'}));
    expect(tx.replaceInPlace.mock.calls.find(call=>call[0]==='b')![1]).not.toHaveProperty('seriesId');
    expect(tx.deleteTransactions).not.toHaveBeenCalled();
  });
});
