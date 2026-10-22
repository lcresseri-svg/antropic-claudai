import type { AvailableCashResult } from './availableCash';
import { formatCurrency } from '../../utils';

/** The existing cash model, kept separate from the monthly plan's margin. */
export function AvailableCashSummary({ cash }: { cash: AvailableCashResult }) {
  const horizon = cash.horizonEndISO.split('-').reverse().join('/');
  const positive = cash.liquidity > 0 && cash.available >= 0;
  return <section className="ui31-cash-summary" aria-labelledby="ui31-cash-title">
    <div className="ui-card-heading"><h2 id="ui31-cash-title">Liquidità libera stimata</h2><span>Fino al {horizon}</span></div>
    <strong className="ui31-cash-value">{formatCurrency(cash.available)}</strong>
    <p>Saldo dei conti inclusi, meno uscite programmate e riserva di sicurezza. È distinta dal margine del piano.</p>
    {positive && <figure><div className="ui31-cash-track" aria-hidden="true">
      <span style={{ flex: cash.available, background: 'var(--ui31-chart-blue)' }}/>
      <span style={{ flex: cash.committed, background: 'var(--ui31-chart-gold)' }}/>
      <span style={{ flex: cash.reserve, background: 'var(--ui31-chart-purple)' }}/>
    </div><figcaption className="ui31-cash-legend"><span><i style={{background:'var(--ui31-chart-blue)'}}/>Libera</span><span><i style={{background:'var(--ui31-chart-gold)'}}/>Programmate</span><span><i style={{background:'var(--ui31-chart-purple)'}}/>Riserva</span></figcaption></figure>}
    {cash.available < 0 && <p className="ui31-cash-deficit">Uscite programmate e riserva superano il saldo di {formatCurrency(-cash.available)}.</p>}
    <details><summary>Come è calcolata</summary>
      <dl className="liquid-money-rows">
        <div><dt>Saldo dei conti inclusi</dt><dd>{formatCurrency(cash.liquidity)}</dd></div>
        <div><dt>Uscite programmate entro il {horizon}</dt><dd>−{formatCurrency(cash.committed)}</dd></div>
        <div><dt>Riserva di sicurezza</dt><dd>−{formatCurrency(cash.reserve)}</dd></div>
        <div><dt>Liquidità libera stimata</dt><dd>{formatCurrency(cash.available)}</dd></div>
      </dl>
      <p>Le entrate future non aumentano questa stima. La riserva è una somma che hai scelto di non usare, non un’uscita registrata.</p>
      {cash.committedItems.length > 0 && <ul className="ui31-cash-items">{cash.committedItems.map((item, index) => <li key={`${item.date}-${index}`}><span>{item.description || 'Uscita programmata'}<small>{item.date.split('-').reverse().join('/')}</small></span><strong>{formatCurrency(item.amount)}</strong></li>)}</ul>}
    </details>
  </section>;
}
