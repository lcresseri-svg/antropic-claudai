import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MonthlyBudget } from '../budget/monthlyBudget';
import { MonthlyPlanView } from '../budget/monthlyPlanSelectors';
import { formatCurrency } from '../../utils';
const money=(n:number)=>formatCurrency(n/100);
export function TodayMonthSummary({ view, plan, enabled, loading, error, onRetry, fromCache=false }: {
  view:MonthlyPlanView;plan:MonthlyBudget|null;enabled:boolean;loading:boolean;error:string|null;onRetry:()=>void;fromCache?:boolean;
}) {
  const period=new Date(Number(view.month.slice(0,4)),Number(view.month.slice(5))-1,1).toLocaleDateString('it-IT',{month:'long',year:'numeric'});
  const margin=enabled&&!!plan&&view.reviewed&&view.M!==null;
  const incomplete=enabled&&!!plan&&!view.reviewed;
  return <section className="ui31-month-summary" aria-labelledby="ui31-month-title">
    <div className="ui31-section-heading"><h2 id="ui31-month-title">Il tuo mese</h2><span className="ui31-period">{period}</span></div>
    {loading?<p role="status" aria-busy="true">Caricamento della sintesi…</p>:error?<div role="alert"><p>La sintesi non è disponibile. Nessun margine viene presunto su dati incompleti.</p><button onClick={onRetry}>Riprova</button></div>:<>
      <p className="ui31-metric-label">{margin?(plan?.status==='confirmed'?'Margine del piano':'Margine della bozza'):'Uscite registrate del mese'}</p>
      <strong className={`ui31-month-number ${margin&&view.M!<0?'ui31-negative':''}`}>{money(margin?view.M!:view.A)}</strong>
      <p className="ui31-summary-status">{margin?(plan?.status==='confirmed'?'Confermato':'Da confermare'):incomplete?'Piano da completare':enabled?'Piano facoltativo · non impostato':'Piano disattivato · puoi continuare senza'}</p>
      <p>{margin?'Dopo obiettivi, spese registrate e programmate. Non è il saldo dei conti.':incomplete?'Completa le entrate attese e rivedi gli obiettivi. Il dato qui sopra comprende solo le spese registrate.':'Le spese effettive del mese, senza presupporre quanto puoi ancora spendere.'}</p>
      {margin&&view.pendingIncome>0&&<p className="ui31-income-notice">Ancora da incassare: <strong>{money(view.pendingIncome)}</strong>. Il margine dipende dall’arrivo di queste entrate.</p>}
      {margin&&view.M!<0&&<p className="ui31-negative">Il piano supera le risorse di {money(-view.M!)}. Rivedi entrate e obiettivi.</p>}
      {fromCache&&<p className="ui31-cache-note" role="status">Dati dalla cache: potrebbero non essere aggiornati.</p>}
      <Link className="ui31-primary-link" to={`/budget?view=${margin||incomplete?'plan':'overview'}&month=${view.month}`}>{margin?(view.M!<0?'Rivedi piano':plan?.status==='confirmed'?'Apri il mese':'Rivedi e conferma'):incomplete?'Completa le entrate e gli obiettivi':'Esplora il mese'} <span aria-hidden="true">›</span></Link>
    </>}
  </section>;
}
export function TodayPriorities({first,additional,additionalCount=0}:{first:ReactNode;additional?:ReactNode;additionalCount?:number}) {
  if(!first)return null;
  return <section className="ui31-today-priorities" aria-label="Da completare"><h2>Da completare</h2>{first}
    {additionalCount>0&&<details><summary>Altri {additionalCount} elementi da rivedere <span>Pagamenti, analisi e scadenze</span></summary>{additional}</details>}
  </section>;
}
