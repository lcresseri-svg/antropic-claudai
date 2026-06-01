import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights, Insight } from './insightsEngine';

interface Props {
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  limit?: number;
  onSeeAll?: () => void;
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
        {insights.map((ins, i) => <InsightCard key={i} ins={ins} />)}
      </div>
    </section>
  );
}

export function InsightCard({ ins }: { ins: Insight }) {
  return (
    <div className={`glass-card rounded-2xl p-4 flex items-start gap-3.5 ${ins.urgent ? 'ring-1 ring-[#E08B8B]/30' : ''}`}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: ins.accent + '18' }}>
        {ins.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-primary leading-snug">{ins.title}</p>
        <p className="text-xs mt-0.5 leading-snug" style={{ color: ins.accent + 'cc' }}>{ins.detail}</p>
      </div>
      {ins.urgent && <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: '#E08B8B' }} />}
    </div>
  );
}
