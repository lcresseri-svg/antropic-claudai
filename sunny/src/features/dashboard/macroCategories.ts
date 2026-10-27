import {CategoryDef} from '../../types';
import {CategorySpendingSummary} from './categoryAnalytics';
export const macroName = (value: unknown): string => typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,80):'';
export function applyMacroAssignments(categories:CategoryDef[], assignments:Record<string,string>):CategoryDef[] {
  return categories.map(c=>{
    if(c.kind!=='expense'||!Object.prototype.hasOwnProperty.call(assignments,c.id))return c;
    const {macroCategory:_,...rest}=c;
    const name=macroName(assignments[c.id]);
    return name?{...rest,macroCategory:name}:rest;
  });
}
export function groupExpenseMacros(rows:CategorySpendingSummary[],categories:CategoryDef[],total:number) {
  const defs=new Map(categories.filter(c=>c.kind==='expense').map(c=>[c.id,c]));
  const groups=new Map<string,{id:string;label:string;color:string;amount:number;percentage:number;children:CategorySpendingSummary[]}>();
  for(const row of rows){
    const name=macroName(defs.get(row.categoryId)?.macroCategory);
    const id=name?'macro:'+name.toLocaleLowerCase('it-IT'):'unassigned';
    const group=groups.get(id)??{id,label:name||'Senza macrocategoria',color:defs.get(row.categoryId)?.color||'#6B6B6B',amount:0,percentage:0,children:[]};
    group.amount+=row.amount;group.children.push(row);groups.set(id,group);
  }
  return [...groups.values()].map(g=>({...g,percentage:total>0?g.amount/total*100:0})).sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label,'it'));
}

/** Save only edited assignments, so live settings updates keep untouched values. */
export function changedMacroAssignments(initial:Record<string,string>,draft:Record<string,string>):Record<string,string> {
  return Object.fromEntries(Object.entries(draft).filter(([id,value])=>macroName(value)!==macroName(initial[id])));
}
