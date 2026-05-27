import { Category, CATEGORY_META } from '../types';
import { formatCurrency } from '../utils';

interface Props {
  monthlyIncome: number;
  monthlyExpenses: number;
  categoryTotals: Partial<Record<Category, number>>;
}

interface Insight {
  icon: string;
  text: string;
  tone: 'positive' | 'warning' | 'neutral';
}

function buildInsights(
  monthlyIncome: number,
  monthlyExpenses: number,
  categoryTotals: Partial<Record<Category, number>>,
): Insight[] {
  const insights: Insight[] = [];

  if (monthlyIncome > 0 && monthlyExpenses > 0) {
    const saved = monthlyIncome - monthlyExpenses;
    if (saved > 0) {
      const pct = Math.round((saved / monthlyIncome) * 100);
      insights.push({
        icon: '✨',
        text: `Hai risparmiato il ${pct}% delle entrate questo mese (${formatCurrency(saved)})`,
        tone: 'positive',
      });
    } else {
      insights.push({
        icon: '⚠️',
        text: `Le uscite superano le entrate di ${formatCurrency(Math.abs(saved))} questo mese`,
        tone: 'warning',
      });
    }
  }

  const expEntries = (Object.entries(categoryTotals) as [Category, number][])
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  if (expEntries.length > 0 && monthlyExpenses > 0) {
    const [topCat, topVal] = expEntries[0];
    const pct = Math.round((topVal / monthlyExpenses) * 100);
    insights.push({
      icon: CATEGORY_META[topCat].icon,
      text: `${CATEGORY_META[topCat].label} è la categoria principale: ${formatCurrency(topVal)} (${pct}% delle spese)`,
      tone: 'neutral',
    });
  }

  const dining = categoryTotals['ristoranti'] ?? 0;
  if (dining > 80) {
    insights.push({
      icon: '🍽️',
      text: `Hai speso ${formatCurrency(dining)} in ristoranti — potresti ridurre cucinando più a casa`,
      tone: 'neutral',
    });
  }

  const shopping = categoryTotals['shopping'] ?? 0;
  if (shopping > 100) {
    insights.push({
      icon: '🛍️',
      text: `Shopping a ${formatCurrency(shopping)} questo mese — sopra la media`,
      tone: 'neutral',
    });
  }

  if (insights.length === 0) {
    insights.push({
      icon: '📊',
      text: 'Aggiungi transazioni per ricevere insight personalizzati',
      tone: 'neutral',
    });
  }

  return insights.slice(0, 3);
}

const toneStyle: Record<Insight['tone'], string> = {
  positive: 'bg-sage/10 border-sage/20',
  warning: 'bg-gold/10 border-gold/30',
  neutral: 'bg-white border-black/5',
};

export function Insights({ monthlyIncome, monthlyExpenses, categoryTotals }: Props) {
  const insights = buildInsights(monthlyIncome, monthlyExpenses, categoryTotals);

  return (
    <div>
      <h3 className="text-xs font-semibold text-dark/40 uppercase tracking-widest mb-3">
        Insight del mese
      </h3>
      <div className="space-y-2">
        {insights.map((ins, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 rounded-xl border p-3.5 ${toneStyle[ins.tone]}`}
          >
            <span className="text-lg leading-none mt-0.5 flex-shrink-0">{ins.icon}</span>
            <p className="text-sm text-dark/70 leading-snug">{ins.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
