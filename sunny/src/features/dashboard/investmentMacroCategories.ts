import type {CategoryDef,MacroCategoryDef} from '../../types';
import {resolveMacroId} from '../../shared/macroCategories';

export interface InvestmentMacroPosition {
  cat: CategoryDef;
  /** The portfolio's existing allocation value: current value, otherwise deposited capital. */
  weightValue: number;
}

export interface InvestmentMacroGroup<P extends InvestmentMacroPosition> {
  id: string;
  label: string;
  icon: string;
  color: string;
  amount: number;
  percentage: number;
  children: P[];
}

export function groupInvestmentMacros<P extends InvestmentMacroPosition>(positions:P[],macros:MacroCategoryDef[]):InvestmentMacroGroup<P>[] {
  const groups=new Map<string,InvestmentMacroGroup<P>>();
  const definitions=new Map(macros.map(m=>[m.id,m]));
  const total=positions.reduce((sum,p)=>sum+p.weightValue,0);
  for(const position of positions){
    const macro=definitions.get(resolveMacroId(position.cat,macros));
    const id=macro?.id??'unassigned';
    const group=groups.get(id)??{id,label:macro?.label??'Senza macrocategoria',icon:macro?.icon??'•',color:macro?.color??'#6B6B6B',amount:0,percentage:0,children:[]};
    group.amount+=position.weightValue;
    group.children.push(position);
    groups.set(id,group);
  }
  return [...groups.values()].map(group=>({...group,percentage:total>0?group.amount/total*100:0}))
    .sort((a,b)=>b.amount-a.amount||a.label.localeCompare(b.label,'it'));
}
