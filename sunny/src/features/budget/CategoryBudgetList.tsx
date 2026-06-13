import { CategoryDef } from '../../types';
import { formatCurrency } from '../../utils';
import { ProgressBar } from '../../shared/components';
import { CategoryStatus } from './budgetUtils';

type ListMode = 'expense' | 'income' | 'investment';

interface Props {
  categories: CategoryDef[];
  spend: Record<string, number>;
  budgets: Record<string, number>;
  onEditCategory: (catId: string) => void;
  title?: string;
  mode?: ListMode;
  /** Optional end-of-month projection per category (expense mode only). */
  projected?: Record<string, number>;
  /** "Programmato": committed-but-not-yet-spent this month, per category
   *  (future-dated + upcoming recurring). Occupies budget alongside `spend`. */
  scheduled?: Record<string, number>;
}

function statusFor(actual: number, planned: number, mode: ListMode): CategoryStatus {
  if (planned <= 0) return 'normal';
  const pct = actual / planned;
  if (mode === 'expense') {
    if (pct > 1) return 'over';
    if (pct >= 0.8) return 'warning';
    return 'normal';
  }
  // income / investment: higher = better
  if (pct >= 1) return 'normal';
  if (pct >= 0.5) return 'warning';
  return 'over';
}

function barColorFor(status: CategoryStatus, catColor: string, mode: ListMode): string {
  if (mode === 'expense') {
    if (status === 'over') return 'rgb(var(--c-red))';
    if (status === 'warning') return 'rgb(var(--c-gold))';
    return catColor;
  }
  if (status === 'normal') return 'rgb(var(--c-green))';
  return 'rgb(var(--c-gold))';
}

const EXPENSE_LABEL: Record<CategoryStatus, string> = {
  normal: '', warning: 'Vicino al limite', over: 'Sopra il previsto',
};
const INCOME_LABEL: Record<CategoryStatus, string> = {
  normal: 'Raggiunto ✓', warning: 'In corso', over: 'Sotto la previsione',
};

export function CategoryBudgetList({
  categories, spend, budgets, onEditCategory,
  title, mode = 'expense', projected, scheduled,
}: Props) {
  const defaultTitle =
    mode === 'income' ? 'Entrate previste' :
    mode === 'investment' ? 'Investimenti pianificati' :
    'Budget per categoria';

  const rows = categories
    .map(c => ({ cat: c, actual: spend[c.id] ?? 0, planned: budgets[c.id] ?? 0, sched: scheduled?.[c.id] ?? 0 }))
    .filter(r => r.planned > 0 || r.actual > 0 || r.sched > 0)
    .sort((a, b) => (b.actual + b.sched) - (a.actual + a.sched));

  if (rows.length === 0) return null;

  const statusLabel = mode === 'expense' ? EXPENSE_LABEL : INCOME_LABEL;
  const emptyLabel = mode === 'expense' ? 'Nessun budget impostato' : 'Nessuna previsione impostata';

  return (
    <div className="glass-card rounded-2xl p-5">
      <p className="label-caps text-secondary mb-4">{title ?? defaultTitle}</p>
      <ul className="space-y-4">
        {rows.map(({ cat, actual, planned, sched }) => {
          const status = statusFor(actual, planned, mode);
          const pct = planned > 0 ? Math.round((actual / planned) * 100) : 0;
          const color = barColorFor(status, cat.color, mode);
          // "Programmato": committed but not yet spent. It eats into the budget,
          // so flag when spent + scheduled together will exceed the limit.
          const committed = actual + sched;
          const schedOverBudget = mode === 'expense' && planned > 0 && committed > planned && actual <= planned;
          const proj = mode === 'expense' ? (projected?.[cat.id] ?? 0) : 0;
          const projOverBudget = planned > 0 && proj > planned;
          // Dual-label footer (expense only): "Programmato" (budget cap) vs
          // "Previsto" (V3 end-of-month forecast), same vocabulary as the totals.
          const showDual = mode === 'expense' && (planned > 0 || proj > 0);
          return (
            <li key={cat.id}>
              <button onClick={() => onEditCategory(cat.id)} className="w-full text-left">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="w-7 h-7 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                    style={{ backgroundColor: cat.color + '18' }}>{cat.icon}</span>
                  <span className="text-[13px] text-primary flex-1 truncate">{cat.label}</span>
                  <span className="text-[13px] font-semibold balance-num text-primary">
                    {formatCurrency(actual)}
                    {planned > 0 && <span className="text-secondary font-normal"> / {formatCurrency(planned)}</span>}
                  </span>
                </div>
                <ProgressBar value={actual} max={planned > 0 ? planned : committed} color={color} pending={sched} />
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-[11px] ${
                    mode === 'expense'
                      ? (status === 'over' ? 'text-red' : status === 'warning' ? 'text-gold' : 'text-secondary')
                      : (status === 'normal' ? 'text-green' : 'text-gold')
                  }`}>
                    {planned > 0 ? (statusLabel[status] || `${pct}% del previsto`) : emptyLabel}
                  </span>
                  {planned > 0 && (
                    <span className="text-[11px] text-secondary balance-num">{pct}%</span>
                  )}
                </div>
                {sched > 0 && (
                  <p className="text-[11px] mt-1 flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-[3px] flex-shrink-0"
                      style={{ backgroundColor: color, opacity: 0.4, backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 1.5px, transparent 1.5px 3.5px)' }} />
                    <span className="text-secondary">
                      <span className="balance-num">{formatCurrency(sched)}</span> programmati, non ancora spesi
                      {schedOverBudget && <span className="text-gold"> · oltre il budget</span>}
                    </span>
                  </p>
                )}
                {showDual && (
                  <div className="flex items-center gap-x-4 gap-y-0.5 flex-wrap mt-1.5 text-[11px]">
                    {planned > 0 && (
                      <span className="text-secondary">
                        Programmato <span className="balance-num text-primary/80">{formatCurrency(planned)}</span>
                      </span>
                    )}
                    {proj > 0 && (
                      <span className="text-secondary">
                        Previsto <span className="balance-num text-gold/90">{formatCurrency(proj)}</span>
                        {projOverBudget && <span className="text-gold"> · sopra il budget</span>}
                      </span>
                    )}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
