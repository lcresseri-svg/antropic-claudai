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
    status:confirm?'confirmed':d.base.status==='confirmed'?'confirmed':'draft',source:'manual',updatedAt:now,
    ...(confirm?{confirmedAt:now}:{})};
  validateMonthlyBudget(result);return result;
}
export function moveCategoryLimit(limits:Record<string,number>,from:string,to:string,amount:number) {
  if(from===to||!from||!to||!Number.isFinite(amount)||amount<=0||cents(amount)>cents(limits[from]??0))throw new Error('Spostamento non valido.');
  const out={...limits,[from]:(cents(limits[from])-cents(amount))/100,[to]:(cents(limits[to]??0)+cents(amount))/100};
  if(out[from]===0)delete out[from];return out;
}
export const draftKey=(uid:string,month:string)=>`sunny:piano-draft:${encodeURIComponent(uid)}:${month}`;
