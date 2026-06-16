import { formatCurrency } from '../../utils';
import { MonthForecast } from '../budget/budgetUtils';

type Status = 'on_track' | 'needs_attention' | 'difficult';

interface Props {
  forecast: MonthForecast;
  savingsTarget: number;
  topCategory?: { label: string; delta: number };
}

function getStatus(forecast: MonthForecast, savingsTarget: number): Status {
  if (savingsTarget <= 0) {
    return forecast.savings >= 0 ? 'on_track' : 'needs_attention';
  }
  const gap = savingsTarget - forecast.savings;
  if (gap <= 0) return 'on_track';
  if (gap < savingsTarget * 0.4) return 'needs_attention';
  return 'difficult';
}

// `color` is the hex used for the soft icon-chip tint (needs a hex for the +'18'
// alpha suffix). `text` is the theme token used for legible text/icon so it keeps
// AA contrast in both light and dark.
const STATUS_META: Record<Status, { icon: string; title: string; color: string; text: string }> = {
  on_track:        { icon: '✓', title: 'Sei in linea',    color: '#8A9270', text: 'var(--accent-green)' },
  needs_attention: { icon: '→', title: 'Puoi migliorare', color: '#E6B95C', text: 'var(--accent)' },
  difficult:       { icon: '!', title: 'Mese impegnativo', color: '#E08B8B', text: 'var(--accent-red)' },
};

export function FinancialStatusCard({ forecast, savingsTarget, topCategory }: Props) {
  const status = getStatus(forecast, savingsTarget);
  const meta = STATUS_META[status];
  const gap = savingsTarget > 0 ? savingsTarget - forecast.savings : 0;

  return (
    <div className="glass-card rounded-2xl p-4 flex items-start gap-3.5">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
        style={{ backgroundColor: meta.color + '18', color: meta.text }}>
        {meta.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary">{meta.title}</p>
        <p className="text-xs text-secondary mt-0.5">
          {status === 'on_track' && savingsTarget > 0 && (
            <>Risparmio previsto: <span className="text-primary font-medium">{formatCurrency(forecast.savings)}</span> su {formatCurrency(savingsTarget)}</>
          )}
          {status === 'on_track' && savingsTarget <= 0 && (
            <>Risparmio previsto: <span className="text-primary font-medium">{formatCurrency(forecast.savings)}</span></>
          )}
          {status === 'needs_attention' && (
            <>Mancano ancora <span className="font-medium" style={{ color: meta.text }}>{formatCurrency(gap)}</span> per raggiungere l'obiettivo</>
          )}
          {status === 'difficult' && topCategory ? (
            <>{topCategory.label} supera la media di <span className="font-medium" style={{ color: meta.text }}>{formatCurrency(topCategory.delta)}</span></>
          ) : status === 'difficult' && (
            <>Le uscite previste superano l'obiettivo di <span className="font-medium" style={{ color: meta.text }}>{formatCurrency(gap)}</span></>
          )}
        </p>
      </div>
    </div>
  );
}
