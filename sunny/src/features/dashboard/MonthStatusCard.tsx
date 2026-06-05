import { formatCurrency } from '../../utils';
import { MonthForecast } from '../budget/budgetUtils';

interface Props {
  forecast: MonthForecast;
  savingsTarget: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

export function MonthStatusCard({ forecast, savingsTarget, monthlyIncome, monthlyExpenses }: Props) {
  const remaining = monthlyIncome - monthlyExpenses;
  const savingsForecast = forecast.savings;
  const hasTarget = savingsTarget > 0;
  const gap = hasTarget ? savingsTarget - savingsForecast : 0;
  const onTrack = !hasTarget || gap <= 0;

  const statusColor = onTrack ? 'text-gold' : gap < savingsTarget * 0.3 ? 'text-gold' : 'text-secondary';

  let message = '';
  if (hasTarget) {
    if (gap <= 0) {
      message = `Sei in linea con il tuo obiettivo di ${formatCurrency(savingsTarget)}.`;
    } else {
      message = `Ti mancano circa ${formatCurrency(gap)} per raggiungere l'obiettivo di ${formatCurrency(savingsTarget)}.`;
    }
  }

  return (
    <div className="glass-card rounded-2xl px-5 py-5">
      <p className="label-caps text-secondary mb-3">Questo mese</p>

      <div className="flex items-end gap-2 mb-1">
        <p className={`text-[38px] leading-none font-bold tracking-[-0.03em] balance-num ${statusColor}`}>
          {formatCurrency(savingsForecast)}
        </p>
        <p className="text-[13px] text-secondary mb-1">risparmio previsto</p>
      </div>

      {message && (
        <p className="text-[13px] text-secondary/80 mt-2 leading-snug">{message}</p>
      )}

      <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/[0.05]">
        <MiniStat label="Entrate" value={formatCurrency(monthlyIncome)} color="text-green" />
        <MiniStat label="Uscite"  value={formatCurrency(monthlyExpenses)} color="text-secondary" />
        <MiniStat label="Rimanente" value={formatCurrency(remaining)} color={remaining >= 0 ? 'text-primary' : 'text-red'} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="label-caps text-secondary mb-1">{label}</p>
      <p className={`text-[13px] font-semibold balance-num truncate ${color}`}>{value}</p>
    </div>
  );
}
