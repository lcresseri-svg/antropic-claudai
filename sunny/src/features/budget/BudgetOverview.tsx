import { formatCurrency, currentMonthLabel, capitalize } from '../../utils';

interface Props {
  plannedIncome: number;
  plannedExpenses: number;
  plannedInvestments: number;
}

/** Top-of-page snapshot of the month's plan: in, out, invest and what's left. */
export function BudgetOverview({ plannedIncome, plannedExpenses, plannedInvestments }: Props) {
  const leftover = plannedIncome - plannedExpenses - plannedInvestments;
  const max = Math.max(plannedIncome, 1);
  const seg = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="label-caps text-secondary">Piano di {capitalize(currentMonthLabel())}</p>
      </div>

      {/* Stacked plan bar */}
      <div className="h-2.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--progress-track)' }}>
        <div style={{ width: seg(plannedExpenses), backgroundColor: '#E08B8B' }} />
        <div style={{ width: seg(plannedInvestments), backgroundColor: 'var(--accent-gold)' }} />
        <div style={{ width: seg(Math.max(0, leftover)), backgroundColor: 'var(--accent-green)' }} />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
        <Row color="var(--accent-green)" label="Entrate previste" value={plannedIncome} />
        <Row color="#E08B8B" label="Spese pianificate" value={plannedExpenses} />
        <Row color="var(--accent-gold)" label="Investimenti" value={plannedInvestments} />
        <Row color="var(--accent-green)" label="Resta da risparmiare" value={leftover} strong />
      </div>
    </div>
  );
}

function Row({ color, label, value, strong }: { color: string; label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        <p className="text-[11px] text-secondary truncate">{label}</p>
        <p className={`balance-num ${strong ? 'text-[15px] font-semibold' : 'text-[13px] font-medium'} ${value < 0 ? 'text-red' : 'text-primary'}`}>
          {formatCurrency(value)}
        </p>
      </div>
    </div>
  );
}
