import {describe,expect,it} from 'vitest';
import {groupInvestmentMacros} from './investmentMacroCategories';
import type {CategoryDef,MacroCategoryDef} from '../../types';

const growth:MacroCategoryDef={id:'growth',kind:'investment',label:'Crescita',icon:'🌱',color:'#8A9270'};
const expense:MacroCategoryDef={id:'expense',label:'Casa',icon:'🏠',color:'#123456'};
const position=(id:string,versato:number,currentValue?:number,macroCategoryId?:string)=>({
 cat:{id,label:id,icon:'📈',color:'#123456',kind:'investment',currentValue,macroCategoryId} as CategoryDef,
 versato,weightValue:currentValue??versato,
});

describe('investment macro allocation',()=>{
 it('groups the same visible position values as the portfolio, including fallback, zero and unassigned positions',()=>{
  const positions=[position('etf',100,180,'growth'),position('bond',50,undefined,'growth'),position('zero',10,0),position('unassigned',20)];
  const groups=groupInvestmentMacros(positions,[growth,expense]);
  expect(groups.map(g=>[g.id,g.amount,g.children.map(p=>p.cat.id)])).toEqual([
   ['growth',230,['etf','bond']],['unassigned',20,['zero','unassigned']],
  ]);
  expect(groups.reduce((sum,g)=>sum+g.amount,0)).toBe(positions.reduce((sum,p)=>sum+p.weightValue,0));
  expect(groups.map(g=>g.percentage)).toEqual([92,8]);
  expect(groups[0].children[0]).toBe(positions[0]);
 });
 it('uses live definition styling and rejects deleted and expense assignments',()=>{
  const positions=[position('etf',100,180,'growth'),position('wrongScope',10,20,'expense'),position('deleted',30,undefined,'deleted')];
  const renamed={...growth,label:'Futuro',icon:'🚀',color:'#abcdef'};
  const groups=groupInvestmentMacros(positions,[renamed,expense]);
  expect(groups[0]).toMatchObject({id:'growth',label:'Futuro',icon:'🚀',color:'#abcdef',amount:180});
  expect(groups[1]).toMatchObject({id:'unassigned',label:'Senza macrocategoria',amount:50});
  expect(groupInvestmentMacros(positions,[])).toHaveLength(1);
 });
 it('handles an empty portfolio and zero totals without dropping rows or inventing percentages',()=>{
  expect(groupInvestmentMacros([],[growth])).toEqual([]);
  expect(groupInvestmentMacros([position('empty',0,undefined,'growth')],[growth])[0]).toMatchObject({amount:0,percentage:0});
 });
});
