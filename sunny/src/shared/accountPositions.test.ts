import { describe, it, expect } from 'vitest';
import type { AccountDef, Transaction } from '../types';
import { calculateAccountPositions } from './accountPositions';
import { resolveCreditCardTransactions } from '../../../functions/src/domain/creditCards';
const accounts:AccountDef[]=[{id:'bank',label:'Banca',icon:'',color:'#888',initialBalance:1000},{id:'card',label:'Carta',icon:'',color:'#888',creditCardPolicies:[{fromMonth:'2026-10',enabled:true,paymentDay:10,paymentAccountId:'bank'}]}];
const expense:Transaction={id:'e',date:'2026-10-01',type:'expense',description:'Acquisto',amount:100,category:'food',account:'card'};
const at=(tx:Transaction[],date:string,a=accounts)=>calculateAccountPositions(resolveCreditCardTransactions(tx,a,date).filter(t=>t.date<=date),a);
describe('credit-card cash and ledger positions',()=>{
 it('keeps cash until payment, while retaining the debt in net worth',()=>{
  expect(at([expense],'2026-10-31')).toMatchObject({balances:{bank:1000,card:-100},liquidity:1000,ledgerTotal:900,deferredBalance:-100});
  expect(at([expense],'2026-11-10')).toMatchObject({balances:{bank:900,card:0},liquidity:900,ledgerTotal:900,deferredBalance:0});
 });
 it('preserves initial card funds and preactivation movements',()=>{
  const a=accounts.map(x=>x.id==='card'?{...x,initialBalance:50}:x);
  expect(at([{...expense,id:'old',date:'2026-09-30',amount:20},expense],'2026-10-31',a)).toMatchObject({liquidity:1030,ledgerTotal:930});
 });
 it('a bank refund increases cash now without reducing the card bill',()=>{
  const r:Transaction={...expense,id:'r',type:'refund',refundOf:'e',amount:30,account:'bank',date:'2026-10-20'};
  expect(at([expense,r],'2026-10-31')).toMatchObject({liquidity:1030,ledgerTotal:930});
  expect(at([expense,r],'2026-11-10')).toMatchObject({liquidity:930,ledgerTotal:930});
 });
 it('a card refund reduces debt, then the bank payment',()=>{
  const r:Transaction={...expense,id:'r',type:'refund',refundOf:'e',amount:30,date:'2026-10-20'};
  expect(at([expense,r],'2026-10-31')).toMatchObject({liquidity:1000,ledgerTotal:930});
  expect(at([expense,r],'2026-11-10')).toMatchObject({liquidity:930,ledgerTotal:930});
 });
 it('includes the shared card leg in the bill but not as extra personal spending',()=>{
  const shared={...expense,shared:40};
  const leg:Transaction={...expense,id:'leg',type:'transfer',amount:40,toAccount:'bank'};
  expect(at([shared,leg],'2026-10-31')).toMatchObject({liquidity:1040,ledgerTotal:940});
  expect(at([shared,leg],'2026-11-10')).toMatchObject({liquidity:940,ledgerTotal:940});
 });
 it('keeps excluded balances available without including them in totals',()=>{
  const a=accounts.map(x=>x.id==='card'?{...x,excludeFromNetWorth:true}:x);
  expect(at([expense],'2026-10-31',a)).toMatchObject({balances:{bank:1000,card:-100},liquidity:1000,ledgerTotal:1000,deferredBalance:0});
 });
});
