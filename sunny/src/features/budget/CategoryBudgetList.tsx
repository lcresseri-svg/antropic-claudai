import { CategoryDef } from '../../types';
import { formatCurrency } from '../../utils';
import { ProgressBar } from '../../shared/components';
import { categoryStatus, CategoryStatus } from './budgetUtils';

interface Props {
  categories: CategoryDef[];
  spend: Record<string, number>;
  budgets: Record<string, number>;
  onEditCategory: (catId: string) => void;
}

const STATUS_LABEL: Record<CategoryStatus, string> = {
  normal: '',
  warning: 'Vicino al limite',
  over: 'Sopra il previsto',
};

function barColor(status: CategoryStatus, categoryColor: string): string {
  if (status === 'over') return 'rgb(var(--c-red))';
  if (status === 'warning') return 'rgb(var(--c-gold))';
  return categoryColor;
}

export function CategoryBudgetList({ categories, spend, budgets, onEditCategory }: Props) {
  // Show categories that have a budget set, or that have spending, ordered by spend desc.
  const rows = categories
    .map(c => ({ cat: c, spent: spend[c.id] ?? 0, budget: budgets[c.id] ?? 0 }))
    .filter(r => r.budget > 0 || r.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  if (rows.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-5">
      <p className="label-caps text-secondary mb-4">Budget per categoria</p>
      <ul className="space-y-4">
        {rows.map(({ cat, spent, budget }) => {
          const status = categoryStatus(spent, budget);
          const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
          return (
            <li key={cat.id}>
              <button onClick={() => onEditCategory(cat.id)} className="w-full text-left">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="w-7 h-7 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                    style={{ backgroundColor: cat.color + '18' }}>{cat.icon}</span>
                  <span className="text-[13px] text-primary flex-1 truncate">{cat.label}</span>
                  <span className="text-[13px] font-semibold balance-num text-primary">
                    {formatCurrency(spent)}
                    {budget > 0 && <span className="text-secondary font-normal"> / {formatCurrency(budget)}</span>}
                  </span>
                </div>
                <ProgressBar value={spent} max={budget > 0 ? budget : spent} color={barColor(status, cat.color)} />
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-[11px] ${status === 'over' ? 'text-red' : status === 'warning' ? 'text-gold' : 'text-secondary'}`}>
                    {budget > 0 ? (STATUS_LABEL[status] || `${pct}% utilizzato`) : 'Nessun budget impostato'}
                  </span>
                  {budget > 0 && status !== 'normal' && (
                    <span className="text-[11px] text-secondary balance-num">{pct}%</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
