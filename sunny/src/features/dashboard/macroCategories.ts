import {CategoryDef,MacroCategoryDef} from '../../types';
import {CategorySpendingSummary} from './categoryAnalytics';
import {legacyMacroDefinitions,resolveMacroId} from '../../shared/macroCategories';
export function groupExpenseMacros(rows:CategorySpendingSummary[],categories:CategoryDef[],total:number,macros:MacroCategoryDef[]=legacyMacroDefinitions(categories)) {
 const defs=new Map(categories.map(c=>[c.id,c]));
 const groups=new Map<string,{id:string;label:string;icon:string;color:string;amount:number;percentage:number;children:CategorySpendingSummary[]}>();
 for(const row of rows){
  const macro=macros.find(m=>m.id===resolveMacroId(defs.get(row.categoryId),macros));
  const id=macro?.id??'unassigned';
  const group=groups.get(id)??{id,label:macro?.label??'Senza macrocategoria',icon:macro?.icon??'•',color:macro?.color??'#6B6B6B',amount:0,percentage:0,children:[]};
  group.amount+=row.amount;group.children.push(row);groups.set(id,group);
 }
 return [...groups.values()].map(g=>({...g,percentage:total>0?g.amount/total*100:0})).sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label,'it'));
}
