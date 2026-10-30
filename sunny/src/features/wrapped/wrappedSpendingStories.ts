/** Read-only details for the Wrapped story: classification and actual habits. */
import {ownShare,type CategoryDef,type MacroCategoryDef,type Transaction} from '../../types';
import {legacyMacroDefinitions,resolveMacroId} from '../../shared/macroCategories';
import type {WrappedCategory} from './yearWrapped';

export interface WrappedMacroArea {
  /** null is the unassigned bucket, never a user definition ID. */
  id:string|null;
  label:string;
  icon:string;
  color:string;
  total:number;
  share:number;
  categoryCount:number;
  categoryIds:string[];
}
export interface WrappedFrequentExpense {
  description:string;
  categoryLabel:string;
  categoryIcon:string;
  count:number;
  total:number;
  average:number;
  months:number;
  source:'series'|'description';
}
const r2=(n:number)=>Math.round(n*100)/100;
const clean=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/gu,' ');

export function buildWrappedMacroAreas(
  categories:WrappedCategory[],getCat:(id:string)=>CategoryDef,macros?:MacroCategoryDef[],
):WrappedMacroArea[]{
  const definitions=macros??legacyMacroDefinitions(categories.map(c=>getCat(c.id)));
  const groups=new Map<string|null,WrappedMacroArea>();
  for(const category of categories){
    const macroId=resolveMacroId(getCat(category.id),definitions);
    const macro=definitions.find(m=>m.id===macroId);
    const id=macro?.id??null;
    const group=groups.get(id)??{id,label:macro?.label??'Senza macrocategoria',icon:macro?.icon??'🏷️',color:macro?.color??'#888888',total:0,share:0,categoryCount:0,categoryIds:[]};
    group.total+=category.total;
    group.share+=category.share;
    group.categoryCount++;
    group.categoryIds.push(category.id);
    groups.set(id,group);
  }
  return [...groups.values()].map(g=>({...g,total:r2(g.total)}))
    .sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label,'it')||(a.id??'').localeCompare(b.id??''));
}

/** Exact recorded descriptions are counted, never inferred merchants or cadence.
 * Caller passes only realized transactions; future occurrences aren't habits. */
export function buildWrappedFrequentExpense(realized:Transaction[],getCat:(id:string)=>CategoryDef):WrappedFrequentExpense|null{
  const groups=new Map<string,{rows:Transaction[];dates:Set<string>;totalCents:number;source:'series'|'description'}>();
  for(const t of realized){
    if(t.type!=='expense'||t.projected||ownShare(t)<=0)continue;
    const description=clean(t.description);
    if(!t.seriesId&&!description)continue;
    const source=t.seriesId?'series':'description';
    const key=JSON.stringify(t.seriesId?['series',t.seriesId]:['description',t.category,description.toLocaleLowerCase('it-IT')]);
    const group=groups.get(key)??{rows:[],dates:new Set<string>(),totalCents:0,source};
    group.rows.push(t);group.dates.add(t.date);group.totalCents+=Math.round(ownShare(t)*100);groups.set(key,group);
  }
  const winner=[...groups.entries()].filter(([,g])=>g.rows.length>=3&&g.dates.size>=3)
    .sort(([ak,a],[bk,b])=>b.rows.length-a.rows.length||b.totalCents-a.totalCents||ak.localeCompare(bk,'it'))[0]?.[1];
  if(!winner)return null;
  const latest=[...winner.rows].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id))[0];
  const category=getCat(latest.category);
  return {
    description:clean(latest.description)||category.label,
    categoryLabel:category.label,categoryIcon:category.icon,
    count:winner.rows.length,total:winner.totalCents/100,average:r2(winner.totalCents/100/winner.rows.length),
    months:new Set(winner.rows.map(t=>t.date.slice(0,7))).size,source:winner.source,
  };
}
