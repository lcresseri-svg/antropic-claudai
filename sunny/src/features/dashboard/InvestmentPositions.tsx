import {useId,useMemo,useState,type ReactNode} from 'react';
import type {MacroCategoryDef} from '../../types';
import {formatCurrency} from '../../utils';
import {groupInvestmentMacros,type InvestmentMacroPosition} from './investmentMacroCategories';

/** Both views render the same position rows, retaining their detail and action flow. */
export function InvestmentPositions<P extends InvestmentMacroPosition>({positions,macros,renderPosition}:{
  positions:P[];
  macros:MacroCategoryDef[];
  renderPosition:(position:P)=>ReactNode;
}){
  const [grouping,setGrouping]=useState<'categories'|'macro'>('categories');
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const groupId=useId();
  const groups=useMemo(()=>groupInvestmentMacros(positions,macros),[positions,macros]);
  return <div className="ui31-position-list ui-open-list space-y-2.5">
    <div className="flex items-center justify-between gap-3 px-1">
      <p className="label-caps text-secondary">Posizioni</p>
      <p className="text-[11px] text-secondary">{positions.length} categorie</p>
    </div>
    <div role="group" aria-label="Raggruppa investimenti" className="flex gap-1">
      {(['categories','macro'] as const).map(value=><button key={value} type="button" aria-pressed={grouping===value} onClick={()=>setGrouping(value)}
        className={`rounded-xl px-4 py-2 text-sm ${grouping===value?'glass-active-pill text-gold font-semibold':'text-secondary'}`}>{value==='macro'?'Macro':'Categorie'}</button>)}
    </div>
    {grouping==='categories'?positions.map(renderPosition):<>
      <p className="text-xs text-secondary px-1">Totali sul controvalore, oppure sul versato dove il controvalore manca.</p>
      {groups.map((group,index)=>{
        const open=expanded.has(group.id);
        const panelId=`${groupId}-${index}`;
        return <section key={group.id} className="space-y-2">
          <button type="button" aria-expanded={open} aria-controls={panelId}
            onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(open)next.delete(group.id);else next.add(group.id);return next;})}
            className="ui-open-row w-full text-left glass-card rounded-[18px] p-4 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{backgroundColor:group.color+'26'}}>{group.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-primary break-words">{group.label}</span>
              <span className="block text-xs text-secondary">{group.children.length} {group.children.length===1?'categoria':'categorie'} · {Math.round(group.percentage)}% del portafoglio</span>
            </span>
            <span className="text-sm font-semibold balance-num text-primary flex-shrink-0">{formatCurrency(group.amount)}</span>
            <span className="text-secondary flex-none" aria-hidden="true">{open?'⌃':'⌄'}</span>
          </button>
          <div id={panelId} hidden={!open} className="space-y-2 pl-2 border-l border-divider">
            {open&&group.children.map(renderPosition)}
          </div>
        </section>;
      })}
    </>}
  </div>;
}
