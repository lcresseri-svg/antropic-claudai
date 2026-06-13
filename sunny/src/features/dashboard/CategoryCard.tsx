import { CategoryBubbles } from './CategoryBubbles';
import { formatCurrency } from '../../utils';
import { useSettings } from '../../shared/providers/settings';

interface Props {
  categoryTotals: Record<string, number>;
  onClick?: () => void;
  /** Drill into a single category (e.g. its transactions). Wired to the bubbles. */
  onSelectCategory?: (id: string) => void;
}

export function CategoryCard({ categoryTotals, onClick, onSelectCategory }: Props) {
  const { getCat } = useSettings();
  const entries = Object.entries(categoryTotals).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  const segments = entries.map(([id, value]) => {
    const c = getCat(id);
    return { id, label: c.label, value, color: c.color, icon: c.icon };
  });

  return (
    <div
      className={`glass-card rounded-2xl p-5 ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="label-caps text-secondary flex items-center gap-1.5">
          Spese per categoria
          {onClick && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-secondary">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          )}
        </p>
        <span className="text-[13px] font-semibold balance-num text-primary">{formatCurrency(total)}</span>
      </div>
      <CategoryBubbles segments={segments} count={5} onSelect={onSelectCategory} />
    </div>
  );
}

