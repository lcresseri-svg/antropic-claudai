import { useEffect, useState } from 'react';
import { CategoryDef, Transaction, ownShare } from '../../types';
import { MonthlyBudget, initMonthlyBudget, prevMonthKey } from './monthlyBudget';
import { revisionOf } from './monthlyBudgetStore';
import { createPlanDraft, draftKey, inputAmount, parsePlanAmount, resolvePlanDraft, applyLimitTransferToDraft, planDifferences, type PlanDraft } from './planDraft';
import { selectMonthlyPlan, planTransactions, cents } from './monthlyPlanSelectors';
import { PlanDialog } from './PlanDialog';
import { formatCurrency } from '../../utils';
export type PlanEditorSection='income'|'goals'|'expenses';
interface Props {
  uid:string;month:string;plan:MonthlyBudget|null;previous?:MonthlyBudget;categories:CategoryDef[];transactions:Transaction[];now:Date;
  section?:PlanEditorSection;focusCategory?:string;initialPlan?:MonthlyBudget;
  onSave:(month:string,draft:MonthlyBudget,expectedRevision:number|null)=>Promise<MonthlyBudget>;onClose:()=>void;
}
export function PlanEditor(p:Props) {
  const key=draftKey(p.uid,p.month);
  const initial=p.initialPlan??p.plan??initMonthlyBudget({month:p.month});
  const [loaded]=useState(()=>{
    try{const raw=localStorage.getItem(key);if(raw){
      const v=JSON.parse(raw);
      if(v.draft?.base?.month===p.month){
        if(p.initialPlan)try{return {...v,draft:applyLimitTransferToDraft(v.draft,p.plan?.categoryBudgets??{},p.initialPlan.categoryBudgets)};}
        catch(e){return {...v,message:(e as Error).message};}
        return v;
      }
    }}catch{/* corrupted/unavailable local cache */}
    return {draft:createPlanDraft(initial),revision:revisionOf(p.plan)};
  });
  const [draft,setDraft]=useState<PlanDraft>(loaded.draft);
  const [revision,setRevision]=useState<number|null>(loaded.revision);
  const [step,setStep]=useState(p.section==='goals'?1:p.section==='expenses'?2:0);
  const [dirty,setDirty]=useState(!!p.initialPlan||loaded.draft!==undefined&&JSON.stringify(loaded.draft)!==JSON.stringify(createPlanDraft(initial)));
  const [exit,setExit]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(loaded.message??'');
  const [deficitAccepted,setDeficitAccepted]=useState(false),[copy,setCopy]=useState(false);
  const [storageError,setStorageError]=useState(false);
  const historical=p.month<`${p.now.getFullYear()}-${String(p.now.getMonth()+1).padStart(2,'0')}`;
  const change=(d:PlanDraft)=>{setDraft(d);setDirty(true);setError('');setMessage('');setDeficitAccepted(false);};
  useEffect(()=>{
    if(!dirty)return;
    try{localStorage.setItem(key,JSON.stringify({draft,revision}));setStorageError(false);}catch{setStorageError(true);}
  },[key,draft,revision,dirty]);
  useEffect(()=>{
    const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};
    window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  let candidate:MonthlyBudget|null=null,validation='';
  try{candidate=resolvePlanDraft(draft,false,p.now.getTime());}catch(e){validation=(e as Error).message;}
  const view=selectMonthlyPlan({month:p.month,now:p.now,plan:candidate,transactions:p.transactions,categories:p.categories});
  const before=selectMonthlyPlan({month:p.month,now:p.now,plan:p.plan,transactions:p.transactions,categories:p.categories});
  const deficit=(view.M!==null&&view.M<0)||(view.U!==null&&view.U<0);
  const money=(n:number|null)=>n===null?'Da completare':formatCurrency(n/100);
  const updateMap=(field:'income'|'cash'|'limits',id:string,value:string)=>change({...draft,[field]:{...draft[field],[id]:value}});
  const remove=(field:'cash'|'limits',id:string)=>{const map={...draft[field]};delete map[id];change({...draft,[field]:map});};
  const close=()=>{if(busy)return;if(dirty)setExit(true);else p.onClose();};
  const save=async(confirm:boolean)=>{
    setError('');setMessage('');
    if(!candidate){
      if(confirm){setError(validation);return;}
      try{localStorage.setItem(key,JSON.stringify({draft,revision}));setMessage('Bozza locale conservata su questo dispositivo. Completa gli importi per salvarla sul server.');}
      catch{setError('Impossibile conservare la bozza sul dispositivo. Non chiudere questa finestra.');}
      return;
    }
    if((confirm||candidate.status==='confirmed')&&deficit&&!deficitAccepted){setError('Scegli esplicitamente se continuare con il piano in disavanzo.');return;}
    setBusy(true);
    try{
      await p.onSave(p.month,resolvePlanDraft(draft,confirm,p.now.getTime()),revision);
      try{localStorage.removeItem(key);}catch{/* save is already confirmed by server */}
      setDirty(false);p.onClose();
    }catch(e){setError((e as Error).message||'Salvataggio non riuscito. Bozza locale conservata, riprova con la rete disponibile.');}
    finally{setBusy(false);}
  };
  const incomeCats=p.categories.filter(c=>c.kind==='income'&&!c.archived);
  const incomeIds=[...new Set([...Object.keys(draft.income),...incomeCats.map(c=>c.id)])];
  if(!incomeIds.length)incomeIds.push('expected');
  const labels=(id:string)=>p.categories.find(c=>c.id===id)?.label??(id==='expected'?'Entrate attese':`Categoria ${id}`);
  const suggestions=selectMonthlyPlan({month:p.month,now:p.now,transactions:p.transactions,categories:p.categories});
  const recurringIncome=suggestions.scheduled.filter(t=>t.type==='income'&&(t.recurring||t.seriesId));
  const suggestIncome:Record<string,number>={};
  for(const t of recurringIncome)suggestIncome[t.category]=(suggestIncome[t.category]??0)+t.amount;
  const previousMonth=prevMonthKey(p.month);
  const pastIncome:Record<string,number>={};
  for(const t of p.transactions)if(t.type==='income'&&!t.recurring&&!t.projected&&t.date.startsWith(previousMonth))pastIncome[t.category]=(pastIncome[t.category]??0)+t.amount;
  const historicLimits:Record<string,number>={};
  for(const t of planTransactions(p.transactions,p.now))if(t.type==='expense'&&!t.recurring&&t.date.startsWith(previousMonth))
    historicLimits[t.category]=(historicLimits[t.category]??0)+cents(ownShare(t));
  const fields=(field:'cash'|'limits',kind:'investment'|'expense')=>{
    const existing=Object.keys(draft[field]);
    const ids=[...new Set([...existing,...p.categories.filter(c=>c.kind===kind&&!c.archived).map(c=>c.id)])];
    if(p.focusCategory&&ids.includes(p.focusCategory))ids.splice(0,0,...ids.splice(ids.indexOf(p.focusCategory),1));
    return ids.map(id=><div className="plan-field-row" key={id}>
      {id in draft[field]?<><label>{labels(id)}{p.categories.find(c=>c.id===id)?.archived?' · Archiviata':''}
        <input inputMode="decimal" aria-label={`${field==='limits'?'Limite':'Investimenti'} ${labels(id)}`} value={draft[field][id]} onChange={e=>updateMap(field,id,e.target.value)} /></label>
        <button onClick={()=>remove(field,id)}>{field==='limits'?'Rimuovi limite':'Rimuovi obiettivo'}</button></>
        :<><button onClick={()=>updateMap(field,id,'')}>+ {labels(id)} · {field==='limits'?'Imposta limite':'Obiettivo dai conti'}</button>
          {field==='limits'&&historicLimits[id]>0&&<button onClick={()=>updateMap(field,id,inputAmount(historicLimits[id]/100))}>Usa storico del mese precedente: {formatCurrency(historicLimits[id]/100)}</button>}</>}
    </div>);
  };
  return <PlanDialog title={historical?'Modifica piano storico':'Modifica piano'} onClose={close}>
    <div className="plan-editor"><fieldset disabled={busy} aria-busy={busy}>
      <nav aria-label="Passi del piano">{['Entrate','Obiettivi','Spese'].map((s,i)=><button key={s} aria-current={step===i?'step':undefined} onClick={()=>setStep(i)}>{i+1}. {s}</button>)}</nav>
      <div className="plan-draft-summary" aria-live="polite"><span>Anteprima · {p.month}</span><strong>Margine {money(view.M)}</strong><span>Cuscinetto {money(view.U)}</span>
        <small>Prima: margine {money(before.M)} · risparmio {money(before.S)} → {money(view.S)}</small></div>
      {!p.plan?.planningV3&&Object.keys(initial.investmentBudgets).length>0&&<p>Gli obiettivi di investimento precedenti ({formatCurrency(Object.values(initial.investmentBudgets).reduce((a,b)=>a+b,0))}) restano intatti. Rivedi la sola quota personale dai conti, senza TFR o contributi esterni.</p>}
      {step===0&&<section><h3>Quali entrate ti aspetti?</h3><p>Conferma gli importi, anche zero. Gli incassi non cambiano il piano automaticamente.</p>
        {incomeIds.map(id=><label key={id}>{labels(id)}<input inputMode="decimal" aria-label={`Entrate ${labels(id)}`} value={draft.income[id]??''}
          onChange={e=>updateMap('income',id,e.target.value)}/></label>)}
        {[['Ricorrenze ancora da incassare nel mese',suggestIncome],['Storico del mese precedente',pastIncome]] .map(([source,map])=>Object.keys(map).length>0&&<button key={String(source)} onClick={()=>change({...draft,income:Object.fromEntries(Object.entries(map).map(([k,v])=>[k,inputAmount(v as number)]))})}>
          Usa suggerimento · {String(source)}: {formatCurrency(Object.values(map).reduce((a:number,b)=>a+Number(b),0))}</button>)}
      </section>}
      {step===1&&<section><h3>Obiettivi, anche zero</h3><label>Risparmio da mantenere<input aria-label="Risparmio da mantenere" inputMode="decimal" value={draft.savings} onChange={e=>change({...draft,savings:e.target.value})}/></label>
        <p>Quota delle entrate da non destinare a spese o investimenti: è un obiettivo, non denaro già accantonato.</p>
        <h3>Investimenti dai conti</h3><p>Solo risorse personali. TFR e contributi esterni non consumano questo margine.</p>{fields('cash','investment')}
        <label className="plan-check"><input type="checkbox" checked={draft.cashReviewed} onChange={e=>change({...draft,cashReviewed:e.target.checked})}/>Ho verificato gli investimenti dai conti (anche zero).</label>
      </section>}
      {step===2&&<section><h3>Limiti facoltativi</h3><p>Spese già programmate: {money(suggestions.C)}. Puoi lasciare categorie senza limite; gli importi restano nel totale.</p>
        {suggestions.upcoming.slice(0,3).map(t=><p key={t.id}>{t.date} · {t.description} · {formatCurrency(t.amount)}</p>)}
        {fields('limits','expense')}
        {view.categories.filter(c=>c.remaining!==null&&c.remaining<0).map(c=><p className="plan-negative" key={c.id}>{c.label}: {money(-c.remaining!)} oltre il limite con speso e programmato.</p>)}
      </section>}
      {candidate&&<PlanChanges before={p.plan??initMonthlyBudget({month:p.month})} after={candidate} categories={p.categories}/>}
      {p.previous&&<button onClick={()=>setCopy(!copy)}>Copia dal mese precedente</button>}
      {copy&&p.previous&&<div className="plan-notice"><p>Prima → dopo: entrate {formatCurrency(Object.values(draft.income).reduce((s,v)=>s+(parsePlanAmount(v)??0),0))} → {formatCurrency(Object.values(p.previous.incomeBudgets).reduce((a,b)=>a+b,0))};
        risparmio {draft.savings||'da completare'} → {formatCurrency(p.previous.savingsTarget)}. Limiti e obiettivi saranno sostituiti nella bozza. Scadenze e una tantum non vengono copiate.</p>
        <PlanChanges before={candidate??initial} after={p.previous} categories={p.categories}/>
        <button onClick={()=>{change(createPlanDraft({...initMonthlyBudget({month:p.month,previous:p.previous}),status:'draft'}));setCopy(false);setStep(0);}}>Applica copia alla bozza</button></div>}
      {deficit&&<label className="plan-check plan-negative"><input type="checkbox" checked={deficitAccepted} onChange={e=>setDeficitAccepted(e.target.checked)}/>Continua con piano in disavanzo</label>}
      {error&&<p role="alert" className="plan-negative">{error}</p>}
      {revisionOf(p.plan)!==revision&&<div className="plan-notice"><p>Il piano sul server è cambiato. La bozza è conservata. Ricarica per confrontare, poi salva esplicitamente i tuoi valori.</p>
        <button onClick={()=>{setRevision(revisionOf(p.plan));setError('');setMessage('Piano aggiornato ricaricato. Confronta Prima e Anteprima: il prossimo salvataggio applicherà la tua bozza.');}}>Ricarica piano</button></div>}
      {storageError&&<p role="alert">Memoria locale non disponibile: lascia aperto l’editor per non perdere la bozza.</p>}
      {message&&<p role="status">{message}</p>}
      {exit?<div className="plan-notice"><p>Scartare le modifiche non salvate?</p><button onClick={()=>setExit(false)}>Continua a modificare</button><button onClick={()=>{try{localStorage.removeItem(key);}catch{}p.onClose();}}>Scarta</button></div>:
      <footer><button disabled={busy} onClick={close}>Annulla</button><button disabled={busy} onClick={()=>void save(false)}>{candidate?.status==='confirmed'?'Salva modifiche':'Salva bozza'}</button>
        {step<2?<button onClick={()=>setStep(step+1)}>Avanti</button>:!historical&&draft.base.status!=='confirmed'&&<button className="plan-primary" disabled={busy||!candidate} onClick={()=>void save(true)}>Conferma piano</button>}</footer>}
      {busy&&<p role="status">Salvataggio in corso… La bozza resta qui fino alla conferma del server.</p>}
    </fieldset></div>
  </PlanDialog>;
}
function PlanChanges({before,after,categories}:{before:MonthlyBudget;after:MonthlyBudget;categories:CategoryDef[]}) {
  const changes=planDifferences(before,after);
  if(!changes.length)return null;
  const labels:Record<string,string>={incomeBudgets:'Entrate',categoryBudgets:'Limite',cashInvestmentBudgets:'Investimenti dai conti',savingsTarget:'Risparmio'};
  return <details className="plan-changes"><summary>Confronto di tutti i valori modificati ({changes.length})</summary>
    <ul>{changes.map(c=><li key={c.field+c.id}>{labels[c.field]} {categories.find(cat=>cat.id===c.id)?.label??c.id}: {c.before===null?'Non impostato':formatCurrency(c.before)} → {c.after===null?'Non impostato':formatCurrency(c.after)}</li>)}</ul></details>;
}
