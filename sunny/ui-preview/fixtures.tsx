import {legacyMacroDefinitions} from '../src/shared/macroCategories';
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, FALLBACK_ACCOUNT, FALLBACK_CATEGORY } from '../src/defaults';
import { resolveUiVersion as resolve, UI_VERSION_CONFIG, type UiVersionConfig } from '../src/shared/uiVersionConfig.ts';
import type { MacroCategoryDef, AccountDef, CategoryDef, Transaction } from '../src/types';
import { MonthlyBudget } from '../src/features/budget/monthlyBudget';
import { revisionOf, validateMonthlyBudget } from '../src/features/budget/monthlyBudgetStore';

const params = new URLSearchParams(location.search);
const calendarToday = new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Rome', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
export const financeToday = /^\d{4}-\d{2}-\d{2}$/.test(params.get('financeDate') ?? '') ? params.get('financeDate')! : calendarToday;
export const financeMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('financeMonth') ?? '') ? params.get('financeMonth')! : calendarToday.slice(0,7);
export const financeExpenseIds = ['finance-expense-60','finance-expense-40'];
export function resolveUiVersion(user: { uid?: string | null } | null, config?: UiVersionConfig) {
  return resolve(user, config ?? (params.get('ui') === '3' ? { ...UI_VERSION_CONFIG, pilotAdmin:'3.0' } : params.get('ui') === '2' ? { ...UI_VERSION_CONFIG, forceEveryone:'2.0' } : UI_VERSION_CONFIG));
}
export const categories: CategoryDef[] = DEFAULT_CATEGORIES.map(c => c.kind === 'investment' ? { ...c, initialBalance: !params.has('financeCase') && !params.has('unknownBalance') && c.id === 'azioni_etf' ? 8000 : 0, currentValue: params.has('unknownBalance') ? undefined : !params.has('financeCase') && c.id === 'azioni_etf' ? 9600 : 0, subscriptionDate: '2025-01-01' } : c);
export const accounts: AccountDef[] = params.has('financeCase') ? [
  { ...DEFAULT_ACCOUNTS[0], id:'conto_corrente', label:'Banca test', initialBalance:1000 },
  { id:'carta_fixture', label:'Carta test', icon:'💳', color:'#88B0C0', initialBalance:0,
    creditCardPolicies:[{fromMonth:financeMonth,enabled:true,paymentDay:10,paymentAccountId:'conto_corrente'}] },
] : DEFAULT_ACCOUNTS.map((a,i) => ({ ...a, initialBalance: params.has('openingZero') ? 0 : params.has('unknownBalance') ? undefined : i === 0 ? 4800 : i === 1 ? 2000 : 0 }));
const investmentMacros:MacroCategoryDef[]=params.has('investmentMacros')?[
  {id:'fixture-growth',kind:'investment',label:'Crescita e obiettivi di lungo periodo',icon:'🌱',color:'#8A9270'},
  {id:'fixture-protection',kind:'investment',label:'Protezione',icon:'🛡️',color:'#88B0C0'},
  {id:'fixture-expense',label:'Casa e vita',icon:'🏠',color:'#6FA8DC'},
]:[];
if(params.has('investmentMacros')){
  Object.assign(categories.find(c=>c.id==='azioni_etf')!,{macroCategoryId:'fixture-growth'});
  Object.assign(categories.find(c=>c.id==='crypto')!,{macroCategoryId:'fixture-growth',initialBalance:900,currentValue:undefined});
  Object.assign(categories.find(c=>c.id==='obbligazioni')!,{initialBalance:200,currentValue:0});
  Object.assign(categories.find(c=>c.id==='fondi')!,{macroCategoryId:'fixture-protection',initialBalance:350,currentValue:400,fundType:'pension',tfrAmount:150});
  categories.push({id:'fixture-unassigned',kind:'investment',label:'Liquidità investita',icon:'💰',color:'#B0A0C8',initialBalance:75});
  categories.push({id:'fixture-archived',kind:'investment',label:'Investimento archiviato',icon:'📁',color:'#888888',currentValue:999999,initialBalance:999999,archived:true,macroCategoryId:'fixture-growth'});
}
const now = new Date();
const iso = (months: number, day: number) => { const d = new Date(now.getFullYear(), now.getMonth()+months,day); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const transactions: Transaction[] = params.has('empty') ? [] : params.has('financeCase') ? [
  {id:financeExpenseIds[0],type:'expense',amount:60,category:'spesa',account:'carta_fixture',date:`${financeMonth}-02`,description:'Acquisto carta 60',createdAt:0},
  {id:financeExpenseIds[1],type:'expense',amount:40,category:'casa',account:'carta_fixture',date:`${financeMonth}-03`,description:'Acquisto carta 40',createdAt:0},
] : params.has('pianoCase') ? [
  {id:'spent',type:'expense',amount:900,category:'spesa',account:'conto_corrente',date:iso(0,5),description:'Spese registrate'},
  {id:'due1',type:'expense',amount:250,category:'spesa',account:'conto_corrente',date:iso(0,20),description:'Spesa programmata'},
  {id:'due2',type:'expense',amount:100,category:'casa',account:'conto_corrente',date:iso(0,25),description:'Utenza'},
  {id:'invest',type:'investment',amount:300,tfr:100,category:'azioni_etf',account:'conto_corrente',date:iso(0,5),description:'Investimento con quota TFR'},
  {id:'income',type:'income',amount:1200,category:'stipendio',account:'conto_corrente',date:iso(0,5),description:'Incasso parziale'},
] : Array.from({ length: 12 }, (_, i) => [
  { id: `income-${i}`, type: 'income' as const, amount: 2450, category: 'stipendio', account: 'conto_corrente', date: iso(-i,1), description: 'Stipendio', createdAt: 0 },
  { id: `rent-${i}`, type: 'expense' as const, amount: 620, category: 'casa', account: 'conto_corrente', date: iso(-i,2), description: 'Affitto', createdAt: 0 },
  ...Array.from({length:10},(_,j) => ({id:`expense-${i}-${j}`,type:'expense' as const, amount: 24.9+j*5.4, category: j%2?'spesa':'ristoranti', account:'conto_corrente',date:iso(-i,j+1),description:j%2?'Spesa settimanale':'Caffè e pranzo',createdAt:0})),
  { id: `invest-${i}`, type: 'investment' as const, amount: 350, category: 'azioni_etf', account: 'conto_corrente', date: iso(-i,3), description: 'PAC ETF', createdAt: 0 },
]).flat();
// Synthetic Wrapped income cases; never loaded by the production entry.
if (params.has('wrappedIncome')) {
  const mode=params.get('wrappedIncome'),year=now.getFullYear(),months=now.getMonth()+1;
  transactions.splice(0,transactions.length);
  if(mode==='planned')transactions.push(
    {id:'wrapped-spend',type:'expense',amount:100,category:'spesa',account:'conto_corrente',date:iso(0,2),description:'Spesa test'},
    {id:'wrapped-planned',type:'income',amount:4000,category:'stipendio',account:'conto_corrente',date:iso(0,28),description:'Entrata programmata test'},
  );
  else for(let month=1;month<=months;month++){
    const key=`${year}-${String(month).padStart(2,'0')}`,previous=`${year-1}-${String(month).padStart(2,'0')}`;
    const amount=mode==='large'?1_000_000_000:mode==='decline'?2500:mode==='flat'?2800:3000;
    transactions.push(
      {id:`wrapped-income-${month}`,type:'income',amount,category:'stipendio',account:'conto_corrente',date:`${key}-05`,description:'Stipendio test'},
      {id:`wrapped-expense-${month}`,type:'expense',amount:3500,category:'spesa',account:'conto_corrente',date:`${key}-06`,description:'Spesa test'},
    );
    if(mode!=='noHistory'&&!(mode==='partial'&&month===2))transactions.push(
      {id:`wrapped-previous-income-${month}`,type:'income',amount:2800,category:'stipendio',account:'conto_corrente',date:`${previous}-05`,description:'Stipendio precedente test'},
      {id:`wrapped-previous-expense-${month}`,type:'expense',amount:2200,category:'spesa',account:'conto_corrente',date:`${previous}-06`,description:'Spesa precedente test'},
    );
  }
}
if(params.get('wrappedIncome')==='growthPlanned')transactions.push({id:'wrapped-planned-extra',type:'income',amount:4000,category:'stipendio',account:'conto_corrente',date:iso(0,28),description:'Entrata programmata test'});
if (params.has('invalidPortfolioDate')) {
  categories.find(c => c.id === 'azioni_etf')!.subscriptionDate = '01/01/2020';
}
if (params.has('allMovementTypes')) {
  transactions.push(
    { id: 'type-transfer', type: 'transfer', category: 'trasferimento', account: 'conto_corrente', toAccount: 'contanti', date: iso(0, 1), amount: 50, description: 'Trasferimento di prova' },
    { id: 'type-refund', type: 'refund', category: 'spesa', account: 'conto_corrente', date: iso(0, 1), amount: 20, description: 'Storno di prova' },
  );
}
if (params.has('shortInvestmentHistory')) {
  const fund = categories.find(c => c.id === 'azioni_etf')!;
  fund.subscriptionDate = iso(0, 1);
  for (let i = transactions.length - 1; i >= 0; i--) {
    if (transactions[i].type === 'investment') transactions.splice(i, 1);
  }
  transactions.push(
    { id: 'short-deposit', type: 'investment', category: fund.id, account: 'conto_corrente', date: iso(0, 3), amount: 350, direction: 'in', description: 'Versamento' },
    { id: 'short-withdrawal', type: 'investment', category: fund.id, account: 'conto_corrente', date: iso(0, 10), amount: 100, direction: 'out', description: 'Disinvestimento' },
  );
}
if(params.has('manyPriorities')) {
  for(let i=1;i<=2;i++) transactions.push({id:`due-${i}`,type:'expense',amount:120,category:'casa',account:'conto_corrente',date:iso(0,now.getDate()+i),description:`Scadenza test ${i}`});
}
if(params.has('manyCategories')) {
  for(let i=0;i<12;i++) {
    const id=`many-${i}`;
    categories.push({id,label:i===0?'Finanziamento auto con descrizione molto lunga':'Categoria '+i,icon:'',color:'#7CA5C9',kind:'expense'});
    transactions.push({id,type:'expense',amount:300-i*17.31,category:id,account:'conto_corrente',date:iso(0,1),description:'Prova molte categorie'});
  }
}
if(params.has('categoryForecast')){
  for(let i=1;i<=6;i++)for(const [category,amount] of [['spesa',1600],['casa',100],['trasporti',75]] as const)
    transactions.push({id:`forecast-${category}-${i}`,type:'expense',amount,category,account:'conto_corrente',date:iso(-i,25),description:'Storico di test forecast'});
}
if(params.has('edgeCategories')){
  categories.push({id:'archived',label:'Categoria archiviata con un nome molto lungo per verificare leggibilità e testo ingrandito',icon:'📚',color:'#888888',kind:'expense',archived:true});
  transactions.push({id:'archived-spend',type:'expense',amount:80,category:'archived',account:'conto_corrente',date:iso(0,5),description:'Spesa archiviata'},
    {id:'unknown-spend',type:'expense',amount:20,category:'unknown',account:'conto_corrente',date:iso(0,5),description:'Categoria non più disponibile'});
}

function useFixtureSettings() {
  const [theme,setTheme] = useState<'light'|'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [macroCategories,setMacroCategories]=useState<MacroCategoryDef[]>(()=>[...legacyMacroDefinitions(categories),...investmentMacros]);
  const [cats,setCats]=useState(categories), [accs,setAccs]=useState(accounts);
  const [homeOrder,saveHomeOrder]=useState<string[]>([]);
  const [enableInvestments,saveEnableInvestments]=useState(!params.has('noInvest'));
  const [aiEnabled,saveAiEnabled]=useState(!params.has('noAi'));
  const [enableBudget,saveEnableBudget]=useState(!params.has('noBudget'));
  const [includeInvestments,saveIncludeInvestments]=useState(true);
  const [cashReserve,saveCashReserve]=useState(1000);
  const [insightDepth,saveInsightDepth]=useState<'medium'|'advanced'|'minimal'>('medium');
  const [aiCoachWidgetEnabled,saveAiCoachWidgetEnabled]=useState(false);
  useLayoutEffect(() => { document.documentElement.classList.toggle('light', theme === 'light'); },[theme]);
  return { macroCategories,saveMacroCategories:async(next:MacroCategoryDef[])=>{if(params.has('failSave'))throw Error('Fixture: rete non disponibile');setMacroCategories(next);},categories:cats,accounts:accs,visibleCategories:cats.filter(c=>!c.archived),visibleAccounts:accs.filter(a=>!a.archived),theme,
    getCat:(id:string)=>cats.find(c=>c.id===id)??FALLBACK_CATEGORY(id),getAcc:(id:string)=>accs.find(a=>a.id===id)??FALLBACK_ACCOUNT(id),
    homeOrder,saveHomeOrder,enableInvestments,saveEnableInvestments,includeInvestments,saveIncludeInvestments,
    enableBudget,saveEnableBudget,aiEnabled,saveAiEnabled,aiCoachWidgetEnabled,saveAiCoachWidgetEnabled,
    cashReserve,saveCashReserve,insightDepth,saveInsightDepth,detailedInvestments:true,settingsLoaded:!params.has('loadingSettings'),
    applePayCardMappings:[],saveApplePayCardMapping() {},removeApplePayCardMapping() {},
    saveTheme:setTheme,saveCategories:async(next:CategoryDef[])=>{if(params.has('failSave'))throw Error('Fixture: rete non disponibile');setCats(next);},saveAccounts:async(next:AccountDef[])=>{if(params.has('failSave'))throw Error('Fixture: rete non disponibile');setAccs(next);},saveCurrentValue:async(id:string,value:number)=>{if(params.has('failSave'))throw Error('Fixture: rete non disponibile');setCats(cs=>cs.map(c=>c.id===id?{...c,currentValue:value}:c));},restoreCategory:async(id:string)=>setCats(cs=>cs.map(c=>c.id===id?{...c,archived:false}:c)),
  };
}
const SettingsContext=createContext<ReturnType<typeof useFixtureSettings>|null>(null);
export function SettingsProvider({children}:{children:ReactNode}) { return <SettingsContext.Provider value={useFixtureSettings()}><BudgetContext.Provider value={useFixtureBudget()}>{children}</BudgetContext.Provider></SettingsContext.Provider>; }
export const useSettings=()=>useContext(SettingsContext)!;
const budget={savingsTarget:500,categoryBudgets:{casa:700,spesa:300,ristoranti:180},incomeBudgets:{stipendio:2450},investmentBudgets:{azioni_etf:350},suggestionAccepted:true};
const currentMonth=iso(0,1).slice(0,7);
const monthly:MonthlyBudget={...budget,month:currentMonth,status:'confirmed',source:'manual',revision:1,
  planningV3:params.has('legacy')?undefined:{schemaVersion:1,inputsReviewedAt:1,cashInvestmentBudgets:{azioni_etf:350}}};
if(params.has('reviewNeeded')&&monthly.planningV3)monthly.planningV3.inputsReviewedAt=0;
if(params.has('pianoCase'))Object.assign(monthly,{savingsTarget:400,incomeBudgets:{stipendio:2400},categoryBudgets:{spesa:1200,casa:500},
  planningV3:{schemaVersion:1,inputsReviewedAt:1,cashInvestmentBudgets:{azioni_etf:200}}});
const noop=()=>{};
function useFixtureBudget(){
  const [history,setHistory]=useState<MonthlyBudget[]>(params.has('empty')?[]:[monthly,{...monthly,month:iso(-1,1).slice(0,7)}]);
  const [writes,setWrites]=useState(0),[conflicted,setConflicted]=useState(false);
  const saveMonthlyBudget=async(month:string,draft:MonthlyBudget,expected:number|null)=>{
    validateMonthlyBudget(draft);
    if(params.has('slowSave'))await new Promise(r=>setTimeout(r,2500));
    if(params.has('failSave')||!navigator.onLine)throw new Error('Offline: bozza locale conservata. Riprova quando la rete è disponibile.');
    const current=history.find(p=>p.month===month);
    if(params.has('conflict')&&!conflicted){
      setConflicted(true);setHistory(h=>h.map(p=>p.month===month?{...p,revision:(p.revision??0)+1,savingsTarget:p.savingsTarget+25}:p));
      throw new Error('Il piano è stato modificato altrove. Bozza conservata.');
    }
    if(revisionOf(current)!==expected)throw new Error('Il piano è stato modificato altrove.');
    const next={...draft,revision:(current?.revision??0)+1};
    setHistory(h=>[...h.filter(p=>p.month!==month),next]);setWrites(n=>n+1);return next;
  };
  return {budget,currentMonth,monthly,monthlyStatus:'confirmed',monthlySource:'manual',budgetHistory:history,hasBudget:true,showBudgetPrompt:false,
    loading:params.has('loading'),error:params.has('loadError')?'Errore fixture':null,fromCache:params.has('offline'),saveMonthlyBudget,writes,retry:noop,
  setSavingsTarget:noop,setCategoryBudget:noop,setIncomeBudget:noop,setInvestmentBudget:noop,acceptSuggestion:noop,resetAll:noop,confirmCurrentMonth:noop,copyFromPreviousMonth:noop,
  valuesForMonth:()=>budget,statusForMonth:()=> 'confirmed',sourceForMonth:()=> 'manual',setSavingsTargetFor:noop,setCategoryBudgetFor:noop,setIncomeBudgetFor:noop,setInvestmentBudgetFor:noop,resetAllFor:noop,confirmMonth:noop,copyPrevInto:noop};
}
const BudgetContext=createContext<ReturnType<typeof useFixtureBudget>|null>(null);
export const useBudget=()=>useContext(BudgetContext)!;
export const usePush=()=>({supported:false,enabled:false,busy:false,error:null,reminders:{},toggle:async()=>{},saveReminders:noop,testNotification:async()=>({ok:false}),diagnostics:null});
export const useAICoach=()=>({status:'idle',result:null,errorMsg:null,remaining:3,analyze:noop,reset:noop});
