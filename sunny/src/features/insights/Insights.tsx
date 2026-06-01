import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights } from './insightsEngine';

interface Props {
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  limit?: number;          // max insights shown (default 5)
  onSeeAll?: () => void;   // when set, shows a "Vedi tutti" link in the header
}

export function Insights({ transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, limit = 5, onSeeAll }: Props) {
  const { getCat } = useSettings();

  const insights = buildInsights({
    transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, getCat,
  }).slice(0, limit);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="label-caps text-secondary">Insight</p>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs font-medium text-gold">Vedi tutti</button>
        )}
      </div>
      <div className="space-y-2.5">
        {insights.map((ins, i) => (
          <div key={i} className="glass-card rounded-2xl p-4 flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              {ins.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary leading-snug">{ins.title}</p>
              <p className="text-xs text-secondary mt-0.5 leading-snug">{ins.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
