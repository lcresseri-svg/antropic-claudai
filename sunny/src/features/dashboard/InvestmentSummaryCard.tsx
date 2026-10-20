import { useUiVersion } from '../../shared/providers/UiVersionProvider';
import { Donut } from './Donut';
import { formatCurrency } from '../../utils';
import { useSettings } from '../../shared/providers/settings';

interface Props {
  investmentByCategory: Record<string, number>;
  total: number;
  onClick?: () => void;
}

export function InvestmentSummaryCard({ investmentByCategory, total, onClick }: Props) {
  const { getCat } = useSettings();
  const ui3 = useUiVersion() === '3.0';
  const entries = Object.entries(investmentByCategory)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0 || total <= 0) return null;

  const segments = entries.map(([id, value]) => {
    const c = getCat(id);
    return { label: c.label, value, color: c.color, icon: c.icon };
  });

  return (
    <div className={`glass-card rounded-2xl p-5 ${onClick && !ui3 ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''}`}
      onClick={ui3 ? undefined : onClick} role={!ui3 && onClick ? 'button' : undefined}>
      <div className="ui-card-heading flex items-center justify-between mb-4">
        {ui3 && onClick ? <button type="button" onClick={onClick} aria-label="Apri investimenti" className="label-caps text-secondary flex items-center gap-1.5">Investimenti per categoria <span aria-hidden="true">›</span></button> : <p className="label-caps text-secondary flex items-center gap-1.5">
          Investimenti per categoria
          {onClick && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-secondary"><path d="m9 18 6-6-6-6"/></svg>}
        </p>}
        <span className="text-[13px] font-semibold balance-num text-gold">{formatCurrency(total)}</span>
      </div>
      {/* Niente colonna percentuali: su 390px si mangiava il nome della
          categoria ("A…"), e la proporzione la dice già l'arco della torta. */}
      <div className="liquid-donut-layout flex items-center gap-4">
        <Donut segments={segments} centerLabel={ui3 ? "Capitale" : "Investito"} size={118} />
        <ul className="flex-1 space-y-2.5 min-w-0">
          {segments.slice(0, 6).map(s => (
            <li key={s.label} className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[13px] text-secondary truncate flex-1">{s.label}</span>
              <span className="text-[13px] font-semibold text-primary balance-num flex-shrink-0">{formatCurrency(s.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
