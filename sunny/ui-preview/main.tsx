import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { SettingsProvider, useSettings, useBudget, transactions as initialTransactions } from './fixtures';
import { UiVersionProvider, useUiVersion } from '../src/shared/providers/UiVersionProvider';
import { AdaptiveNav } from '../src/shared/components/AdaptiveNav';
import { SideNav } from '../src/shared/components/SideNav';
import { BottomNav } from '../src/shared/components/BottomNav';
import { AppHeader } from '../src/app/AppHeader';
import { useUiRouteFocus } from '../src/shared/hooks/useUiRouteFocus';
import { AppRoutes } from '../src/app/AppRoutes';
import { TransactionModal } from '../src/features/transactions/TransactionModal';
import { RefundSheet } from '../src/features/transactions/RefundSheet';
import { ReleaseDialog } from '../src/shared/components/ReleaseDialog';
import { PushPromoSheet } from '../src/shared/components/PushPromoSheet';
import { aggregateFlow, accountDelta } from '../src/shared/financialFlow';
import { ownShare, investSign, type Transaction, type TransactionType } from '../src/types';
import { monthContext } from '../src/utils';
import '../src/index.css';

const query=new URLSearchParams(location.search);
const pilotUid='qPtCOJGRrwOZ2EfjxMHwW6ZISXX2';
const userFor=(uid:string)=>({uid,displayName:'Luca · dati illustrativi',email:'anteprima@locale.invalid',photoURL:null});
function Preview() {
  const [uid,setUid]=useState(query.get('user')==='normal'?'ordinary':pilotUid);
  return <UiVersionProvider user={uid ? userFor(uid) : null}><SettingsProvider key={uid}>
    <PreviewShell key={uid} uid={uid} onSwitch={setUid} />
  </SettingsProvider></UiVersionProvider>;
}
function PreviewShell({uid,onSwitch}:{uid:string;onSwitch:(uid:string)=>void}) {
  const uiVersion=useUiVersion(), settings=useSettings(), budget=useBudget();
  const route=useLocation(),navigate=useNavigate();
  useUiRouteFocus();
  const [menu,setMenu]=useState(false),[modal,setModal]=useState(query.has('editor') && uid===pilotUid);
  const [editing,setEditing]=useState<Transaction|null>(query.has('edit') ? initialTransactions.find(t=>t.type===(query.get('edit')||'expense'))??null : null),[defaultType,setDefaultType]=useState<TransactionType|undefined>(query.has('generic')?undefined:'expense');
  const [rows,setRows]=useState(initialTransactions),[refund,setRefund]=useState(false);
  const [writes,setWrites]=useState(0);
  const [notice,setNotice]=useState(query.has('notices')),[promo,setPromo]=useState(query.has('notices'));
  const tx=useMemo(()=>{
    const today=new Date().toISOString().slice(0,10),ym=today.slice(0,7);
    const realized=rows.filter(t=>t.date<=today),month=realized.filter(t=>t.date.startsWith(ym));
    const balances=Object.fromEntries(settings.accounts.map(a=>[a.id,(a.initialBalance??0)+realized.reduce((v,t)=>v+accountDelta(t,a.id),0)]));
    const inv=Object.fromEntries(settings.categories.filter(c=>c.kind==='investment').map(c=>[c.id,(c.initialBalance??0)+realized.filter(t=>t.type==='investment'&&t.category===c.id).reduce((v,t)=>v+investSign(t)*t.amount,0)]));
    const investmentTotal=Object.values(inv).reduce((v,a)=>v+a,0),liquidity=Object.values(balances).reduce((v,a)=>v+a,0);
    const totals=Object.fromEntries(settings.categories.map(c=>[c.id,month.filter(t=>t.type==='expense'&&t.category===c.id).reduce((v,t)=>v+ownShare(t),0)]));
    const trend=Array.from({length:12},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-11+i);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const flow=aggregateFlow(realized.filter(t=>t.date.startsWith(key)));return {key,income:flow.ordinaryIncome,expense:flow.expenses,invest:flow.investedFromAccounts};});
    const flow=aggregateFlow(month);
    return {loading:false,error:null,synced:true,transactions:rows,allTransactions:rows,accountBalances:balances,investmentByCategory:inv,liquidity,investmentTotal,
      netWorth:liquidity+(settings.includeInvestments?investmentTotal:0),monthlyIncome:flow.ordinaryIncome,monthlyExpenses:flow.expenses,monthlyInvestments:flow.investedFromAccounts,
      monthlyFlow:flow,categoryTotals:totals,trend,deleteTransaction:async()=>{},updateTransactions:async()=>{},deleteTransactions:async()=>{},deleteAll:async()=>{}};
  },[rows,settings.accounts,settings.categories,settings.includeInvestments]);
  const openAdd=()=>{setEditing(null);setDefaultType('expense');setModal(true);};
  const editor={openAdd,openAddWithType:(t:TransactionType)=>{setEditing(null);setDefaultType(t);setModal(true);},openEdit:(t:Transaction)=>{setEditing(t);setModal(true);},projected:[]};
  const save=async(_deleteIds:string[],created:Omit<Transaction,'id'>[])=>{
    if(query.has('failSave')) throw new Error('Fixture: rete non disponibile');
    setWrites(n=>n+1); setRows(r=>[...r,...created.map((t,i)=>({...t,id:`preview-${Date.now()}-${i}`}))]);
  };
  const isSettings=route.pathname.startsWith('/settings');
  return <div data-ui-version={uiVersion} className={uiVersion==='3.0'?'h-full app-shell ui3-shell':'h-full md:flex ui-v2'}>
    {uiVersion==='3.0'?<AdaptiveNav onAdd={openAdd} onImport={()=>{}} aiEnabled={settings.aiEnabled} showCommitments isSettings={isSettings}/>:<SideNav onAdd={openAdd} onImport={()=>{}} aiEnabled={settings.aiEnabled} transactions={rows} showCommitments/>}
    <div className={`app-content flex-1 min-w-0 flex flex-col h-full overflow-hidden ${uiVersion==='2.0'?'md:ml-[220px]':''}`}>
      <AppHeader brand="Ciao, Luca" monthLine={monthContext()} loading={false} isSettings={isSettings} settingsOpen={menu} onToggleSettings={setMenu} onImport={()=>{}} aiEnabled={settings.aiEnabled} showCommitments/>
      <div id="app-scroll" className="flex-1 overflow-y-auto overscroll-contain"><main id="page-content" tabIndex={-1} className="app-main max-w-2xl mx-auto md:max-w-none px-4 md:px-8 pt-4 md:pt-2 pb-24 md:pb-2">
        <AppRoutes {...({user:userFor(uid),brand:'Ciao, Luca',tx,budget,editing:editor,applePayPayments:[],applePayLoading:false,applePayError:null,onReviewApplePay(){},onIgnoreApplePay:async()=>{},onLogOut:()=>onSwitch(''),onDeleteAccount:async()=>{},onImport(){}} as any)}/>
        <div style={{marginTop:40,padding:16,border:'1px dashed var(--border)',fontSize:12}} aria-label="Controlli anteprima locale">
          Dati illustrativi · nessuna connessione al database · scritture simulate: <output id="preview-writes">{writes}</output>
          <div className="flex gap-2 flex-wrap"><button onClick={openAdd}>Apri editor test</button><button onClick={()=>settings.saveTheme(settings.theme==='light'?'dark':'light')}>Cambia tema test</button><button onClick={()=>onSwitch('ordinary')}>Utente normale test</button><button onClick={()=>onSwitch(pilotUid)}>Admin test</button><button onClick={()=>onSwitch('')}>Logout test</button><button onClick={()=>navigate(`/wrapped/${new Date().getFullYear()}`)}>Wrapped test</button></div>
        </div>
      </main></div>
      {uiVersion==='2.0'&&!isSettings&&<BottomNav onAdd={openAdd}/>}
    </div>
    {createPortal(<TransactionModal open={modal} editing={editing} defaultType={defaultType} transactions={rows} sourceBanner={query.has('applePay')?'Ricevuto da Carta test. Controlla i dati.':undefined} initialValues={query.has('applePay')?{source:'apple_pay',sourceId:'fixture-1',description:'Supermercato',amount:45}:undefined} singleSave={query.has('singleSave')} awaitSave={query.has('awaitSave')} onSave={save} onClose={()=>setModal(false)} onRegisterRefund={()=>{setModal(false);setRefund(true);}}/>,document.body)}
    <RefundSheet open={refund} transactions={rows} onClose={()=>setRefund(false)} onSave={()=>{}}/>
    <ReleaseDialog open={notice} title="Avviso di prova" onClose={()=>setNotice(false)} bullets={['Solo anteprima locale.']}/>
    <PushPromoSheet open={promo} onClose={()=>setPromo(false)} onGoToSettings={()=>setPromo(false)}/>
  </div>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Preview/></BrowserRouter>);
