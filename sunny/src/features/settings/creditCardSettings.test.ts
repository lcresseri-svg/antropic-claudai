import {describe,it,expect} from 'vitest';
import {updateCreditCardPolicies,assertAccountCanBeRemoved} from './creditCardSettings';
import type {AccountDef} from '../../types';
const bank:AccountDef={id:'bank',label:'Banca',icon:'🏦',color:'#123456'};
const card:AccountDef={id:'card',label:'Carta',icon:'💳',color:'#123456'};
const policy={fromMonth:'2026-09',enabled:true,paymentDay:10,paymentAccountId:'bank'};
const draft={isCreditCard:true,creditCardPaymentDay:10,creditCardPaymentAccountId:'bank',creditCardFromMonth:'2026-10'};
const now='2026-10-28';
describe('credit account configuration',()=>{
 it('starts at the chosen month and leaves ordinary account data alone',()=>{
  expect(updateCreditCardPolicies(card,draft,[bank,card],now)).toEqual([{...policy,fromMonth:'2026-10'}]);
  expect(updateCreditCardPolicies(card,{isCreditCard:false},[bank,card],now)).toBeUndefined();
  expect(card).not.toHaveProperty('creditCardPolicies');
 });
 it('allows explicit historical first activation, but does not rewrite existing policy history',()=>{
  expect(updateCreditCardPolicies(card,{...draft,creditCardFromMonth:'2026-08'},[bank,card],now)?.[0].fromMonth).toBe('2026-08');
  const configured={...card,creditCardPolicies:[policy]};
  expect(updateCreditCardPolicies(configured,{...draft,creditCardPaymentDay:15},[bank,configured],now)).toEqual([policy,{...policy,fromMonth:'2026-10',paymentDay:15}]);
  expect(()=>updateCreditCardPolicies(configured,{...draft,creditCardPaymentDay:15,creditCardFromMonth:'2026-09'},[bank,configured],now)).toThrow(/corrente/);
 });
 it('preserves planned later policies and makes disabling a dated event',()=>{
  const later={...policy,fromMonth:'2026-12',paymentDay:20};
  const configured={...card,creditCardPolicies:[policy,later]};
  expect(updateCreditCardPolicies(configured,{...draft,isCreditCard:false},[bank,configured],now)).toEqual([policy,{...policy,fromMonth:'2026-10',enabled:false},later]);
 });
 it('does not append redundant policy when only account label/color changes',()=>{
  const configured={...card,creditCardPolicies:[policy]};
  expect(updateCreditCardPolicies(configured,draft,[bank,configured],now)).toEqual([policy]);
 });
 it.each([0,32,1.5,NaN])('rejects invalid payment day %s',day=>{
  expect(()=>updateCreditCardPolicies(card,{...draft,creditCardPaymentDay:day},[bank,card],now)).toThrow(/giorno/i);
 });
 it('rejects self, missing, archived, investment and another credit account as payment source',()=>{
  for(const target of [card,undefined,{...bank,archived:true},{...bank,isInvestment:true},{...bank,creditCardPolicies:[policy]}]){
   const accounts=target?[card,target]:[card];
   expect(()=>updateCreditCardPolicies(card,{...draft,creditCardPaymentAccountId:target?.id??'missing'},accounts,now)).toThrow(/conto/i);
  }
 });
 it('prevents converting a bank already used to pay another card and removing that bank',()=>{
  const configured={...card,creditCardPolicies:[policy]};
  expect(()=>updateCreditCardPolicies(bank,{...draft,creditCardPaymentAccountId:'cash'},[bank,configured,{...bank,id:'cash'}],now)).toThrow(/abbinato/i);
  expect(()=>assertAccountCanBeRemoved(bank,[bank,configured],now)).toThrow(/Carta/);
  expect(()=>assertAccountCanBeRemoved(card,[bank,card],now)).not.toThrow();
 });
 it.each(['2026-00','2026-13','October',''])('rejects malformed effective month %s',month=>{
  expect(()=>updateCreditCardPolicies(card,{...draft,creditCardFromMonth:month},[bank,card],now)).toThrow(/mese/i);
 });
});
