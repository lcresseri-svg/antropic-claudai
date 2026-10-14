import { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { Transaction, ownShare } from '../../types';
import { useBudget } from '../../shared/hooks/useBudget';
import { useSettings } from '../../shared/providers/settings';
import { useUiSessionState, useUiVersion } from '../../shared/providers/UiVersionProvider';
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
  const ui3=useUiVersion()==='3.0';
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
  const [pickLimit,setPickLimit]=useState(false);
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
  if(store.error||p.error)return <div className="piano-page"><h1>Piano</h1><p role="alert">Dati non disponibili: {store.error||p.error}. Il margine non viene calcolato su dati incompleti.</p><button onClick={store.retry}>Riprova</button></div>;
  return <div className="piano-page ui-family-budget">
    <header className="plan-header"><div className="plan-title"><h1>Piano</h1><span className="plan-status">{status}</span></div><div className="plan-month-nav glass-card">
      <button aria-label="Mese precedente" disabled={month<=earliest} onClick={()=>setMonth(prevMonthKey(month))}>‹</button>
      <label><span className="sr-only">Mese del piano</span><select aria-label="Mese del piano" value={month} onChange={e=>setMonth(e.target.value)}>{months.map(m=><option value={m} key={m}>{monthLabel(m)}</option>)}</select></label>
      <button aria-label="Mese successivo" disabled={month>=latest} onClick={()=>setMonth(monthKeyOf(new Date(Number(month.slice(0,4)),Number(month.slice(5)),1)))}>›</button>
    </div><button className="plan-edit-button cta-gold-fill" onClick={()=>edit()}><span aria-hidden="true">✎</span>{view.period==='past'?'Modifica piano storico':'Modifica piano'}</button></header>
    {saved&&<p role="status">Piano salvato sul server.</p>}
    {store.fromCache&&<p className="plan-notice" role="status">Dati dalla cache: potrebbero non essere aggiornati. Le modifiche restano bozze locali fino al salvataggio online.</p>}
    <div className="plan-layout">
      <div className="plan-sidebar">
        <section className="plan-card plan-summary hero-card shadow-elev-2">
          <p className="plan-eyebrow label-caps text-secondary">{view.period==='past'?'Risultato del mese':view.period==='future'?'Quanto hai pianificato':plan?.status==='confirmed'?'Margine del mese':'Margine della bozza'}</p>
          {view.M===null?<><h2>{!p.transactions.length?'Creiamo il tuo primo piano':'Completa il piano'}</h2><p>Rivedi le entrate attese e gli obiettivi: nessuna disponibilità viene presunta.</p><button className="plan-primary cta-gold-fill" onClick={()=>edit()}>{view.period==='past'?'Rivedi piano storico':'Completa il piano'}</button></>:
            <><strong className={`plan-number balance-num ${view.M<0?'plan-negative':''}`}>{money(view.M)}</strong>
              <p className="plan-hero-description">{view.period==='past'?'Dopo le spese registrate e gli obiettivi del mese.':'Per le spese non programmate, dopo gli obiettivi.'}</p>
              {view.M<0&&<p className="plan-negative">Mancano {money(-view.M)} al tuo piano.</p>}
              {view.pendingIncome>0&&<p className="plan-notice">Entrate attese {view.period==='past'?'non incassate':'ancora da incassare'}: <strong>{money(view.pendingIncome)}</strong>. Il margine dipende dal loro arrivo.</p>}
              {ui3 && view.P!==null && view.P>0 && <div className="liquid-plan-capacity" role="img" aria-label={`Capacità per le spese ${money(view.P)}; speso ${money(view.A)}; programmato ${money(view.C)}; margine ${money(view.M)}`}>
                <span style={{width:`${Math.min(100,Math.max(0,view.A/view.P*100))}%`}}/>
                <span className="liquid-capacity-scheduled" style={{width:`${Math.min(Math.max(0,100-Math.max(0,view.A/view.P*100)),Math.max(0,view.C/view.P*100))}%`}}/>
              </div>}
              <div className="plan-hero-stats">
                <div><span className="label-caps">Per le spese</span><strong className="balance-num">{money(view.P)}</strong></div>
                <div><span className="label-caps">Speso</span><strong className="balance-num">{money(view.A)}</strong></div>
                <div><span className="label-caps">Programmato</span><strong className="balance-num">{money(view.C)}</strong></div>
              </div>
              <button className="plan-hero-detail" onClick={()=>setCalculation(true)}>Come è calcolato <span aria-hidden="true">›</span></button>
              <p className="plan-caption plan-cash-note">Non è il saldo di oggi. <button onClick={()=>navigate('/wealth')}>Consulta Patrimonio</button></p>
              {view.period!=='past'&&(view.M<0||plan?.status!=='confirmed')&&<button className="plan-primary cta-gold-fill" onClick={()=>edit()}>{plan?.status==='confirmed'?'Rivedi piano':'Rivedi e conferma'}</button>}
            </>}
        </section>
        <section className="plan-card glass-card shadow-elev-1"><h2>Il tuo piano</h2><div className="plan-lines plan-goals">
          <button className="row-tap" onClick={()=>edit('income')}><span className="plan-goal-icon plan-income-icon" aria-hidden="true">↙</span><span>Entrate attese</span><strong>{view.reviewed?money(view.E):'Da rivedere'}</strong><span className="plan-chevron" aria-hidden="true">›</span></button>
          <button className="row-tap" onClick={()=>edit('goals')}><span className="plan-goal-icon" aria-hidden="true">◎</span><span>Risparmio da mantenere</span><strong>{plan?money(view.S):'Da impostare'}</strong><span className="plan-chevron" aria-hidden="true">›</span></button>
          <button className="row-tap" onClick={()=>edit('goals')}><span className="plan-goal-icon" aria-hidden="true">↗</span><span>{settings.enableInvestments?'Investimenti dai conti':'Obiettivi già impostati · investimenti'}</span><strong>{view.reviewed?money(view.It):'Da rivedere'}</strong><span className="plan-chevron" aria-hidden="true">›</span></button>
        </div><div className="plan-cushion"><span>Cuscinetto non allocato</span><strong className={view.U!==null&&view.U<0?'plan-negative':'balance-num'}>{money(view.U)}</strong></div>
          <details className="plan-explainer"><summary>Come funzionano gli obiettivi</summary><p>Il risparmio è la quota delle entrate da non spendere o investire, non denaro già accantonato.</p><p>Investimenti riservati: {money(view.Ir)}, il maggiore tra obiettivo e investimenti effettuati/programmati. TFR e apporti esterni esclusi.</p><p>Il cuscinetto è ciò che non hai assegnato ai limiti, distinto dal margine ancora disponibile nelle categorie.</p></details>
        </section>
      </div>
      <div className="plan-main">
        {view.decisions.length>0&&<section className="plan-card glass-card shadow-elev-1"><h2>Decisioni del mese</h2><ul className="plan-actions">{view.decisions.slice(0,allActions?undefined:2).map(d=><li key={d.id}><p>{d.text}{d.amount!==undefined&&<> · <strong>{money(d.amount)}</strong></>}</p>
          <button onClick={()=>d.category?setDetail(d.category):d.id==='forecast'?setForecastDetail(true):edit()}>{d.category?'Rivedi categoria':d.id==='income'?'Aggiorna entrate':'Rivedi piano'}</button></li>)}</ul>
          {view.decisions.length>2&&<button onClick={()=>setAllActions(!allActions)}>{allActions?'Mostra meno':`Altre decisioni (${view.decisions.length-2})`}</button>}</section>}
        <section className="plan-card glass-card shadow-elev-1"><div className="plan-section-heading"><h2>Categorie</h2><div><button aria-pressed={!reviewOnly} onClick={()=>setReviewOnly(false)}>Tutte</button><button aria-pressed={reviewOnly} onClick={()=>setReviewOnly(true)}>Da rivedere</button></div></div>
          {view.period==='current'&&<p className="plan-caption">Il previsto è la spesa totale stimata a fine mese dal forecast: include già speso e programmato, non è un importo da aggiungere.</p>}
          {!rows.length&&<p>{reviewOnly?'Nessuna categoria da rivedere.':'Nessuna spesa o limite per questo mese. I limiti sono facoltativi.'}</p>}
          <ul className="plan-category-list">{rows.slice(0,all?undefined:5).map(c=><li key={c.id}><button onClick={()=>setDetail(c.id)}>
            <span className="plan-category-title"><span className="plan-category-icon" aria-hidden="true">{c.icon}</span><span>{c.label}{c.archived&&<small>Archiviata</small>}</span><strong className={c.remaining!==null&&c.remaining<0?'plan-negative':''}>{c.remaining===null?'Senza limite':<>{money(c.remaining)}<small>residui</small></>}</strong><span className="plan-chevron" aria-hidden="true">›</span></span>
            {c.limit!==null&&c.limit>0&&<span className={`plan-progress ${c.remaining!==null&&c.remaining<0?'is-over':''}`} aria-hidden="true"><span style={{width:`${Math.min(100,c.spent/c.limit*100)}%`}}/><span className="plan-progress-scheduled" style={{width:`${Math.min(Math.max(0,100-c.spent/c.limit*100),c.scheduled/c.limit*100)}%`}}/></span>}
            <small>Speso {money(c.spent)} · Programmato {money(c.scheduled)} · Limite {c.limit===null?'non impostato':money(c.limit)}</small>
            <CategoryForecast category={c} period={view.period}/>
            <span className={`plan-state plan-state-${c.state}`}>{states[c.state]}</span>
          </button>{ui3&&<button className="plan-category-edit" aria-label={`${c.limit===null?'Imposta':'Modifica'} limite ${c.label}`} onClick={()=>edit('expenses',c.id)}>{c.limit===null?'Imposta limite':'Modifica limite'}</button>}</li>)}</ul>
          {rows.length>5&&<button onClick={()=>setAll(!all)}>{all?'Mostra meno':'Mostra tutte'}</button>}
          <button onClick={()=>ui3?setPickLimit(true):edit('expenses')}>{ui3?'Imposta un limite':'Modifica limiti'}</button>
        </section>
        <section className="plan-card glass-card shadow-elev-1"><h2>{view.period==='past'?'Scadenze del mese':'Prossime spese'}</h2>
          {view.upcoming.length?upcoming(view.upcoming.slice(0,allDue?undefined:3)):<p>Nessuna spesa ancora programmata in questo mese.</p>}
          <p className="plan-caption">Già incluse nelle categorie e nel margine: non si sommano una seconda volta.</p>
          {view.upcoming.length>3&&<button onClick={()=>setAllDue(!allDue)}>{allDue?'Mostra meno':'Vedi tutte'}</button>}
          {view.period!=='past'&&p.onAddScheduled&&<><button onClick={()=>p.onAddScheduled?.(nextDate)}>Aggiungi spesa programmata</button><p className="plan-caption">Apri una spesa con data futura: solo Salva registrerà un movimento, non una simulazione.</p></>}
          {isFeatureEnabled('commitments',p.user)&&<button onClick={()=>navigate('/commitments')}>Impegni · costo mensile equivalente</button>}
        </section>
        <section className="plan-card glass-card shadow-elev-1"><h2>{view.period==='past'?'Consuntivo':'Chiusura stimata'}</h2>
          {view.period==='past'?<p>Spese registrate {money(view.A)} · capacità del piano {money(view.P)}</p>:view.forecast?
            <><p>Spese stimate a fine mese <strong>{formatCurrency(view.forecast.total)}</strong></p><p>Confronto con la capacità del piano: {money(view.forecastGap)}</p><button onClick={()=>setForecastDetail(true)}>Dettaglio della stima</button></>:
            <p>{view.period==='future'?'Previsione non disponibile per i mesi futuri.':'Previsione ancora poco informativa: servono più mesi di spese registrate.'}</p>}
        </section>
        <section className="plan-card glass-card shadow-elev-1"><button aria-expanded={archive} onClick={()=>setArchive(!archive)}>Riepiloghi mensili · {recap.length}</button>
          {archive&&<div className="plan-lines">{recap.length?recap.map(r=><button key={r.ym} onClick={()=>navigate(`/recap/${r.ym}`)}>{r.label} <span>{formatCurrency(r.saved)}</span></button>):<p>Nessun riepilogo disponibile.</p>}</div>}
        </section>
        {isFeatureEnabled('ai_coach_chat',p.user)&&settings.aiEnabled&&settings.aiCoachWidgetEnabled&&<CoachEntryCard/>}
      </div>
    </div>
    {calculation&&<PlanDialog title="Come è calcolato" onClose={()=>setCalculation(false)}><PlanArithmetic view={view}/></PlanDialog>}
    {forecastDetail&&<PlanDialog title="Chiusura stimata" onClose={()=>setForecastDetail(false)}><p>Capacità di spesa del piano: {money(view.P)}</p><p>Registrato: {money(view.A)} · Programmato: {money(view.C)}</p><p>Stima finale V4: {view.forecast?formatCurrency(view.forecast.total):'Non disponibile'}. Comprende già registrato e programmato: non si aggiungono di nuovo.</p><p>Differenza dalla capacità: {money(view.forecastGap)}. Non è una previsione del saldo di cassa o del risparmio.</p></PlanDialog>}
    {category&&<PlanDialog title={category.label} onClose={()=>setDetail(null)}><p>{states[category.state]}{category.archived?' · Archiviata':''}</p><dl className="plan-arithmetic">
      {([['Limite',category.limit],['Speso',category.spent],['Programmato',category.scheduled],['Residuo',category.remaining]] as const).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v===null?'Senza limite':money(v)}</dd></div>)}
      </dl><CategoryForecast category={category} period={view.period}/>
      {view.period==='current'&&category.forecast!==null&&<p className="plan-caption">Totale stimato dal forecast, già comprensivo di speso e programmato. Non modifica il limite o il margine disponibile.</p>}
      <h3>Movimenti e scadenze</h3>{upcoming([...view.realized.filter(t=>t.type==='expense'),...view.upcoming].filter(t=>t.category===category.id))}
      <div className="plan-button-row"><button onClick={()=>{setDetail(null);edit('expenses',category.id);}}>Modifica limite</button>
        {!category.archived&&<button onClick={()=>{setDetail(null);setTransfer(category);}}>Sposta budget</button>}</div></PlanDialog>}
    {transfer&&<PlanTransfer view={view} target={transfer} onClose={()=>setTransfer(null)} onApply={(limits)=>{
      setEditor({section:'expenses',category:transfer.id,initialPlan:{...(plan??initMonthlyBudget({month})),categoryBudgets:limits}});setTransfer(null);
    }}/>}
    {pickLimit&&<PlanDialog title="Scegli categoria" onClose={()=>setPickLimit(false)}><div className="plan-limit-picker">{settings.categories.filter(c=>c.kind==='expense'&&!c.archived).map(c=><button key={c.id} onClick={()=>{setPickLimit(false);edit('expenses',c.id);}}><span>{c.icon} {c.label}</span><span>{plan?.categoryBudgets[c.id]?'Modifica limite':'Imposta limite'} ›</span></button>)}</div></PlanDialog>}
    {editor&&<PlanEditor key={p.user.uid+month} uid={p.user.uid} month={month} plan={plan} previous={store.budgetHistory.find(b=>b.month===prevMonthKey(month))}
      categories={settings.categories} transactions={p.transactions} now={now} section={editor.section} focusCategory={editor.category} initialPlan={editor.initialPlan}
      onClose={()=>setEditor(null)} onSave={async(...args)=>{const next=await store.saveMonthlyBudget(...args);setSaved(true);return next;}}/>}
  </div>;
}
function CategoryForecast({category:c,period}:{category:PlanCategory;period:MonthlyPlanView['period']}) {
  if(period==='past')return null;
  if(c.forecast===null)return <span className="plan-category-forecast plan-caption">Stima non disponibile{period==='future'?' per questo mese':': storico insufficiente'}</span>;
  const over=c.limit===null?0:Math.max(0,c.forecast-c.limit);
  return <span className="plan-category-forecast"><span>Previsto a fine mese <strong>{money(c.forecast)}</strong></span>
    {over>0&&<span className="plan-forecast-over">{money(over)} oltre il limite</span>}</span>;
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
