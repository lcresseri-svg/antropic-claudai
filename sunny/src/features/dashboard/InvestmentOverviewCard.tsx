import { formatCurrency } from '../../utils';
import { InvestmentTrendChart } from './InvestmentTrendChart';
import { InvestmentTrendPoint } from './investmentTrend';

interface Props {
  deposited: number;
  marketValue: number | null;
  estimated: boolean;
  points: InvestmentTrendPoint[];
  currentMonth: string;
}

export function InvestmentOverviewCard({ deposited, marketValue, estimated, points, currentMonth }: Props) {
  const gain = marketValue === null ? null : marketValue - deposited;
  const pct = gain !== null && deposited > 0 ? gain / deposited * 100 : null;
  return (
    <section className="hero-card rounded-[26px] shadow-elev-2 p-4 sm:p-[22px] animate-rise-in">
      <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr_1fr] gap-5">
        <div>
          <p className="label-caps text-secondary mb-2">{estimated ? 'Valore totale stimato' : 'Controvalore totale'}</p>
          <p className="text-[32px] sm:text-[36px] leading-none font-bold balance-num text-primary break-words">{marketValue === null ? '—' : formatCurrency(marketValue)}</p>
          <p className="text-[11px] text-secondary mt-2">{marketValue === null ? 'Inserisci il valore delle posizioni' : 'In base agli ultimi valori inseriti'}</p>
        </div>
        <div>
          <p className="label-caps text-secondary mb-2">Capitale versato netto</p>
          <p className="text-xl font-semibold balance-num text-primary">{formatCurrency(deposited)}</p>
          <p className="text-[11px] text-secondary mt-1">Capitale iniziale + versamenti − rimborsi</p>
        </div>
        <div>
          <p className="label-caps text-secondary mb-2">{estimated ? 'Differenza stimata' : 'Guadagno / perdita latente'}</p>
          <p className={`text-xl font-semibold balance-num ${gain === null ? 'text-secondary' : gain >= 0 ? 'text-green' : 'text-red'}`}>{gain === null ? '—' : formatCurrency(gain, { sign: true })}</p>
          <p className="text-[11px] text-secondary mt-1">{pct === null ? 'Confronto con il capitale netto' : `${pct >= 0 ? '+' : ''}${pct.toLocaleString('it-IT', { maximumFractionDigits: 1 })}% sul capitale netto · non annualizzato`}</p>
        </div>
      </div>
      {estimated && <p className="text-xs text-secondary mt-3">Per le posizioni senza controvalore viene usato il capitale versato: il totale e la differenza sono parzialmente stimati.</p>}
      <InvestmentTrendChart points={points} currentMonth={currentMonth} />
    </section>
  );
}
