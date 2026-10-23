import { MonthlyBudget } from './monthlyBudget';
import { cents } from './monthlyPlanSelectors';
import { validateMonthlyBudget } from './monthlyBudgetStore';
export function parsePlanAmount(text: string): number | null {
  const s=text.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(s)) return null;
  const n=Number(s.replace(/\./g,'').replace(',','.'));
  return Number.isFinite(n)&&n<=1e9?n:null;
}
export const inputAmount=(n:number)=>String(n).replace('.',',');
const strings=(map:Record<string,number>)=>Object.fromEntries(Object.entries(map).map(([k,v])=>[k,inputAmount(v)]));
export interface PlanDraft {
  base:MonthlyBudget; income:Record<string,string>; savings:string; cash:Record<string,string>;
  limits:Record<string,string>; cashReviewed:boolean;
}
/** A legacy confirmation does not confirm inputs that still require review. */
export function isReviewedAndConfirmed(plan:MonthlyBudget):boolean {
  return plan.status==='confirmed'&&!!plan.planningV3?.inputsReviewedAt;
}
export function createPlanDraft(base:MonthlyBudget):PlanDraft {
  return {base,income:strings(base.incomeBudgets),savings:base.source==='auto_initialized'&&!base.planningV3?'':inputAmount(base.savingsTarget),
    cash:strings(base.planningV3?.cashInvestmentBudgets??{}),limits:strings(base.categoryBudgets),
    cashReviewed:!!base.planningV3?.inputsReviewedAt};
}
export function resolvePlanDraft(d:PlanDraft,confirm:boolean,now=Date.now()):MonthlyBudget {
  const parse=(s:string)=>{const v=parsePlanAmount(s);if(v===null)throw new Error('Completa gli importi con numeri validi, anche zero.');return v;};
  const map=(m:Record<string,string>)=>Object.fromEntries(Object.entries(m).map(([k,v])=>[k,parse(v)]));
  if(!Object.keys(d.income).length||!d.cashReviewed)throw new Error('Conferma entrate e investimenti dai conti, anche zero.');
  const result:MonthlyBudget={...d.base,incomeBudgets:map(d.income),savingsTarget:parse(d.savings),
    categoryBudgets:Object.fromEntries(Object.entries(map(d.limits)).filter(([,v])=>v>0)),
    planningV3:{schemaVersion:1,inputsReviewedAt:now,cashInvestmentBudgets:map(d.cash)},
    status:confirm||isReviewedAndConfirmed(d.base)?'confirmed':'draft',source:'manual',updatedAt:now,
    ...(confirm?{confirmedAt:now}:{})};
  validateMonthlyBudget(result);return result;
}
export function moveCategoryLimit(limits:Record<string,number>,from:string,to:string,amount:number) {
  if(from===to||!from||!to||!Number.isFinite(amount)||amount<=0||cents(amount)>cents(limits[from]??0))throw new Error('Spostamento non valido.');
  const out={...limits,[from]:(cents(limits[from])-cents(amount))/100,[to]:(cents(limits[to]??0)+cents(amount))/100};
  if(out[from]===0)delete out[from];return out;
}
export const draftKey=(uid:string,month:string)=>`sunny:piano-draft:${encodeURIComponent(uid)}:${month}`;

/** Apply only the transfer delta, retaining independent locally edited fields. */
export function applyLimitTransferToDraft(draft:PlanDraft,before:Record<string,number>,after:Record<string,number>):PlanDraft {
  const limits={...draft.limits};
  for(const id of new Set([...Object.keys(before),...Object.keys(after)])){
    const delta=cents(after[id]??0)-cents(before[id]??0);
    if(!delta)continue;
    const current=id in limits?parsePlanAmount(limits[id]):0;
    if(current===null||cents(current)+delta<0)throw new Error('Spostamento non applicato: completa i limiti della bozza e riprova. Le modifiche locali sono conservate.');
    const next=cents(current)+delta;
    if(next===0)delete limits[id];else limits[id]=inputAmount(next/100);
  }
  return {...draft,limits};
}
export function planDifferences(before:MonthlyBudget,after:MonthlyBudget) {
  const changes:{field:string;id:string;before:number|null;after:number|null}[]=[];
  if(before.savingsTarget!==after.savingsTarget)changes.push({field:'savingsTarget',id:'',before:before.savingsTarget,after:after.savingsTarget});
  for(const field of ['incomeBudgets','categoryBudgets','cashInvestmentBudgets'] as const) {
    const a=field==='cashInvestmentBudgets'?before.planningV3?.cashInvestmentBudgets??{}:before[field];
    const b=field==='cashInvestmentBudgets'?after.planningV3?.cashInvestmentBudgets??{}:after[field];
    for(const id of new Set([...Object.keys(a),...Object.keys(b)]))if(a[id]!==b[id])
      changes.push({field,id,before:a[id]??null,after:b[id]??null});
  }
  return changes;
}
