import { formatCurrency } from '../../utils';
import { MonthForecast } from './budgetUtils';

interface Props {
  savingsTarget: number;
  forecast: MonthForecast;
  onEdit: () => void;
}

export function MonthGoalCard({ savingsTarget, forecast, onEdit }: Props) {
  const gap = savingsTarget - forecast.savings;
  const onTrack = gap <= 0;

  if (savingsTarget <= 0) {
    return (
      <div className="glass-card rounded-2xl px-5 py-4 flex items-center justify-between">
        <div>
          <p className="label-caps text-secondary mb-1">Obiettivo del mese</p>
          <p className="text-[13px] text-secondary">Nessun obiettivo impostato</p>
        </div>
        <button onClick={onEdit} className="text-[12px] font-semibold text-gold shrink-0 ml-4">
          Imposta
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl px-5 py-5">
      <div className="flex items-start justify-between mb-3">
        <p className="label-caps text-secondary">Obiettivo del mese</p>
        <button onClick={onEdit} className="text-[11px] font-medium text-gold shrink-0 ml-2">
          Modifica
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[11px] text-secondary mb-1">Obiettivo</p>
          <p className="text-[15px] font-semibold text-primary balance-num">{formatCurrency(savingsTarget)}</p>
        </div>
        <div>
          <p className="text-[11px] text-secondary mb-1">Previsione</p>
          <p className={`text-[15px] font-semibold balance-num ${onTrack ? 'text-gold' : 'text-secondary'}`}>
            {formatCurrency(forecast.savings)}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-secondary mb-1">{onTrack ? 'Margine' : 'Mancano'}</p>
          <p className={`text-[15px] font-semibold balance-num ${onTrack ? 'text-green' : 'text-red'}`}>
            {formatCurrency(Math.abs(gap))}
          </p>
        </div>
      </div>

      {!onTrack && (
        <button onClick={onEdit} className="mt-4 w-full py-2.5 rounded-xl bg-gold/8 text-gold text-[13px] font-semibold text-center">
          Come raggiungerlo?
        </button>
      )}
    </div>
  );
}
