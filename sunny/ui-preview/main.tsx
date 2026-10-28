import {SettingsHeaderProvider} from '../src/shared/providers/SettingsHeaderProvider';
import {EmojiCatalogProvider} from '../src/shared/providers/EmojiCatalogProvider';
import { OnboardingScreen } from '../src/features/onboarding/OnboardingScreen';
import { LoginScreen } from '../src/shared/components/LoginScreen';
import { ImportModal } from '../src/features/transactions/ImportModal';
import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { SettingsProvider, useSettings, useBudget, transactions as initialTransactions, financeToday, financeExpenseIds } from './fixtures';
import { UiVersionProvider, useUiVersion } from '../src/shared/providers/UiVersionProvider';
import { AdaptiveNav } from '../src/shared/components/AdaptiveNav';
import { SideNav } from '../src/shared/components/SideNav';
import { BottomNav } from '../src/shared/components/BottomNav';
import { AppHeader } from '../src/app/AppHeader';
import { useUiRouteFocus } from '../src/shared/hooks/useUiRouteFocus';
import { AppRoutes } from '../src/app/AppRoutes';
import { TransactionModal } from '../src/features/transactions/TransactionModal';
import { RefundSheet } from '../src/features/transactions/RefundSheet';
import { MultiRefundSheet } from '../src/features/transactions/MultiRefundSheet';
import { CreditCardSettlementSheet } from '../src/features/transactions/CreditCardSettlementSheet';
import {WhatsNewModal} from '../src/shared/components/WhatsNewModal';
import { ReleaseDialog } from '../src/shared/components/ReleaseDialog';
import { PushPromoSheet } from '../src/shared/components/PushPromoSheet';
import { aggregateFlow } from '../src/shared/financialFlow';
import { calculateAccountPositions } from '../src/shared/accountPositions';
import { applyRefunds } from '../src/shared/refunds';
import { assertOrdinaryMutation } from '../src/shared/refundMutationPolicy';
import { allocateRefundReceipt, refundAllocationRowId, REFUND_GAIN_CATEGORY, type RefundReceiptDraft } from '../src/shared/multiRefunds';
import { isCreditCardSettlement, resolveCreditCardTransactions, withCreditCardCashEffects } from '../../functions/src/domain/creditCards';
import { ownShare, investSign, type Transaction, type TransactionType } from '../src/types';
import { monthContext } from '../src/utils';
import '../src/index.css';

const query=new URLSearchParams(location.search);
const pilotUid='qPtCOJGRrwOZ2EfjxMHwW6ZISXX2';
const userFor=(uid:string)=>({uid,displayName:'Luca · dati illustrativi',email:'anteprima@locale.invalid',photoURL:null});
function Preview() {
  const [uid,setUid]=useState(query.get('user')==='normal'?'ordinary':pilotUid);
  return <UiVersionProvider user={uid ? userFor(uid) : null}><SettingsProvider key={uid}>
    <EmojiCatalogProvider uid={uid}><SettingsHeaderProvider><PreviewShell key={uid} uid={uid} onSwitch={setUid} /></SettingsHeaderProvider></EmojiCatalogProvider>
  </SettingsProvider></UiVersionProvider>;
}
function PreviewShell({uid,onSwitch}:{uid:string;onSwitch:(uid:string)=>void}) {
  const uiVersion=useUiVersion(), settings=useSettings(), budget=useBudget();
  const route=useLocation(),navigate=useNavigate();
  useUiRouteFocus();
  const [importOpen,setImportOpen]=useState(query.has('import'));
  const [menu,setMenu]=useState(false),[modal,setModal]=useState(query.has('editor') && uid===pilotUid);
  const [editing,setEditing]=useState<Transaction|null>(query.has('edit') ? initialTransactions.find(t=>t.type===(query.get('edit')||'expense'))??null : null),[defaultType,setDefaultType]=useState<TransactionType|undefined>(query.has('generic')?undefined:'expense');
  const [rows,setRows]=useState(initialTransactions),[refund,setRefund]=useState(false);
  const [refundExpenseId,setRefundExpenseId]=useState<string|undefined>();
  const [editingRefund,setEditingRefund]=useState<Transaction|undefined>();
  const [multiRefund,setMultiRefund]=useState<{expenseIds:string[];editingGroupId?:string}|null>(null);
  const [statement,setStatement]=useState<Transaction|null>(null);
  const [writes,setWrites]=useState(0);
  const [scheduledDate,setScheduledDate]=useState<string|undefined>();
  const [notice,setNotice]=useState(query.has('notices')),[promo,setPromo]=useState(query.has('notices'));
  const tx=useMemo(()=>{
    const today=query.has('financeCase')?financeToday:new Date().toISOString().slice(0,10),ym=today.slice(0,7);
    const transactions=applyRefunds(withCreditCardCashEffects(resolveCreditCardTransactions(rows,settings.accounts,today),settings.accounts),today);
    const realized=transactions.filter(t=>t.date<=today&&!t.recurring&&!t.projected),month=realized.filter(t=>t.date.startsWith(ym));
    const positions=calculateAccountPositions(realized,settings.accounts),balances=positions.balances;
    const inv=Object.fromEntries(settings.categories.filter(c=>c.kind==='investment').map(c=>[c.id,(c.initialBalance??0)+realized.filter(t=>t.type==='investment'&&t.category===c.id).reduce((v,t)=>v+investSign(t)*t.amount,0)]));
    const investmentTotal=Object.values(inv).reduce((v,a)=>v+a,0),liquidity=positions.liquidity;
    const totals=Object.fromEntries(settings.categories.map(c=>[c.id,month.filter(t=>t.type==='expense'&&t.category===c.id).reduce((v,t)=>v+ownShare(t),0)]));
    const trend=Array.from({length:12},(_,i)=>{const d=new Date(`${today}T12:00:00Z`);d.setMonth(d.getMonth()-11+i,1);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;const period=realized.filter(t=>t.date.startsWith(key));return {key,income:period.filter(t=>t.type==='income').reduce((v,t)=>v+t.amount,0),expense:period.filter(t=>t.type==='expense').reduce((v,t)=>v+ownShare(t),0),invest:period.filter(t=>t.type==='investment').reduce((v,t)=>v+investSign(t)*t.amount,0)};});
    const flow=aggregateFlow(month);
    return {loading:false,error:null,synced:true,transactions,allTransactions:rows,accountBalances:balances,creditCardBalances:positions.deferredBalances,investmentByCategory:inv,liquidity,investmentTotal,
      addTransactions:async(created:Omit<Transaction,'id'>[])=>save([],created),netWorth:positions.ledgerTotal+(settings.includeInvestments?investmentTotal:0),monthlyIncome:month.filter(t=>t.type==='income').reduce((v,t)=>v+t.amount,0),monthlyExpenses:month.filter(t=>t.type==='expense').reduce((v,t)=>v+ownShare(t),0),monthlyInvestments:month.filter(t=>t.type==='investment').reduce((v,t)=>v+investSign(t)*t.amount,0),
      monthlyFlow:flow,categoryTotals:totals,trend,deleteTransaction:async(id:string)=>deleteRows([id]),updateTransactions:async(ids:string[],patch:Partial<Transaction>)=>{if(query.has('failBulk'))throw Error('Fixture: aggiornamento non riuscito');for(const t of rows.filter(t=>ids.includes(t.id)))assertOrdinaryMutation(t,{...t,...patch},rows);setRows(r=>r.map(t=>ids.includes(t.id)?{...t,...patch}:t));setWrites(n=>n+1);},deleteTransactions:deleteRows,deleteAll:async()=>{setRows([]);setWrites(n=>n+1);}};
  },[rows,settings.accounts,settings.categories,settings.includeInvestments]);
  const openAdd=()=>{setEditing(null);setDefaultType('expense');setModal(true);};
  const openSelectedRefund=(expenseIds:string[])=>{
    if(expenseIds.length===1){setRefundExpenseId(expenseIds[0]);setEditingRefund(undefined);setRefund(true);}
    else setMultiRefund({expenseIds});
  };
  const openEdit=(t:Transaction)=>{
    if(isCreditCardSettlement(t)){setStatement(t);return;}
    if(t.refundGroupId){setMultiRefund({editingGroupId:t.refundGroupId,expenseIds:[...new Set(rows.filter(r=>r.refundGroupId===t.refundGroupId&&r.refundOf).map(r=>r.refundOf!))]});return;}
    if(t.type==='refund'){setEditingRefund(t);setRefundExpenseId(t.refundOf);setRefund(true);return;}
    setEditing(t);setModal(true);
  };
  const editor={openAdd,openSelectedRefund,openScheduledExpense:(date:string)=>{setScheduledDate(date);openAdd();},openAddWithType:(t:TransactionType)=>{setEditing(null);setDefaultType(t);setModal(true);},openEdit,projected:[]};
  async function deleteRows(ids:string[]){
    if(query.has('failBulk')||query.has('failSave'))throw Error('Fixture: eliminazione non riuscita');
    for(const t of rows.filter(t=>ids.includes(t.id)))assertOrdinaryMutation(t,null,rows);
    setRows(r=>r.filter(t=>!ids.includes(t.id)));setWrites(n=>n+1);
  }
  const save=async(_deleteIds:string[],created:Omit<Transaction,'id'>[])=>{
    if(query.has('failSave')) throw new Error('Fixture: rete non disponibile');
    if(editing&&_deleteIds.includes(editing.id))assertOrdinaryMutation(rows.find(t=>t.id===editing.id)??editing,created[0]??null,rows);
    setWrites(n=>n+1); setRows(r=>[...r.filter(t=>!_deleteIds.includes(t.id)),...created.map((t,i)=>({...t,id:editing&&_deleteIds.includes(editing.id)&&created.length===1?editing.id:`preview-${Date.now()}-${i}`}))]);
  };
  const saveMultiRefund=async(draft:RefundReceiptDraft)=>{
    if(query.has('failSave'))throw Error('Fixture: rete non disponibile');
    const sources=draft.expenseIds.map(id=>rows.find(t=>t.id===id)).filter((t):t is Transaction=>!!t);
    if(sources.length!==draft.expenseIds.length)throw Error('Una spesa non è più disponibile.');
    const allocation=allocateRefundReceipt(sources,rows,draft.amount,draft.receiptId);
    const common={date:draft.date,account:draft.account,notes:draft.notes,refundGroupId:draft.receiptId,createdAt:rows.find(t=>t.refundGroupId===draft.receiptId)?.createdAt??Date.now()};
    const receipt:Transaction[]=allocation.allocations.filter(a=>a.allocatedCents>0).map(a=>{
      const source=sources.find(t=>t.id===a.expenseId)!;
      return {...common,id:refundAllocationRowId(draft.receiptId,source.id),type:'refund',refundOf:source.id,category:source.category,amount:a.allocatedCents/100,description:`Storno · ${source.description}`};
    });
    if(allocation.gainCents>0)receipt.push({...common,id:`${draft.receiptId}__gain`,type:'income',category:REFUND_GAIN_CATEGORY,amount:allocation.gainCents/100,description:'Guadagno da rimborso'});
    setRows(r=>[...r.filter(t=>t.refundGroupId!==draft.receiptId),...receipt]);setWrites(n=>n+1);
  };
  const deleteMultiRefund=async()=>{
    if(query.has('failSave'))throw Error('Fixture: eliminazione non riuscita');
    setRows(r=>r.filter(t=>t.refundGroupId!==multiRefund?.editingGroupId));setWrites(n=>n+1);
  };
  const [onboardingDone,setOnboardingDone]=useState(false);
  const [loginError,setLoginError]=useState<string|null>(null);
  if(query.has('login')) return <LoginScreen onSignIn={()=>setLoginError('Accesso di prova non riuscito. Riprova.')} error={loginError}/>;
  if(query.has('onboarding')&&!onboardingDone)return <OnboardingScreen uid={uid} onboarding={{completed:false,version:1,currentStep:0,goals:[],dataMode:null}} transactions={tx.transactions} transactionsLoading={tx.loading} updateOnboarding={()=>{}} completeOnboarding={()=>setOnboardingDone(true)} skipOnboarding={()=>setOnboardingDone(true)} onImport={rows=>save([],rows)}/>;
  const isSettings=route.pathname.startsWith('/settings');
  return <div data-liquid-ui={uiVersion==='3.0'&&!route.pathname.startsWith('/wrapped/')?'true':undefined} data-ui-version={uiVersion} className={uiVersion==='3.0'?'h-full app-shell ui3-shell':'h-full md:flex ui-v2'}>
    {menu&&(!isSettings||uiVersion==='3.0')&&<div className="fixed inset-0 z-[35]" onClick={()=>setMenu(false)}/>}
    {uiVersion==='3.0'?<AdaptiveNav onAdd={openAdd} onImport={()=>setImportOpen(true)} aiEnabled={settings.aiEnabled} showCommitments isSettings={isSettings}/>:<SideNav onAdd={openAdd} onImport={()=>setImportOpen(true)} aiEnabled={settings.aiEnabled} transactions={rows} showCommitments/>}
    <div className={`app-content flex-1 min-w-0 flex flex-col h-full overflow-hidden ${uiVersion==='2.0'?'md:ml-[220px]':''}`}>
      <AppHeader brand="Ciao, Luca" monthLine={monthContext()} loading={false} isSettings={isSettings} settingsOpen={menu} onToggleSettings={setMenu} onImport={()=>setImportOpen(true)} aiEnabled={settings.aiEnabled} showCommitments/>
      <div id="app-scroll" className="flex-1 overflow-y-auto overscroll-contain"><main data-preview-route={route.pathname+route.search} id="page-content" tabIndex={-1} className="app-main max-w-2xl mx-auto md:max-w-none px-4 md:px-8 pt-4 md:pt-2 pb-24 md:pb-2">
        <AppRoutes {...({user:userFor(uid),brand:'Ciao, Luca',tx,budget,editing:editor,applePayPayments:query.has('manyPriorities')?[{id:'pending-1',schemaVersion:1,eventId:'test',source:'apple_pay',status:'pending',amount:20,currency:'EUR',date:new Date().toISOString().slice(0,10),merchant:'Negozio test',description:'Acquisto da confermare',cardKey:'test',cardLabel:'Carta test',receivedAt:0}]:[],applePayLoading:false,applePayError:null,onReviewApplePay(){},onIgnoreApplePay:async()=>{},onLogOut:()=>onSwitch(''),onDeleteAccount:async()=>{},onImport(){setImportOpen(true);}} as any)}/>
        <div style={{marginTop:40,padding:16,border:'1px dashed var(--border)',fontSize:12}} aria-label="Controlli anteprima locale">
          Dati illustrativi · nessuna connessione al database · scritture simulate: <output id="preview-writes">{writes}</output>
          · Piani salvati in memoria: <output id="preview-plan-writes">{budget.writes}</output>
          <div className="flex gap-2 flex-wrap"><button onClick={openAdd}>Apri editor test</button><button onClick={()=>settings.saveTheme(settings.theme==='light'?'dark':'light')}>Cambia tema test</button><button onClick={()=>onSwitch('ordinary')}>Utente normale test</button><button onClick={()=>onSwitch(pilotUid)}>Admin test</button><button onClick={()=>onSwitch('')}>Logout test</button><button onClick={()=>navigate(`/wrapped/${new Date().getFullYear()}`)}>Wrapped test</button></div>
          {query.has('financeCase')&&<div className="mt-3 space-y-2">
            <p>Data contabile della prova: {financeToday}</p>
            <div className="flex gap-3 flex-wrap">
              <button onClick={()=>openSelectedRefund(financeExpenseIds)}>Rimborso multiplo test</button>
              <button onClick={()=>openSelectedRefund([financeExpenseIds[0]])}>Rimborso singolo test</button>
              <button disabled={!tx.transactions.some(isCreditCardSettlement)} onClick={()=>setStatement(tx.transactions.find(isCreditCardSettlement)??null)}>Apri distinta test</button>
              <button disabled={!rows.some(t=>t.refundGroupId)} onClick={()=>{const receipt=rows.find(t=>t.refundGroupId);if(receipt)openEdit(receipt);}}>Modifica ricevuta test</button>
            </div>
            <output id="preview-finance-snapshot" className="block break-all">{JSON.stringify({
              today:financeToday,liquidity:tx.liquidity,netWorth:tx.netWorth,accountBalances:tx.accountBalances,creditCardBalances:tx.creditCardBalances,
              monthlyExpenses:tx.monthlyExpenses,categoryTotals:tx.categoryTotals,monthlyFlow:tx.monthlyFlow,
              expenses:tx.transactions.filter(t=>t.type==='expense').map(t=>({id:t.id,date:t.date,amount:t.amount,ownShare:ownShare(t),refundedTotal:t.refundedTotal??0,cashDelta:t.cashDelta})),
              settlements:tx.transactions.filter(isCreditCardSettlement),receipts:rows.filter(t=>t.refundGroupId),
            })}</output>
          </div>}
        </div>
      </main></div>
      {uiVersion==='2.0'&&!isSettings&&<BottomNav onAdd={openAdd}/>}
    </div>
    {createPortal(<TransactionModal title={query.has('applePay') ? 'Conferma Apple Pay' : undefined} saveLabel={query.has('applePay') ? 'Conferma pagamento' : undefined} open={modal} editing={editing} defaultType={defaultType} transactions={tx.transactions} sourceBanner={scheduledDate?'Spesa programmata registrata: Salva crea un movimento futuro, non una simulazione.':query.has('applePay')?'Ricevuto da Carta test. Controlla i dati.':undefined} initialValues={scheduledDate?{date:scheduledDate}:query.has('applePay')?{source:'apple_pay',sourceId:'fixture-1',description:'Supermercato',amount:45}:undefined} typeLocked={query.has('applePay')} singleSave={query.has('singleSave')} awaitSave={query.has('awaitSave')} onSave={save} onClose={()=>{setModal(false);setScheduledDate(undefined);}} onRegisterRefund={()=>{setModal(false);setRefundExpenseId(editing?.type==='expense'?editing.id:undefined);setEditingRefund(undefined);setRefund(true);}}/>,document.body)}
    <ImportModal open={importOpen} onClose={()=>setImportOpen(false)} onImport={rows=>save([],rows)}/>
    <RefundSheet open={refund} transactions={tx.transactions} expenseId={refundExpenseId} editing={editingRefund} onClose={()=>setRefund(false)} onSave={async(data,editingId)=>{
      if(query.has('failSave'))throw Error('Fixture: rete non disponibile');
      setRows(r=>[...r.filter(t=>t.id!==editingId),{...data,id:editingId??`preview-refund-${Date.now()}`}]);setWrites(n=>n+1);
    }}/>
    <MultiRefundSheet open={!!multiRefund} transactions={tx.transactions} expenseIds={multiRefund?.expenseIds??[]} editingGroupId={multiRefund?.editingGroupId}
      onSave={saveMultiRefund} onDelete={multiRefund?.editingGroupId?deleteMultiRefund:undefined} onClose={()=>setMultiRefund(null)}/>
    <CreditCardSettlementSheet transaction={statement} onClose={()=>setStatement(null)}/>
    {query.has('whatsNew')&&uid&&<WhatsNewModal userId={uid}/>}
    <ReleaseDialog open={notice} title="Avviso di prova" onClose={()=>setNotice(false)} bullets={['Solo anteprima locale.']}/>
    <PushPromoSheet open={promo} onClose={()=>setPromo(false)} onGoToSettings={()=>setPromo(false)}/>
  </div>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Preview/></BrowserRouter>);
