import { describe, expect, it } from 'vitest';
import type { Transaction } from '../types';
import { aggregateFlow, flowParts, liquidityDelta, netFlowDelta, statisticalNetDelta } from './financialFlow';
const tx=(rest:Partial<Transaction>):Transaction=>({id:'tx',date:'2026-10-10',description:'Purchase',amount:100,type:'expense',category:'food',account:'card',...rest});
describe('deferred credit-card cash flow',()=>{
  it('retains expense statistics while deferring its cash effect',()=>{
    const purchase=tx({cashDelta:0});
    expect(liquidityDelta(purchase)).toBe(0);
    expect(netFlowDelta(purchase)).toBe(0);
    expect(statisticalNetDelta(purchase)).toBe(-100);
    expect(flowParts(purchase).expenses).toBe(0);
    expect(aggregateFlow([purchase])).toMatchObject({expenses:0,cashOut:0,netFlow:0});
  });
  it('counts one bank payment as cash out and keeps it out of expense and income statistics',()=>{
    const payment=tx({type:'transfer',account:'bank',toAccount:'card',cashDelta:-100});
    expect(liquidityDelta(payment)).toBe(-100);
    expect(netFlowDelta(payment)).toBe(-100);
    expect(statisticalNetDelta(payment)).toBe(0);
    expect(aggregateFlow([payment])).toMatchObject({creditCardPayments:100,cashOut:100,cashIn:0,expenses:0,ordinaryIncome:0,netFlow:-100});
  });
  it('keeps a deferred card refund out of both cash and statistical flow',()=>{
    const refund=tx({type:'refund',amount:20,cashDelta:0});
    expect(liquidityDelta(refund)).toBe(0);
    expect(netFlowDelta(refund)).toBe(0);
    expect(statisticalNetDelta(refund)).toBe(0);
    expect(aggregateFlow([refund])).toMatchObject({refundsReceived:0,cashIn:0});
  });
  it('retains income statistics for a deferred card credit without inflating cash',()=>{
    const income=tx({type:'income',amount:20,cashDelta:0});
    expect(statisticalNetDelta(income)).toBe(20);
    expect(aggregateFlow([income])).toMatchObject({ordinaryIncome:0,cashIn:0,netFlow:0});
  });
  it('counts a shared quota transferred from card to bank as cash credit rather than income',()=>{
    const quota=tx({type:'transfer',amount:40,toAccount:'bank',cashDelta:40});
    expect(netFlowDelta(quota)).toBe(40);
    expect(statisticalNetDelta(quota)).toBe(0);
    expect(aggregateFlow([quota])).toMatchObject({creditCardCredits:40,cashIn:40,ordinaryIncome:0,netFlow:40});
  });
  it('preserves TFR and external-contribution information while deferring investment cash',()=>{
    const deposit=tx({type:'investment',amount:100,tfr:30,cashDelta:0});
    expect(statisticalNetDelta(deposit)).toBe(-70);
    expect(aggregateFlow([deposit])).toMatchObject({tfrExcluded:30,investedFromAccounts:0,externalContributions:0,cashOut:0});
    const external=tx({type:'investment',account:'',amount:100,tfr:30,cashDelta:0});
    expect(aggregateFlow([external])).toMatchObject({tfrExcluded:30,externalContributions:70,cashOut:0});
    const withdrawal=tx({type:'investment',direction:'out',cashDelta:0});
    expect(statisticalNetDelta(withdrawal)).toBe(100);
    expect(aggregateFlow([withdrawal])).toMatchObject({capitalReturned:0,cashIn:0});
  });
  it('keeps legacy results byte-for-byte in shape and ignores nonfinite overrides',()=>{
    const normal=tx({account:'bank'}), transfer=tx({type:'transfer',account:'bank',toAccount:'other'});
    const flow=aggregateFlow([normal,transfer]);
    expect(flow).not.toHaveProperty('creditCardPayments');
    expect(flow).not.toHaveProperty('creditCardCredits');
    expect(flow).toEqual(aggregateFlow([{...normal,cashDelta:NaN},transfer]));
    expect(liquidityDelta({...normal,cashDelta:Infinity})).toBe(-100);
    expect(netFlowDelta({...normal,cashDelta:NaN})).toBe(-100);
  });
  it('rounds aggregated card cash components to cents and agrees with individual net flows',()=>{
    const list=[tx({cashDelta:0}),tx({type:'transfer',cashDelta:-10.01}),tx({type:'transfer',cashDelta:-20.02}),tx({type:'transfer',cashDelta:4.03})];
    const flow=aggregateFlow(list);
    expect(flow).toMatchObject({creditCardPayments:30.03,creditCardCredits:4.03,cashOut:30.03,cashIn:4.03,netFlow:-26});
    expect(list.reduce((sum,t)=>sum+netFlowDelta(t),0)).toBeCloseTo(flow.netFlow,8);
  });
});
