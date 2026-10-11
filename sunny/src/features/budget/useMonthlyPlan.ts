import { useEffect, useMemo, useState } from 'react';
import { CategoryDef, Transaction } from '../../types';
import { MonthlyBudget, monthKeyOf } from './monthlyBudget';
import { planTransactions, selectMonthlyPlan, monthOccurrences, localDay } from './monthlyPlanSelectors';
import { computeForecastV4 } from '../forecast/v4/forecastEngineV4';
export function usePlanCalendar() {
  const [now,setNow]=useState(()=>new Date());
  useEffect(()=>{
    const refresh=()=>setNow(new Date());
    const timer=setInterval(refresh,30_000);
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  return now;
}
export function useMonthlyPlan(month:string,now:Date,plan:MonthlyBudget|null,transactions:Transaction[],categories:CategoryDef[],history:MonthlyBudget[]) {
  return useMemo(()=>calculateMonthlyPlan(month,now,plan,transactions,categories,history),[month,now,plan,transactions,categories,history]);
}
export function calculateMonthlyPlan(month:string,now:Date,plan:MonthlyBudget|null,transactions:Transaction[],categories:CategoryDef[],history:MonthlyBudget[]) {
    const clean=planTransactions(transactions,now);
    const catIds=new Set(clean.filter(t=>t.type==='expense').map(t=>t.category));
    const expenseCats=[...categories.filter(c=>c.kind==='expense'),
      ...[...catIds].filter(id=>!categories.some(c=>c.id===id)).map(id=>({id,label:`Categoria ${id}`,icon:'📁',color:'#888888',kind:'expense' as const}))];
    const pastMonths=new Set(clean.filter(t=>t.type==='expense'&&!t.recurring&&t.date.slice(0,7)<monthKeyOf(now)).map(t=>t.date.slice(0,7)));
    const forecastTransactions=[
      ...clean.filter(t=>!t.recurring&&!t.projected&&t.date<=localDay(now)),
      ...monthOccurrences(clean,month,now).scheduled,
    ];
    // Future-month support is not a property of changing "now". Only current
    // months with enough actual history expose this statistical forecast.
    const forecast=month===monthKeyOf(now)&&pastMonths.size>=3
      ? computeForecastV4({transactions:forecastTransactions,expenseCategories:expenseCats,now,categoryBudgets:plan?.categoryBudgets,
        budgetHistory:history,currentMonthBudgetStatus:plan?.status}) : null;
    return selectMonthlyPlan({month,now,plan,transactions,categories,forecast:forecast?{
      total:forecast.totalForecast,byCategory:Object.fromEntries(Object.entries(forecast.byCategory).map(([id,v])=>[id,v.totalForecast])),
    }:null});
}
