import { formatCurrency } from '../../utils';

interface Props {
  income: number;
  expense: number;
  invest: number;
}

const ITEMS = [
  { key: 'income'  as const, label: 'Entrate',   color: 'var(--accent-green)' },
  { key: 'expense' as const, label: 'Uscite',    color: '#E08B8B' },
  { key: 'invest'  as const, label: 'Investito', color: 'var(--accent-gold)' },
];

/**
 * Compact comparison of income vs expenses vs investments for the selected
 * period. Each row's bar is scaled to the largest of the three, so the
 * relative weight is immediately readable.
 */
export function FlowBar({ income, expense, invest }: Props) {
  const vals = { income, expense, invest };
  const max = Math.max(income, expense, invest, 1);
  if (income === 0 && expense === 0 && invest === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-5 space-y-3.5">
      <p className="label-caps text-secondary">Entrate · Uscite · Investito</p>
      {ITEMS.map(it => (
        <div key={it.key}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="flex items-center gap-2 text-[13px] text-secondary">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: it.color }} />
              {it.label}
            </span>
            <span className="text-[13px] font-semibold balance-num text-primary">{formatCurrency(vals[it.key])}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--progress-track)' }}>
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(vals[it.key] / max) * 100}%`, backgroundColor: it.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
