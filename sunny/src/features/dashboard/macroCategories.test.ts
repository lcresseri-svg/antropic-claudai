import {describe,it,expect} from 'vitest';
import {groupExpenseMacros,applyMacroAssignments,changedMacroAssignments} from './macroCategories';
import {CategoryDef} from '../../types';
import {CategorySpendingSummary} from './categoryAnalytics';
const cats:CategoryDef[]=[{id:'a',label:'Affitto',icon:'',color:'#123456',kind:'expense',macroCategory:' Casa '},{id:'b',label:'Bollette',icon:'',color:'#123456',kind:'expense',macroCategory:'casa'},{id:'i',label:'Stipendio',icon:'',color:'#123456',kind:'income'}];
const row=(categoryId:string,amount:number)=>({categoryId,amount,transactionCount:2} as CategorySpendingSummary);
describe('expense macro categories',()=>{
 it('groups without duplicating totals and preserves unknown categories',()=>{
  const groups=groupExpenseMacros([row('a',100),row('b',20),row('missing',30)],cats,150);
  expect(groups.map(g=>[g.label,g.amount])).toEqual([['Casa',120],['Senza macrocategoria',30]]);
  expect(groups[0].percentage).toBe(80);expect(groups[0].children).toHaveLength(2);
  expect(groups.reduce((s,g)=>s+g.amount,0)).toBe(150);
 });
 it('normalizes names, clears assignments and leaves other fields/types intact',()=>{
  const updated=applyMacroAssignments(cats,{a:'  Vita   quotidiana ',b:'',i:'Wrong'});
  expect(updated[0]).toEqual({...cats[0],macroCategory:'Vita quotidiana'});
  expect(updated[1]).not.toHaveProperty('macroCategory');expect(updated[2]).toEqual(cats[2]);
  expect(cats[0].macroCategory).toBe(' Casa ');
 });
 it('supports archived categories, empty data and prototype-like names',()=>{
  const groups=groupExpenseMacros([row('a',1)],[{...cats[0],archived:true,macroCategory:'__proto__'}],1);
  expect(groups[0].label).toBe('__proto__');expect(groupExpenseMacros([],cats,0)).toEqual([]);
 });
});

it('only writes edited assignments against live definitions',()=>{
 const edits=changedMacroAssignments({a:'Casa',b:'Famiglia'},{a:' Casa ',b:'Mobilità'});
 expect(edits).toEqual({b:'Mobilità'});
 const live=[{...cats[0],macroCategory:'Nuova macro da altro dispositivo'},cats[1]];
 expect(applyMacroAssignments(live,edits)[0]).toEqual(live[0]);
});
