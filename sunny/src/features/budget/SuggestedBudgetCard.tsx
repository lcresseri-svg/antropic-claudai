import { CategoryDef } from '../../types';
import { formatCurrency } from '../../utils';

interface Props {
  categories: CategoryDef[];
  suggested: Record<string, number>;
  onAccept: () => void;
  onEdit: () => void;
}

export function SuggestedBudgetCard({ categories, suggested, onAccept, onEdit }: Props) {
  const rows = categories
    .map(c => ({ cat: c, value: suggested[c.id] ?? 0 }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-gold text-sm">✦</span>
        <p className="text-sm font-semibold text-primary">Budget suggerito da Sunny</p>
      </div>
      <p className="text-[13px] text-secondary leading-relaxed">
        Ho analizzato le tue spese e preparato un piano realistico per aiutarti a raggiungere il tuo obiettivo.
      </p>

      <ul className="mt-4 space-y-2.5">
        {rows.map(({ cat, value }) => (
          <li key={cat.id} className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0"
              style={{ backgroundColor: cat.color + '18' }}>{cat.icon}</span>
            <span className="text-[13px] text-secondary flex-1 truncate">{cat.label}</span>
            <span className="text-[13px] font-medium balance-num text-primary">{formatCurrency(value)}</span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2.5 mt-5">
        <button onClick={onAccept}
          className="flex-1 py-2.5 rounded-xl glass-cta-gold text-sm font-semibold">
          Accetta suggerimento
        </button>
        <button onClick={onEdit}
          className="px-4 py-2.5 rounded-xl bg-elevated text-secondary text-sm font-medium">
          Modifica
        </button>
      </div>
    </div>
  );
}
