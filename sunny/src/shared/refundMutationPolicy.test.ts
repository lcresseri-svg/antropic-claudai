import {it,expect} from 'vitest';
import type {Transaction} from '../types';
import {assertOrdinaryMutation,assertSeriesMutations} from './refundMutationPolicy';
const expense:Transaction={id:'e',date:'2026-10-01',type:'expense',amount:100,description:'X',account:'bank',category:'food'};
const refund:Transaction={...expense,id:'r',type:'refund',amount:40,refundOf:'e'};
it('keeps legacy expenses large enough to retain their refunds',()=>{
 expect(()=>assertOrdinaryMutation(expense,{...expense,amount:39},[expense,refund])).toThrow(/rimbors/);
 expect(()=>assertOrdinaryMutation(expense,{...expense,amount:40},[expense,refund])).not.toThrow();
 expect(()=>assertOrdinaryMutation(expense,{...expense,type:'income'},[expense,refund])).toThrow();
});
it('blocks source replacement while multi receipt links are present',()=>{
 expect(()=>assertOrdinaryMutation(expense,null,[expense,{...refund,refundGroupId:'receipt'}])).toThrow(/rimborso/);
});
it('requires receipt-aware writes for allocation and gain rows',()=>{
 expect(()=>assertOrdinaryMutation({...refund,refundGroupId:'receipt'},refund,[expense,refund])).toThrow(/ricevuta/);
});
it('rejects automatic statement edits and metadata injection',()=>{
 expect(()=>assertOrdinaryMutation({...expense,id:'__cc__card__2026-10'},expense,[])).toThrow(/automatic/);
 expect(()=>assertOrdinaryMutation(expense,{...expense,creditCardSettlement:{cardId:'c',period:'2026-10',paymentAccountId:'b',paymentDay:10,policyFromMonth:'2026-10'}},[])).toThrow(/automatic/);
});

it('protects legacy refund sources in a series batch before any writes',()=>{
 const source={...expense,seriesId:'s'},template={...source,id:'tpl',recurring:{freq:'monthly' as const}};
 expect(()=>assertSeriesMutations([{id:'e',data:{...source,amount:20},seriesTemplate:template}],[source,refund])).toThrow(/rimborso|rimbors/);
 expect(()=>assertSeriesMutations([{id:'e',data:{...source,amount:20},seriesTemplate:template}],[{...source,seriesOverride:true},refund])).not.toThrow();
 expect(()=>assertSeriesMutations([{id:'e',data:{...source,amount:20},unlinkSeries:'s'}],[source,refund])).not.toThrow();
});
