import { CategoryDef } from '../../types';
import { formatCurrency, formatDateFull } from '../../utils';
import { isHistoryDate } from '../investments/portfolioHistory';

export interface PortfolioValuationProps {
  positions: { cat: CategoryDef; controvalore: number | null }[];
  total: number;
  deposited: number;
  difference: number;
  differencePct: number;
}

/** Qualifies the existing mixed total; it never replaces or reconstructs values. */
export function PortfolioValuationSummary({ positions, total, deposited, difference, differencePct }: PortfolioValuationProps) {
  const known = positions.filter(p => p.controvalore !== null);
  const missing = positions.length - known.length;
  const complete = positions.length > 0 && missing === 0;
  const dates = known.map(p => p.cat.lastValueUpdate).filter(isHistoryDate).sort();
  const label = !known.length ? 'Capitale versato' : complete ? 'Controvalore totale' : 'Valore con dati parziali';
  return <div className="ui31-portfolio-value">
    <p className="label-caps text-secondary mb-2">{label}</p>
    <p className="ui31-analysis-value text-[38px] leading-none font-bold balance-num text-primary">{formatCurrency(total)}</p>
    {missing > 0 && <p className="text-sm text-secondary mt-3">
      {missing} {missing === 1 ? 'posizione senza controvalore' : 'posizioni senza controvalore'}: il totale usa il capitale versato dove manca il valore di mercato.
    </p>}
    {known.length > 0 && <p className="text-sm text-secondary mt-3">Ultimo controvalore noto · {dates.length > 0
      ? dates[0] === dates[dates.length - 1] ? `aggiornato al ${formatDateFull(dates[0])}.` : `aggiornamenti dal ${formatDateFull(dates[0])} al ${formatDateFull(dates[dates.length - 1])}.`
      : 'Data di aggiornamento non disponibile.'}
      {dates.length > 0 && dates.length < known.length && ' Data di aggiornamento non disponibile per tutte le posizioni.'}
    </p>}
    <div className="ui31-portfolio-metrics mt-4 pt-4 border-t border-divider">
      <div><p className="text-[12px] text-secondary">Capitale versato</p><p className="balance-num font-semibold text-primary">{formatCurrency(deposited)}</p></div>
      {complete && deposited > 0 && <div><p className="text-[12px] text-secondary">Differenza dal versato</p><p className={`balance-num font-semibold ${difference >= 0 ? 'text-green' : 'text-red'}`}>
        {formatCurrency(difference, { sign: true })} · {differencePct >= 0 ? '+' : '−'}{Math.abs(differencePct).toFixed(1)}%
      </p></div>}
    </div>
  </div>;
}
