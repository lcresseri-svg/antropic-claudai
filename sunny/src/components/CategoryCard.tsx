import { Donut } from './Donut';
import { formatCurrency } from '../utils';
import { useSettings } from '../settings';

interface Props {
  categoryTotals: Record<string, number>;
}

export function CategoryCard({ categoryTotals }: Props) {
  const { getCat } = useSettings();
  const entries = Object.entries(categoryTotals).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  const segments = entries.map(([id, value]) => {
    const c = getCat(id);
    return { label: c.label, value, color: c.color, icon: c.icon };
  });

  return (
    <div className="bg-card rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-primary mb-4">Spese per categoria</h3>
      <div className="flex items-center gap-5">
        <Donut segments={segments} centerLabel="Spese" size={132} />
        <ul className="flex-1 space-y-2.5 min-w-0">
          {segments.slice(0, 5).map(s => (
            <li key={s.label} className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="text-[13px] text-secondary truncate flex-1">{s.label}</span>
              <span className="text-[13px] font-medium text-primary balance-num">{formatCurrency(s.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
