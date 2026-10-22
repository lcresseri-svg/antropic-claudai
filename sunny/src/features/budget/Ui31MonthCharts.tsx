import './ui31-month-charts.css';
import { FlowBreakdown } from '../../shared/financialFlow';
import { formatCurrency } from '../../utils';
const money=(n:number)=>formatCurrency(n/100);
/** The bar is a composition of expenses, never a presumed spending capacity. */
export function Ui31SpendingComposition({registered,scheduled}:{registered:number;scheduled:number}) {
  const total=registered+scheduled;
  return <figure className="ui31-spending-composition"><figcaption>Uscite del mese</figcaption>
    {total>0&&<div className="ui31-composition-track" aria-hidden="true"><span style={{width:`${registered/total*100}%`}}/><span style={{width:`${scheduled/total*100}%`}}/></div>}
    <dl><div><dt><i className="ui31-dot ui31-dot-gold"/>Registrate</dt><dd>{money(registered)}</dd></div><div><dt><i className="ui31-dot ui31-dot-blue"/>Programmate</dt><dd>{money(scheduled)}</dd></div></dl>
  </figure>;
}
export function Ui31FlowChart({flow}:{flow:FlowBreakdown}) {
  const rows=[{label:'Entrate ordinarie',value:flow.ordinaryIncome,color:'green'},{label:'Spese dai conti (lordo storni)',value:flow.expenses,color:'gold'},
    {label:'Investimenti dai conti',value:flow.investedFromAccounts,color:'purple'}, {label:'Storni ricevuti',value:flow.refundsReceived,color:'blue'},
    {label:'Capitale disinvestito',value:flow.capitalReturned,color:'blue'}];
  const max=Math.max(...rows.map(r=>r.value),1);
  return <figure className="ui31-flow-chart"><figcaption>Flussi registrati</figcaption><p>I movimenti effettivi dei conti, distinti per natura. Le spese sono al lordo degli storni ricevuti.</p><dl>{rows.map(r=><div key={r.label} className={`ui31-flow-${r.color}`}><dt>{r.label}</dt><dd>{formatCurrency(r.value)}</dd><span className="ui31-flow-track" aria-hidden="true"><span style={{width:`${Math.max(0,r.value)/max*100}%`}}/></span></div>)}</dl>
    <div className="ui31-flow-net"><span>Variazione della liquidità</span><strong>{formatCurrency(flow.netFlow)}</strong></div>
    {(flow.externalContributions>0||flow.tfrExcluded>0)&&<p>Fuori dai flussi dei conti: apporti esterni {formatCurrency(flow.externalContributions)} · TFR {formatCurrency(flow.tfrExcluded)}.</p>}
  </figure>;
}
