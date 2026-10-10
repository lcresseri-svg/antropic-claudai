import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { Transaction, ownShare } from '../../types';
import { useBudget } from '../../shared/hooks/useBudget';
import { useSettings } from '../../shared/providers/settings';
import { useUiSessionState } from '../../shared/providers/UiVersionProvider';
import { isFeatureEnabled } from '../../shared/featureRollout';
import { CoachEntryCard } from '../aiCoach/CoachEntryCard';
import { listRecapMonths } from '../recap/monthlyRecap';
import { MonthlyBudget, initMonthlyBudget, monthKeyOf, prevMonthKey } from './monthlyBudget';
import { localDay, PlanCategory, MonthlyPlanView } from './monthlyPlanSelectors';
import { useMonthlyPlan, usePlanCalendar } from './useMonthlyPlan';
import { PlanEditor, PlanEditorSection } from './PlanEditor';
import { PlanDialog } from './PlanDialog';
import { moveCategoryLimit, parsePlanAmount } from './planDraft';
import { formatCurrency } from '../../utils';
import './plan.css';
const money=(v:number|null)=>v===null?'Da completare':formatCurrency(v/100);
const monthLabel=(m:string)=>new Date(Number(m.slice(0,4)),Number(m.slice(5))-1,1).toLocaleDateString('it-IT',{month:'long',year:'numeric'});
const states={unlimited:'Senza limite',within:'Nei limiti','spent-over':'Limite superato','committed-over':'Con il programmato','forecast-risk':'Rischio stimato'};
interface Props {user:User;transactions:Transaction[];loading?:boolean;error?:string|null;onAddScheduled?:(date:string)=>void}
export function PlanScreen(p:Props) {
  const store=useBudget(p.user),settings=useSettings(),now=usePlanCalendar(),navigate=useNavigate();
  const current=monthKeyOf(now);
  const [month,setMonth]=useUiSessionState('budget.month',current);
  const priorCurrent=useRef(current);
  useEffect(()=>{if(priorCurrent.current!==current){if(month===priorCurrent.current)setMonth(current);priorCurrent.current=current;}},[current,month,setMonth]);
  const plan=store.budgetHistory.find(b=>b.month===month)??null;
  const view=useMonthlyPlan(month,now,plan,p.transactions,settings.categories,store.budgetHistory);
  const [editor,setEditor]=useState<{section:PlanEditorSection;category?:string;initialPlan?:MonthlyBudget}|null>(null);
  const [detail,setDetail]=useState<string|null>(null),[calculation,setCalculation]=useState(false),[forecastDetail,setForecastDetail]=useState(false);
  const [all,setAll]=useState(false),[reviewOnly,setReviewOnly]=useState(false),[allDue,setAllDue]=useState(false),[allActions,setAllActions]=useState(false);
  const [archive,setArchive]=useUiSessionState('budget.archive',false);
  const [transfer,setTransfer]=useState<PlanCategory|null>(null);
  const [saved,setSaved]=useState(false);
  const edit=(section:PlanEditorSection='income',category?:string)=>{setSaved(false);setEditor({section,category});};
  const rows=view.categories.filter(c=>!reviewOnly||['spent-over','committed-over','forecast-risk'].includes(c.state));
  const category=view.categories.find(c=>c.id===detail);
  const earliest=[current,...store.budgetHistory.map(b=>b.month),...p.transactions.map(t=>t.date.slice(0,7))].sort()[0];
  const latest=monthKeyOf(new Date(now.getFullYear()+1,now.getMonth(),1));
  const months:string[]=[];
  for(let m=latest;m>=earliest&&months.length<1200;m=prevMonthKey(m))months.push(m);
  const recap=listRecapMonths(p.transactions);
  const nextDate=month>current?`${month}-01`:localDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1));
  const status=view.period==='past'?'Consuntivo':!view.reviewed?'Da completare':plan?.status==='confirmed'?'Confermato':'Bozza';
  const upcoming=(items:Transaction[])=><ul className="plan-lines">{items.map(t=><li key={t.id}><span>{t.description||'Spesa programmata'}<small>{t.date.split('-').reverse().join('/')} · {settings.categories.find(c=>c.id===t.category)?.label??`Categoria ${t.category}`}</small></span><strong>{formatCurrency(ownShare(t))}</strong></li>)}</ul>;
  if(store.loading||p.loading)return <div className="piano-page" role="status" aria-busy="true"><h1>Piano</h1><div className="plan-card plan-skeleton">Caricamento del piano…</div></div>;
  if(store.error||p.error)return <div className="piano-page"><h1>Piano</h1><p role="alert">Dati non disponibili: {store.error||p.error}. Il margine non viene calcolato su dati incompleti.</p></div>;
  return <div className="piano-page ui-family-budget">
    <header className="plan-header"><div><h1>Piano</h1><span>{status}</span></div><div className="plan-month-nav">
      <button aria-label="Mese precedente" disabled={month<=earliest} onClick={()=>setMonth(prevMonthKey(month))}>‹</button>
      <label><span className="sr-only">Mese del piano</span><select aria-label="Mese del piano" value={month} onChange={e=>setMonth(e.target.value)}>{months.map(m=><option value={m} key={m}>{monthLabel(m)}</option>)}</select></label>
      <button aria-label="Mese successivo" disabled={month>=latest} onClick={()=>setMonth(monthKeyOf(new Date(Number(month.slice(0,4)),Number(month.slice(5)),1)))}>›</button>
    </div><button onClick={()=>edit()}>{view.period==='past'?'Modifica piano storico':'Modifica piano'}</button></header>
    {saved&&<p role="status">Piano salvato sul server.</p>}
    {store.fromCache&&<p className="plan-notice" role="status">Dati dalla cache: potrebbero non essere aggiornati. Le modifiche restano bozze locali fino al salvataggio online.</p>}
    <div className="plan-layout">
      <div className="plan-sidebar">
        <section className="plan-card plan-summary">
          <p className="plan-eyebrow">{view.period==='past'?'Risultato del mese':view.period==='future'?'Quanto hai pianificato':plan?.status==='confirmed'?'Margine per le spese non programmate':'Margine della bozza'}</p>
          {view.M===null?<><h2>{!p.transactions.length?'Creiamo il tuo primo piano':'Completa il piano'}</h2><p>Rivedi le entrate attese e gli obiettivi: nessuna disponibilità viene presunta.</p><button className="plan-primary" onClick={()=>edit()}>{view.period==='past'?'Rivedi piano storico':'Completa il piano'}</button></>:
            <><strong className={`plan-number ${view.M<0?'plan-negative':''}`}>{money(view.M)}</strong>
              <p>{view.period==='past'?'Margine del piano confrontato con le spese registrate.':'Nel mese, dopo spese registrate, programmate e obiettivi.'}</p>
              {view.M<0&&<p className="plan-negative">Mancano {money(-view.M)} al tuo piano.</p>}
              {view.pendingIncome>0&&<p className="plan-notice">Entrate attese {view.period==='past'?'non incassate':'ancora da incassare'}: <strong>{money(view.pendingIncome)}</strong>. Il margine dipende dal loro arrivo.</p>}
              <p className="plan-caption">Non è il saldo spendibile oggi. <button onClick={()=>navigate('/wealth')}>Consulta Patrimonio</button></p>
              <button onClick={()=>setCalculation(true)}>Come è calcolato</button>
              {view.period!=='past'&&(view.M<0||plan?.status!=='confirmed')&&<button className="plan-primary" onClick={()=>edit()}>{plan?.status==='confirmed'?'Rivedi piano':'Rivedi e conferma'}</button>}
            </>}
        </section>
        <section className="plan-card"><h2>Il tuo piano</h2><div className="plan-lines">
          <button onClick={()=>edit('income')}><span>Entrate attese</span><strong>{view.reviewed?money(view.E):'Da rivedere'} ›</strong></button>
          <button onClick={()=>edit('goals')}><span>Risparmio da mantenere</span><strong>{plan?money(view.S):'Da impostare'} ›</strong></button>
          <p className="plan-caption">Quota delle entrate da non spendere o investire, non denaro già accantonato.</p>
          <button onClick={()=>edit('goals')}><span>{settings.enableInvestments?'Investimenti dai conti':'Obiettivi già impostati · investimenti'}</span><strong>{view.reviewed?money(view.It):'Da rivedere'} ›</strong></button>
          <p className="plan-caption">Riservati {money(view.Ir)}: il maggiore tra obiettivo e investimenti effettuati/program­mati. TFR e apporti esterni esclusi.</p>
          <p className="plan-total"><span>Per le spese</span><strong>{money(view.P)}</strong></p>
          <p className="plan-caption">Cuscinetto non allocato: {money(view.U)}. È distinto dal margine ancora disponibile nelle categorie.</p>
        </div></section>
      </div>
      <div className="plan-main">
        {view.decisions.length>0&&<section className="plan-card"><h2>Decisioni del mese</h2><ul className="plan-actions">{view.decisions.slice(0,allActions?undefined:2).map(d=><li key={d.id}><p>{d.text}{d.amount!==undefined&&<> · <strong>{money(d.amount)}</strong></>}</p>
          <button onClick={()=>d.category?setDetail(d.category):d.id==='forecast'?setForecastDetail(true):edit()}>{d.category?'Rivedi categoria':d.id==='income'?'Aggiorna entrate':'Rivedi piano'}</button></li>)}</ul>
          {view.decisions.length>2&&<button onClick={()=>setAllActions(!allActions)}>{allActions?'Mostra meno':`Altre decisioni (${view.decisions.length-2})`}</button>}</section>}
        <section className="plan-card"><div className="plan-section-heading"><h2>Categorie</h2><div><button aria-pressed={!reviewOnly} onClick={()=>setReviewOnly(false)}>Tutte</button><button aria-pressed={reviewOnly} onClick={()=>setReviewOnly(true)}>Da rivedere</button></div></div>
          {!rows.length&&<p>{reviewOnly?'Nessuna categoria da rivedere.':'Nessuna spesa o limite per questo mese. I limiti sono facoltativi.'}</p>}
          <ul className="plan-category-list">{rows.slice(0,all?undefined:5).map(c=><li key={c.id}><button onClick={()=>setDetail(c.id)}>
            <span className="plan-category-title"><span aria-hidden="true">{c.icon}</span><span>{c.label}{c.archived&&<small>Archiviata</small>}</span><strong className={c.remaining!==null&&c.remaining<0?'plan-negative':''}>{c.remaining===null?'Senza limite':`${money(c.remaining)} residui`}</strong></span>
            <small>Speso {money(c.spent)} · Programmato {money(c.scheduled)} · Limite {c.limit===null?'non impostato':money(c.limit)}</small>
            <span className={`plan-state ${c.state==='forecast-risk'?'plan-warning':''}`}>{states[c.state]}</span>
          </button></li>)}</ul>
          {rows.length>5&&<button onClick={()=>setAll(!all)}>{all?'Mostra meno':'Mostra tutte'}</button>}
          <button onClick={()=>edit('expenses')}>Modifica limiti</button>
        </section>
        <section className="plan-card"><h2>{view.period==='past'?'Scadenze del mese':'Prossime spese'}</h2>
          {view.upcoming.length?upcoming(view.upcoming.slice(0,allDue?undefined:3)):<p>Nessuna spesa ancora programmata in questo mese.</p>}
          <p className="plan-caption">Già incluse nelle categorie e nel margine: non si sommano una seconda volta.</p>
          {view.upcoming.length>3&&<button onClick={()=>setAllDue(!allDue)}>{allDue?'Mostra meno':'Vedi tutte'}</button>}
          {view.period!=='past'&&p.onAddScheduled&&<><button onClick={()=>p.onAddScheduled?.(nextDate)}>Aggiungi spesa programmata</button><p className="plan-caption">Apri una spesa con data futura: solo Salva registrerà un movimento, non una simulazione.</p></>}
          {isFeatureEnabled('commitments',p.user)&&<button onClick={()=>navigate('/commitments')}>Impegni · costo mensile equivalente</button>}
        </section>
        <section className="plan-card"><h2>{view.period==='past'?'Consuntivo':'Chiusura stimata'}</h2>
          {view.period==='past'?<p>Spese registrate {money(view.A)} · capacità del piano {money(view.P)}</p>:view.forecast?
            <><p>Spese stimate a fine mese <strong>{formatCurrency(view.forecast.total)}</strong></p><p>Confronto con la capacità del piano: {money(view.forecastGap)}</p><button onClick={()=>setForecastDetail(true)}>Dettaglio della stima</button></>:
            <p>{view.period==='future'?'Previsione non disponibile per i mesi futuri.':'Previsione ancora poco informativa: servono più mesi di spese registrate.'}</p>}
        </section>
        <section className="plan-card"><button aria-expanded={archive} onClick={()=>setArchive(!archive)}>Riepiloghi mensili · {recap.length}</button>
          {archive&&<div className="plan-lines">{recap.length?recap.map(r=><button key={r.ym} onClick={()=>navigate(`/recap/${r.ym}`)}>{r.label} <span>{formatCurrency(r.saved)}</span></button>):<p>Nessun riepilogo disponibile.</p>}</div>}
        </section>
        {isFeatureEnabled('ai_coach_chat',p.user)&&settings.aiEnabled&&settings.aiCoachWidgetEnabled&&<CoachEntryCard/>}
      </div>
    </div>
    {calculation&&<PlanDialog title="Come è calcolato" onClose={()=>setCalculation(false)}><PlanArithmetic view={view}/></PlanDialog>}
    {forecastDetail&&<PlanDialog title="Chiusura stimata" onClose={()=>setForecastDetail(false)}><p>Capacità di spesa del piano: {money(view.P)}</p><p>Registrato: {money(view.A)} · Programmato: {money(view.C)}</p><p>Stima finale V4: {view.forecast?formatCurrency(view.forecast.total):'Non disponibile'}. Comprende già registrato e programmato: non si aggiungono di nuovo.</p><p>Differenza dalla capacità: {money(view.forecastGap)}. Non è una previsione del saldo di cassa o del risparmio.</p></PlanDialog>}
    {category&&<PlanDialog title={category.label} onClose={()=>setDetail(null)}><p>{states[category.state]}{category.archived?' · Archiviata':''}</p><dl className="plan-arithmetic">
      {([['Limite',category.limit],['Speso',category.spent],['Programmato',category.scheduled],['Residuo',category.remaining]] as const).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v===null?'Senza limite':money(v)}</dd></div>)}
      {category.forecast!==null&&<div><dt>Stima finale V4</dt><dd>{money(category.forecast)}</dd></div>}</dl>
      <h3>Movimenti e scadenze</h3>{upcoming([...view.realized.filter(t=>t.type==='expense'),...view.upcoming].filter(t=>t.category===category.id))}
      <div className="plan-button-row"><button onClick={()=>{setDetail(null);edit('expenses',category.id);}}>Modifica limite</button>
        {!category.archived&&<button onClick={()=>{setDetail(null);setTransfer(category);}}>Sposta budget</button>}</div></PlanDialog>}
    {transfer&&<PlanTransfer view={view} target={transfer} onClose={()=>setTransfer(null)} onApply={(limits)=>{
      setEditor({section:'expenses',category:transfer.id,initialPlan:{...(plan??initMonthlyBudget({month})),categoryBudgets:limits}});setTransfer(null);
    }}/>}
    {editor&&<PlanEditor key={p.user.uid+month} uid={p.user.uid} month={month} plan={plan} previous={store.budgetHistory.find(b=>b.month===prevMonthKey(month))}
      categories={settings.categories} transactions={p.transactions} now={now} section={editor.section} focusCategory={editor.category} initialPlan={editor.initialPlan}
      onClose={()=>setEditor(null)} onSave={async(...args)=>{const next=await store.saveMonthlyBudget(...args);setSaved(true);return next;}}/>}
  </div>;
}
function PlanArithmetic({view:v}:{view:MonthlyPlanView}) {
  const items:[string,number|null][]=[['Entrate attese (E)',v.E],['− Risparmio (S)',v.S],['Obiettivo investimenti dai conti (It)',v.It],
    ['Investimenti effettuati (Ia)',v.Ia],['Investimenti programmati (Ic)',v.Ic],['− Riserva investimenti: max(It, Ia + Ic)',v.Ir],
    ['Capacità di spesa (P)',v.P],['− Spese registrate (A)',v.A],['− Spese programmate (C)',v.C],['Margine (M)',v.M],['Cuscinetto non allocato (U)',v.U]];
  return <><dl className="plan-arithmetic">{items.map(([k,n])=><div key={k}><dt>{k}</dt><dd>{money(n)}</dd></div>)}</dl><p>M = E − S − max(It, Ia + Ic) − A − C.</p><p>U = P − somma del maggiore tra limite e speso + programmato, per ogni categoria. Il cuscinetto esclude ciò che è già assegnato ai limiti; il margine no.</p></>;
}
function PlanTransfer({view,target,onClose,onApply}:{view:MonthlyPlanView;target:PlanCategory;onClose:()=>void;onApply:(v:Record<string,number>)=>void}) {
  const donors=view.categories.filter(c=>c.id!==target.id&&!c.archived&&(c.remaining??0)>0);
  const [from,setFrom]=useState(donors[0]?.id??''),[text,setText]=useState('');
  const amount=parsePlanAmount(text),donor=donors.find(c=>c.id===from);
  const limits=Object.fromEntries(view.categories.filter(c=>c.limit!==null).map(c=>[c.id,c.limit!/100]));
  const valid=amount!==null&&amount>0&&!!donor&&amount*100<=donor.remaining!;
  return <PlanDialog title="Sposta budget" onClose={onClose}><p>Sposta solo limiti: nessun denaro viene trasferito e il risparmio resta invariato.</p>
    <label>Da categoria<select value={from} onChange={e=>setFrom(e.target.value)}>{donors.map(c=><option key={c.id} value={c.id}>{c.label} · {money(c.remaining)} disponibili</option>)}</select></label>
    <p>A: {target.label}</p><label>Importo da spostare<input inputMode="decimal" value={text} onChange={e=>setText(e.target.value)}/></label>
    {!donors.length&&<p>Nessuna categoria ha margine dopo speso e programmato. Puoi modificare un limite manualmente per vedere il disavanzo risultante.</p>}
    {valid&&<p>Prima → dopo: {donor!.label} {money(donor!.limit)} → {money(donor!.limit!-amount!*100)}; {target.label} {money(target.limit??0)} → {money((target.limit??0)+amount!*100)}. Totale limiti invariato.</p>}
    <button disabled={!valid} onClick={()=>onApply(moveCategoryLimit(limits,from,target.id,amount!))}>Rivedi spostamento e salva</button></PlanDialog>;
}
