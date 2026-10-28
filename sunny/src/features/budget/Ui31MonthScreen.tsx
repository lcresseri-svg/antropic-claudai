import {PageToolbar} from '../../shared/components/PageToolbar';
import { useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Transaction, TYPE_META, ownShare } from '../../types';
import { aggregateFlow } from '../../shared/financialFlow';
import { todayRomeISO } from '../../shared/romeDate';
import { isPending } from '../../shared/recurrence';
import { resolveCreditCardTransactions, withCreditCardCashEffects, isCreditCardSettlement } from '../../../../functions/src/domain/creditCards';
import { useBudget } from '../../shared/hooks/useBudget';
import { useSettings } from '../../shared/providers/settings';
import { useUiSessionState } from '../../shared/providers/UiVersionProvider';
import { isFeatureEnabled } from '../../shared/featureRollout';
import { transactionRoute } from '../../shared/transactionRoute';
import { formatCurrency } from '../../utils';
import { AccountBalanceLineChart } from '../dashboard/AccountBalanceLineChart';
import { buildMonthRhythm } from '../dashboard/monthRhythm';
import { monthKeyOf, prevMonthKey } from './monthlyBudget';
import { calculateMonthlyPlan, usePlanCalendar } from './useMonthlyPlan';
import { localDay, MonthlyPlanView } from './monthlyPlanSelectors';
import { PlanScreen } from './PlanScreen';
import { Ui31FlowChart, Ui31SpendingComposition } from './Ui31MonthCharts';
import './ui31-month.css';
export interface Ui31MonthScreenProps {user:User;transactions:Transaction[];loading?:boolean;error?:string|null;onAddScheduled?:(date:string)=>void}
const label=(month:string)=>new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,1).toLocaleDateString('it-IT',{month:'long',year:'numeric'});
const money=(amount:number)=>formatCurrency(amount/100);
const validMonth=(value:string|null):value is string=>!!value&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const bounds=(month:string)=>({start:new Date(Number(month.slice(0,4)),Number(month.slice(5))-1,1),end:new Date(Number(month.slice(0,4)),Number(month.slice(5)),0)});
export function Ui31MonthScreen(p:Ui31MonthScreenProps) {
  const [query,setQuery]=useSearchParams(),now=usePlanCalendar(),settings=useSettings(),store=useBudget(p.user);
  const current=monthKeyOf(now),queryMonth=query.get('month');
  const cashTransactions=withCreditCardCashEffects(resolveCreditCardTransactions(p.transactions,settings.accounts??[],todayRomeISO(now)),settings.accounts??[]);
  const [savedMonth,setSavedMonth]=useUiSessionState('budget.month',current);
  const month=validMonth(queryMonth)?queryMonth:savedMonth;
  const previousCurrent=useRef(current);
  useEffect(()=>{if(validMonth(queryMonth))setSavedMonth(queryMonth);},[queryMonth,setSavedMonth]);
  useEffect(()=>{if(previousCurrent.current!==current){if(savedMonth===previousCurrent.current&&!validMonth(queryMonth))setSavedMonth(current);previousCurrent.current=current;}},[current,savedMonth,queryMonth,setSavedMonth]);
  const changeMonth=(next:string)=>{setSavedMonth(next);setQuery(previous=>{const q=new URLSearchParams(previous);q.set('month',next);return q;});};
  const section=query.get('view')==='overview'?'overview':query.get('view')==='due'?'due':'plan';
  const plan=store.budgetHistory.find(b=>b.month===month)??null;
  const view=calculateMonthlyPlan(month,now,settings.enableBudget?plan:null,p.transactions,settings.categories,store.budgetHistory);
  const earliest=[current,month,...store.budgetHistory.map(b=>b.month),...p.transactions.map(t=>t.date.slice(0,7))].filter(m=>validMonth(m)).sort()[0];
  const latest=[month,monthKeyOf(new Date(now.getFullYear()+1,now.getMonth(),1))].sort().slice(-1)[0];
  const months:string[]=[];
  for(let m=latest;m>=earliest&&months.length<1200;m=prevMonthKey(m))months.push(m);
  const url=(view:string)=>{const q=new URLSearchParams(query);q.set('view',view);q.set('month',month);q.delete('category');return `/budget?${q}`;};
  const error=p.error||(settings.enableBudget?store.error:null),loading=!!p.loading||(settings.enableBudget&&store.loading);
  const {start,end}=bounds(month);
  return <div className="ui31-month">
    <PageToolbar title="Il tuo mese"/>
    <header className="ui31-month-heading">
      <div className="ui31-month-picker"><button aria-label="Mese precedente" disabled={month<=earliest} onClick={()=>changeMonth(prevMonthKey(month))}>‹</button><label><span className="sr-only">Mese selezionato</span><select aria-label="Mese selezionato" value={month} onChange={e=>changeMonth(e.target.value)}>{months.map(m=><option key={m} value={m}>{label(m)}</option>)}</select></label><button aria-label="Mese successivo" disabled={month>=latest} onClick={()=>changeMonth(monthKeyOf(new Date(Number(month.slice(0,4)),Number(month.slice(5)),1)))}>›</button></div>
    </header>
    <nav className="ui31-month-tabs" aria-label="Sezioni del mese">{([['overview','Riepilogo'],['plan','Piano'],['due','Scadenze']] as const).map(([key,title])=><Link key={key} aria-current={section===key?'page':undefined} to={url(key)}>{title}</Link>)}</nav>
    {error?<section className="ui31-month-card" role="alert"><h2>Dati non disponibili</h2><p>{error}. Nessuna sintesi viene calcolata su dati incompleti.</p><button onClick={()=>p.error?window.location.reload():store.retry()}>Riprova</button></section>:loading?<p className="ui31-month-card" role="status" aria-busy="true">Caricamento del mese…</p>:<>
      {store.fromCache&&settings.enableBudget&&<p className="ui31-month-notice" role="status">Dati dalla cache: potrebbero non essere aggiornati.</p>}
      {section==='plan'?(settings.enableBudget?<PlanScreen key={month} {...p} month={month} onMonthChange={changeMonth} embedded/>:<section className="ui31-month-card ui31-optional-plan"><p className="ui31-metric-label">Una scelta tua</p><h2>Il piano è facoltativo</h2><p>Puoi leggere spese, flussi e scadenze senza attivarlo. Quando vuoi, puoi definire entrate attese, obiettivi e limiti.</p><Link className="ui31-primary-link" to="/settings?section=generali">Gestisci il piano nelle impostazioni <span aria-hidden="true">›</span></Link><Link to={url('overview')}>Esplora il riepilogo</Link></section>):section==='overview'?<MonthOverview view={view} transactions={cashTransactions} now={now} enabled={settings.enableBudget}/>:<MonthDue view={view} transactions={cashTransactions} user={p.user} onAddScheduled={p.onAddScheduled} now={now}/>}
    </>}
    <footer className="ui31-month-links" aria-label="Approfondimenti del mese"><Link to={transactionRoute({},start,end)}>Movimenti del mese</Link><Link to={`/category-spending?month=${month}`}>Analisi categorie</Link><Link to={`/income?month=${month}`}>Analisi entrate</Link><Link to="/insights">Tutti i consigli</Link><Link to={`/recap/${month}`}>Archivio e riepilogo</Link>{settings.aiEnabled&&<Link to="/ai-coach">AI Coach</Link>}</footer>
  </div>;
}
function MonthOverview({view,transactions,now,enabled}:{view:MonthlyPlanView;transactions:Transaction[];now:Date;enabled:boolean}) {
  const navigate=useNavigate();
  const flow=aggregateFlow(transactions.filter(t=>t.date.startsWith(view.month)&&!t.recurring&&!t.projected&&!isPending(t,todayRomeISO(now)))),{start,end}=bounds(view.month);
  const rhythm=buildMonthRhythm({transactions:view.realized,scheduled:view.upcoming.map(t=>({date:t.date,amount:ownShare(t)})),now,monthKey:view.month});
  const points=rhythm.days.filter(d=>!d.isFuture).map(d=>({label:String(d.day),value:d.spent}));
  const largest=Math.max(1,...view.categories.map(c=>c.spent));
  return <div className="ui31-month-overview">
    <section className="ui31-month-card ui31-month-overview-summary"><p className="ui31-metric-label">Uscite registrate</p><strong className="ui31-month-number">{money(view.A)}</strong><p>{label(view.month)} · spese al netto degli storni attribuiti ai movimenti originari.</p><Ui31SpendingComposition registered={view.A} scheduled={view.C}/><Link to={transactionRoute({type:'expense'},start,end)}>Vedi le spese registrate <span aria-hidden="true">›</span></Link></section>
    <section className="ui31-month-card"><Ui31FlowChart flow={flow}/></section>
    <section className="ui31-month-card ui31-month-categories"><div className="ui31-section-heading"><h2>Dove vanno le spese</h2><span>Registrate · per categoria</span></div>
      {!view.categories.length?<p>Nessuna spesa o limite in questo mese.</p>:<ul>{view.categories.map(c=><li key={c.id}><details><summary><span className="ui31-category-label"><span aria-hidden="true">{c.icon}</span>{c.label}{c.archived?' · Archiviata':''}</span><strong>{money(c.spent)}</strong><span aria-hidden="true">⌄</span><span className="ui31-category-track" aria-hidden="true"><span style={{width:`${Math.max(0,c.spent)/largest*100}%`}}/></span></summary>
        <dl className="ui31-category-stats"><div><dt>Speso</dt><dd>{money(c.spent)}</dd></div><div><dt>Programmato</dt><dd>{money(c.scheduled)}</dd></div><div><dt>Limite</dt><dd>{c.limit===null?'Non impostato':money(c.limit)}</dd></div><div><dt>Residuo del limite</dt><dd>{c.remaining===null?'Senza limite':money(c.remaining)}</dd></div></dl>
        {c.forecast!==null&&<p>Previsto a fine mese: {money(c.forecast)}. Stima totale, già comprensiva di speso e programmato.</p>}
        <ul className="ui31-category-transactions">{view.realized.filter(t=>t.type==='expense'&&t.category===c.id).slice(0,3).map(t=><li key={t.id}><span>{t.description||c.label}<small>{t.date.split('-').reverse().join('/')}</small></span><strong>{formatCurrency(ownShare(t))}</strong></li>)}</ul>
        <div className="ui31-category-actions"><Link to={transactionRoute({cat:c.id,type:'expense'},start,end)}>Movimenti e modifica <span aria-hidden="true">›</span></Link>{enabled&&<Link to={`/budget?view=plan&month=${view.month}&category=${encodeURIComponent(c.id)}`}>Rivedi il limite</Link>}</div>
      </details></li>)}</ul>}
    </section>
    <section className="ui31-month-card"><div className="ui31-section-heading"><h2>Ritmo giornaliero</h2><span>{label(view.month)}</span></div><p>Spese registrate, senza includere le date future.</p>{points.some(p=>p.value>0)?<AccountBalanceLineChart points={points} onSelectPoint={index=>navigate(transactionRoute({date:`${view.month}-${String(index+1).padStart(2,'0')}`},start,end))} presentation="bars" title="Spese giornaliere" lastPeriodLabel={view.period==='past'?'fine mese':'oggi'} metricLabel="Spesa" formatValue={formatCurrency} height={160}/>:<p>Nessuna spesa registrata nel periodo.</p>}
      <details className="ui31-chart-data"><summary>Dati giorno per giorno</summary><ul>{rhythm.days.filter(d=>d.spent>0).map(d=><li key={d.iso}><Link to={transactionRoute({date:d.iso},start,end)}>{d.iso.split('-').reverse().join('/')}<strong>{formatCurrency(d.spent)}</strong></Link></li>)}</ul>{!rhythm.totalSpent&&<p>Nessuna spesa registrata.</p>}</details>
    </section>
  </div>;
}
function MonthDue({view,transactions,user,onAddScheduled,now}:{view:MonthlyPlanView;transactions:Transaction[];user:User;onAddScheduled?: (date:string)=>void;now:Date}) {
  const all=[...view.realized.filter(t=>!isCreditCardSettlement(t)).map(t=>({t,scheduled:false})),...view.scheduled.filter(t=>!isCreditCardSettlement(t)).map(t=>({t,scheduled:true})),...transactions.filter(t=>isCreditCardSettlement(t)&&t.date.startsWith(view.month)).map(t=>({t,scheduled:t.date>todayRomeISO(now)}))].filter(({t})=>t.type==='expense'||t.type==='income'||t.type==='investment'||isCreditCardSettlement(t)).sort((a,b)=>a.t.date.localeCompare(b.t.date)||a.t.id.localeCompare(b.t.id));
  const items=view.period==='past'?all:all.filter(({t,scheduled})=>scheduled||!!t.seriesId||isCreditCardSettlement(t));
  const nextDate=view.month>monthKeyOf(now)?`${view.month}-01`:localDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
  const {start,end}=bounds(view.month);
  return <section className="ui31-month-card ui31-due"><div className="ui31-section-heading"><h2>Scadenze · {label(view.month)}</h2>{isFeatureEnabled('commitments',user)&&<Link to="/commitments">Gestisci serie <span aria-hidden="true">›</span></Link>}</div><p>Le occorrenze effettive del mese. Gli importi programmati non sono pagamenti già registrati, né costi mensili equivalenti.</p>
    {items.length?<ul>{items.map(({t,scheduled})=><li key={`${t.id}-${t.date}`}><div className="ui31-due-date"><span>{t.date.slice(8)}</span><small>{new Date(t.date+'T12:00:00').toLocaleDateString('it-IT',{month:'short'})}</small></div><div><strong>{t.description||TYPE_META[t.type].label}</strong><p>{t.date.split('-').reverse().join('/')} · {TYPE_META[t.type].label} · {scheduled?'Programmato':'Registrato'}</p></div><strong>{formatCurrency(t.type==='expense'?ownShare(t):t.amount)}</strong>{!scheduled&&<Link aria-label={`Vedi movimento ${t.description||TYPE_META[t.type].label}`} to={transactionRoute({date:t.date},start,end)}>Vedi <span aria-hidden="true">›</span></Link>}</li>)}</ul>:<p>Nessuna scadenza {view.period==='past'?'registrata':'ancora programmata'} in questo mese.</p>}
    {view.period!=='past'&&onAddScheduled&&<button className="ui31-primary-link" onClick={()=>onAddScheduled(nextDate)}>Aggiungi spesa programmata <span aria-hidden="true">+</span></button>}
  </section>;
}
