import { describe, expect, it } from 'vitest';
import { refundAdjustedOwnShare, withExpenseRefundStatistics, type RefundStatisticsTransaction } from '../functions/src/domain/refundStatistics';

const expense=(id:string,amount:number,rest:Partial<RefundStatisticsTransaction>={}):RefundStatisticsTransaction=>({id,type:'expense',amount,date:'2026-10-02',...rest});
const refund=(id:string,refundOf:string,amount:number,rest:Partial<RefundStatisticsTransaction>={}):RefundStatisticsTransaction=>({id,type:'refund',refundOf,amount,date:'2026-10-20',...rest});
describe('AI expense refund statistics',()=>{
  it('attributes an 80 receipt to the original 60/40 expenses as 12/8 residual costs',()=>{
    const sources=[expense('a',60,{date:'2026-09-10'}),expense('b',40)];
    const rows=withExpenseRefundStatistics([...sources,refund('ra','a',48),refund('rb','b',32)],'2026-10-28');
    expect(rows.slice(0,2).map(refundAdjustedOwnShare)).toEqual([12,8]);
    expect(rows.slice(0,2).map(row=>row.date)).toEqual(['2026-09-10','2026-10-02']);
    expect(sources).not.toHaveProperty('0.refundedTotal');
  });
  it('keeps gain20 as ordinary income and leaves investment amounts unaffected',()=>{
    const rows=withExpenseRefundStatistics([
      expense('a',60),expense('b',40),refund('ra','a',60),refund('rb','b',40),
      {id:'gain',type:'income',amount:20,date:'2026-10-20',refundedTotal:999},
      {id:'invest',type:'investment',amount:50,date:'2026-10-20',refundedTotal:999},
    ],'2026-10-28');
    expect(rows.slice(0,2).map(refundAdjustedOwnShare)).toEqual([0,0]);
    expect(rows.filter(t=>t.type==='income').reduce((sum,t)=>sum+(t.amount??0),0)).toBe(20);
    expect(refundAdjustedOwnShare(rows[4])).toBe(20);
    expect(refundAdjustedOwnShare(rows[5])).toBe(50);
  });
  it('ignores future and projected refunds while counting same-day receipts',()=>{
    const rows=withExpenseRefundStatistics([
      expense('a',100),refund('today','a',10,{date:'2026-10-28'}),
      refund('future','a',20,{date:'2026-10-29'}),refund('projected','a',30,{projected:true}),
    ],'2026-10-28');
    expect(refundAdjustedOwnShare(rows[0])).toBe(90);
  });
  it('subtracts real refunds from the personal share and clamps fully covered costs at zero',()=>{
    const rows=withExpenseRefundStatistics([
      expense('a',100,{shared:40}),refund('partial','a',40),
      expense('b',0.3),refund('cent1','b',0.1),refund('cent2','b',0.2),
      expense('c',10),refund('legacy-over','c',20),
    ],'2026-10-28');
    expect(rows.filter(t=>t.type==='expense').map(refundAdjustedOwnShare)).toEqual([20,0,0]);
  });
});
