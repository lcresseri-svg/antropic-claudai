import { formatCurrency } from '../../utils';

/** Presentation only: callers own the amount, period and financial perimeter. */
export function DataHeadline({label,value,period,onOpen}:{label:string;value:number;period:string;onOpen?:()=>void}) {
  const amount=<span className="liquid-headline-value balance-num">{formatCurrency(value)}</span>;
  return <div className="liquid-data-headline">
    <p className="liquid-eyebrow">{label}</p>
    {onOpen?<button type="button" onClick={onOpen} aria-label={`${label}: ${formatCurrency(value)}. Apri dettaglio`} className="liquid-headline-link">{amount}<span aria-hidden="true">›</span></button>:amount}
    <p className="liquid-period">{period}</p>
  </div>;
}
