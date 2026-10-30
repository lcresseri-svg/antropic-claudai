import {formatCurrency} from '../../utils';
import type {WrappedMacroArea} from './wrappedSpendingStories';

/** Labels, amounts and proportional bands stay readable without relying on color. */
export function WrappedMacroAreas({areas}:{areas:WrappedMacroArea[]}){
  return <div className="space-y-3 mt-5">
    {areas.slice(0,3).map(area=><div key={area.id===null?'unassigned':`macro:${area.id}`}>
      <div className="flex items-start gap-2 text-[13px] leading-snug">
        <span aria-hidden="true" className="flex-none">{area.icon}</span>
        <span className="min-w-0 flex-1 break-words text-primary">{area.label}</span>
        <span className="flex-none text-primary balance-num font-semibold">{Math.round(area.share*100)}%</span>
      </div>
      <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{background:'rgba(var(--c-primary) / 0.08)'}} aria-hidden="true">
        <div className="h-full rounded-full" style={{width:`${Math.min(100,Math.max(0,area.share*100))}%`,background:area.color}}/>
      </div>
      <p className="text-[12px] text-secondary balance-num mt-1 break-words">{formatCurrency(area.total)} · {area.categoryCount} {area.categoryCount===1?'categoria':'categorie'}</p>
    </div>)}
    {areas.length>3&&<p className="text-[12px] text-secondary">{areas.length===4?'Un’altra area':`Altre ${areas.length-3} aree`}: {formatCurrency(areas.slice(3).reduce((sum,a)=>sum+a.total,0))}.</p>}
  </div>;
}
