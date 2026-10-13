import { useUiVersion } from '../providers/UiVersionProvider';
/** Exact source samples, accessible with touch and keyboard, never a resampled
 * or reconstructed financial series. Only part of the opt-in UI3 experience. */
export function ChartData({title,columns,rows,scale,unit="euro"}:{title:string;columns:string[];rows:(string|number)[][];scale?:string;unit?:string}) {
  const ui3=useUiVersion()==='3.0';
  if(!ui3)return null;
  return <details className="liquid-chart-data"><summary>Vedi dati · {title}</summary>
    {scale&&<p>{scale}</p>}
    <div tabIndex={0} role="region" aria-label={`Dati ${title}`}><table><caption>{title} · valori in {unit}</caption>
      <thead><tr>{columns.map(c=><th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>{rows.map((row,i)=><tr key={i}>{row.map((v,j)=>j===0?<th scope="row" key={j}>{v}</th>:<td key={j}>{v}</td>)}</tr>)}</tbody>
    </table></div>
  </details>;
}
