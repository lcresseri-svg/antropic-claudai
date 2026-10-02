import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES, FALLBACK_ACCOUNT, FALLBACK_CATEGORY } from '../src/defaults';
import { resolveUiVersion as resolve, UI_VERSION_CONFIG, type UiVersionConfig } from '../src/shared/uiVersionConfig.ts';
import type { AccountDef, CategoryDef, Transaction } from '../src/types';

const params = new URLSearchParams(location.search);
export function resolveUiVersion(user: { uid?: string | null } | null, config?: UiVersionConfig) {
  return resolve(user, config ?? (params.get('ui') === '2' ? { ...UI_VERSION_CONFIG, forceEveryone: '2.0' } : UI_VERSION_CONFIG));
}
export const categories: CategoryDef[] = DEFAULT_CATEGORIES.map(c => c.kind === 'investment' ? { ...c, initialBalance: c.id === 'azioni_etf' ? 8000 : 0, currentValue: c.id === 'azioni_etf' ? 9600 : 0, subscriptionDate: '2025-01-01' } : c);
export const accounts: AccountDef[] = DEFAULT_ACCOUNTS.map((a,i) => ({ ...a, initialBalance: i === 0 ? 4800 : i === 1 ? 2000 : 0 }));
const now = new Date();
const iso = (months: number, day: number) => { const d = new Date(now.getFullYear(), now.getMonth()+months,day); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const transactions: Transaction[] = params.has('empty') ? [] : Array.from({ length: 12 }, (_, i) => [
  { id: `income-${i}`, type: 'income' as const, amount: 2450, category: 'stipendio', account: 'conto_corrente', date: iso(-i,1), description: 'Stipendio', createdAt: 0 },
  { id: `rent-${i}`, type: 'expense' as const, amount: 620, category: 'casa', account: 'conto_corrente', date: iso(-i,2), description: 'Affitto', createdAt: 0 },
  ...Array.from({length:10},(_,j) => ({id:`expense-${i}-${j}`,type:'expense' as const, amount: 24.9+j*5.4, category: j%2?'spesa':'ristoranti', account:'conto_corrente',date:iso(-i,j+1),description:j%2?'Spesa settimanale':'Caffè e pranzo',createdAt:0})),
  { id: `invest-${i}`, type: 'investment' as const, amount: 350, category: 'azioni_etf', account: 'conto_corrente', date: iso(-i,3), description: 'PAC ETF', createdAt: 0 },
]).flat();

function useFixtureSettings() {
  const [theme,setTheme] = useState<'light'|'dark'>(params.get('theme') === 'dark' ? 'dark' : 'light');
  const [cats,setCats]=useState(categories), [accs,setAccs]=useState(accounts);
  const [homeOrder,saveHomeOrder]=useState<string[]>([]);
  const [enableInvestments,saveEnableInvestments]=useState(!params.has('noInvest'));
  const [aiEnabled,saveAiEnabled]=useState(!params.has('noAi'));
  const [enableBudget,saveEnableBudget]=useState(true);
  const [includeInvestments,saveIncludeInvestments]=useState(true);
  const [cashReserve,saveCashReserve]=useState(1000);
  const [insightDepth,saveInsightDepth]=useState<'medium'|'advanced'|'minimal'>('medium');
  const [aiCoachWidgetEnabled,saveAiCoachWidgetEnabled]=useState(false);
  useLayoutEffect(() => { document.documentElement.classList.toggle('light', theme === 'light'); },[theme]);
  return { categories:cats,accounts:accs,visibleCategories:cats.filter(c=>!c.archived),visibleAccounts:accs.filter(a=>!a.archived),theme,
    getCat:(id:string)=>cats.find(c=>c.id===id)??FALLBACK_CATEGORY(id),getAcc:(id:string)=>accs.find(a=>a.id===id)??FALLBACK_ACCOUNT(id),
    homeOrder,saveHomeOrder,enableInvestments,saveEnableInvestments,includeInvestments,saveIncludeInvestments,
    enableBudget,saveEnableBudget,aiEnabled,saveAiEnabled,aiCoachWidgetEnabled,saveAiCoachWidgetEnabled,
    cashReserve,saveCashReserve,insightDepth,saveInsightDepth,detailedInvestments:true,settingsLoaded:true,
    applePayCardMappings:[],saveApplePayCardMapping() {},removeApplePayCardMapping() {},
    saveTheme:setTheme,saveCategories:setCats,saveAccounts:setAccs,saveCurrentValue() {},restoreCategory:async(id:string)=>setCats(cs=>cs.map(c=>c.id===id?{...c,archived:false}:c)),
  };
}
const SettingsContext=createContext<ReturnType<typeof useFixtureSettings>|null>(null);
export function SettingsProvider({children}:{children:ReactNode}) { return <SettingsContext.Provider value={useFixtureSettings()}>{children}</SettingsContext.Provider>; }
export const useSettings=()=>useContext(SettingsContext)!;
const budget={savingsTarget:500,categoryBudgets:{casa:700,spesa:300,ristoranti:180},incomeBudgets:{stipendio:2450},investmentBudgets:{azioni_etf:350},suggestionAccepted:true};
const currentMonth=iso(0,1).slice(0,7);
const monthly={...budget,month:currentMonth,status:'confirmed' as const,source:'manual' as const};
const noop=()=>{};
export const useBudget=()=>({budget,currentMonth,monthly,monthlyStatus:'confirmed',monthlySource:'manual',budgetHistory:[monthly],hasBudget:true,showBudgetPrompt:false,
  setSavingsTarget:noop,setCategoryBudget:noop,setIncomeBudget:noop,setInvestmentBudget:noop,acceptSuggestion:noop,resetAll:noop,confirmCurrentMonth:noop,copyFromPreviousMonth:noop,
  valuesForMonth:()=>budget,statusForMonth:()=> 'confirmed',sourceForMonth:()=> 'manual',setSavingsTargetFor:noop,setCategoryBudgetFor:noop,setIncomeBudgetFor:noop,setInvestmentBudgetFor:noop,resetAllFor:noop,confirmMonth:noop,copyPrevInto:noop});
export const usePush=()=>({supported:false,enabled:false,busy:false,error:null,reminders:{},toggle:async()=>{},saveReminders:noop,testNotification:async()=>({ok:false}),diagnostics:null});
export const useAICoach=()=>({status:'idle',result:null,errorMsg:null,remaining:3,analyze:noop,reset:noop});
