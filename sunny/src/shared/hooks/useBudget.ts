import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { BudgetState } from '../../types';
import { MonthlyBudget, monthKeyOf, monthlyToBudgetState, shouldShowBudgetSetupPrompt } from '../../features/budget/monthlyBudget';
import { saveMonthlyBudget as persist, ensureMonthlyBudget, editLegacyBudget } from '../../features/budget/monthlyBudgetStore';

const EMPTY: BudgetState = {savingsTarget:0,categoryBudgets:{},incomeBudgets:{},investmentBudgets:{},suggestionAccepted:false};
export function useBudget(user: User | null) {
  const uid=user?.uid;
  const [attempt,setAttempt]=useState(0);
  const [currentMonth,setCurrentMonth]=useState(()=>monthKeyOf(new Date()));
  const [state,setState]=useState<{uid?:string;history:MonthlyBudget[];loading:boolean;error:string|null;fromCache:boolean}>({
    uid,history:[],loading:true,error:null,fromCache:true,
  });
  useEffect(()=>{
    const tick=()=>setCurrentMonth(monthKeyOf(new Date()));
    const timer=setInterval(tick,30_000);
    window.addEventListener('focus',tick);document.addEventListener('visibilitychange',tick);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};
  },[]);
  useEffect(()=>{
    let active=true, ensured=false;
    setState({uid,history:[],loading:!!uid,error:null,fromCache:true});
    if (!uid) return;
    const unsub=onSnapshot(collection(db,'users',uid,'budgetHistory'),{includeMetadataChanges:true},snap=>{
      if(!active)return;
      const history=snap.docs.map(d=>({...d.data(),month:d.id}) as MonthlyBudget).sort((a,b)=>b.month.localeCompare(a.month));
      setState({uid,history,loading:false,error:null,fromCache:snap.metadata.fromCache});
      if(!snap.metadata.fromCache&&!ensured){
        ensured=true;
        void ensureMonthlyBudget(db,uid).catch(e=>{if(active)setState(s=>({...s,error:String(e.message??e)}));});
      }
    },e=>{if(active)setState(s=>({...s,loading:false,error:e.message}));});
    return ()=>{active=false;unsub();};
  },[uid,currentMonth,attempt]);
  // UID tagging prevents even a first render from displaying a previous account.
  const history=state.uid===uid?state.history:[];
  const monthly=history.find(m=>m.month===currentMonth)??null;
  const budget=monthly?monthlyToBudgetState(monthly):EMPTY;
  const report=useCallback((promise:Promise<unknown>)=>{
    void promise.catch(e=>setState(s=>s.uid===uid?{...s,error:String(e.message??e)}:s));
  },[uid]);
  const change=(month:string,edit:(b:BudgetState)=>BudgetState,action:'edit'|'copy'|'confirm'='edit')=>{
    if(uid)report(editLegacyBudget(db,uid,month,edit,new Date(),action));
  };
  const setAmount=(month:string,field:'categoryBudgets'|'incomeBudgets'|'investmentBudgets',id:string,n:number)=>change(month,b=>{
    const map={...b[field]};if(n>0)map[id]=Math.round(n);else delete map[id];return {...b,[field]:map};
  });
  const reset=(b:BudgetState)=>({...b,categoryBudgets:{},incomeBudgets:{},investmentBudgets:{},suggestionAccepted:false});
  const saveMonthlyBudget=useCallback(async(month:string,draft:MonthlyBudget,expectedRevision:number|null)=>{
    if(!uid)throw new Error('Accedi per salvare il piano.');
    return persist(db,uid,month,draft,expectedRevision);
  },[uid]);
  return {
    budget,currentMonth,monthly,monthlyStatus:monthly?.status??'missing',monthlySource:monthly?.source,
    retry:()=>setAttempt(n=>n+1),
    copiedFromMonth:monthly?.copiedFromMonth,budgetHistory:history,
    loading:state.uid!==uid||state.loading,error:state.uid===uid?state.error:null,fromCache:state.fromCache,saveMonthlyBudget,
    hasBudget:budget.suggestionAccepted||Object.keys(budget.categoryBudgets).length>0||Object.keys(budget.incomeBudgets).length>0||Object.keys(budget.investmentBudgets).length>0,
    showBudgetPrompt:shouldShowBudgetSetupPrompt(monthly),
    valuesForMonth:(m:string)=>{const p=history.find(p=>p.month===m);return p?monthlyToBudgetState(p):EMPTY;},
    statusForMonth:(m:string)=>history.find(p=>p.month===m)?.status??'missing',
    sourceForMonth:(m:string)=>history.find(p=>p.month===m)?.source,
    setSavingsTarget:(n:number)=>change(currentMonth,b=>({...b,savingsTarget:Math.max(0,Math.round(n))})),
    setCategoryBudget:(id:string,n:number)=>setAmount(currentMonth,'categoryBudgets',id,n),
    setIncomeBudget:(id:string,n:number)=>setAmount(currentMonth,'incomeBudgets',id,n),
    setInvestmentBudget:(id:string,n:number)=>setAmount(currentMonth,'investmentBudgets',id,n),
    acceptSuggestion:(suggested:Record<string,number>,target:number)=>change(currentMonth,b=>({...b,categoryBudgets:suggested,savingsTarget:Math.max(0,Math.round(target)),suggestionAccepted:true})),
    resetAll:()=>change(currentMonth,reset),
    confirmCurrentMonth:()=>change(currentMonth,b=>b,'confirm'),
    copyFromPreviousMonth:()=>change(currentMonth,b=>b,'copy'),
    setSavingsTargetFor:(m:string,n:number)=>change(m,b=>({...b,savingsTarget:Math.max(0,Math.round(n))})),
    setCategoryBudgetFor:(m:string,id:string,n:number)=>setAmount(m,'categoryBudgets',id,n),
    setIncomeBudgetFor:(m:string,id:string,n:number)=>setAmount(m,'incomeBudgets',id,n),
    setInvestmentBudgetFor:(m:string,id:string,n:number)=>setAmount(m,'investmentBudgets',id,n),
    resetAllFor:(m:string)=>change(m,reset),
    confirmMonth:(m:string)=>change(m,b=>b,'confirm'),
    copyPrevInto:(m:string)=>change(m,b=>b,'copy'),
  };
}
