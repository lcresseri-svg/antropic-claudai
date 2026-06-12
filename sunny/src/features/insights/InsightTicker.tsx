import { useState } from 'react';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights, Insight } from './insightsEngine';
import { InsightDetailSheet } from './InsightDetailSheet';

interface Props {
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  prebuilt?: Insight[];
  limit?: number;
  onSeeAll?: () => void;
}

export function InsightTicker({ transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, prebuilt, limit = 8, onSeeAll }: Props) {
  const { getCat, insightDepth, categories } = useSettings();
  const [detail, setDetail] = useState<Insight | null>(null);

  const insights = (prebuilt ?? buildInsights({
    transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, getCat, depth: insightDepth,
    forecastV3Categories: categories.filter(c => c.kind === 'expense'),
  })).slice(0, limit);

  if (insights.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="label-caps text-secondary">Insight</p>
        {onSeeAll && <button onClick={onSeeAll} className="text-xs font-medium text-gold">Vedi tutti</button>}
      </div>

      <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-5 px-5 scroll-pl-5 snap-x snap-mandatory xl:grid xl:grid-cols-3 xl:overflow-visible xl:mx-0 xl:px-0">
        {insights.map((ins, i) => (
          <button key={i} onClick={() => setDetail(ins)}
            className={`snap-start shrink-0 w-[230px] xl:w-auto text-left glass-card rounded-2xl p-4 flex flex-col gap-2.5 active:scale-[0.98] transition-transform ${ins.urgent ? 'ring-1 ring-[#E08B8B]/30' : ''}`}>
            <div className="flex items-center justify-between">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
                style={{ backgroundColor: ins.accent + '20' }}>{ins.icon}</span>
              {ins.explain && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-secondary">
                  <circle cx="12" cy="12" r="9" /><path d="M12 11v5" strokeLinecap="round" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-[13px] font-medium text-primary leading-snug line-clamp-2">{ins.title}</p>
              <p className="text-[11px] mt-1 leading-snug line-clamp-2" style={{ color: ins.accent + 'cc' }}>{ins.detail}</p>
            </div>
          </button>
        ))}
      </div>

      <InsightDetailSheet insight={detail} onClose={() => setDetail(null)} />
    </section>
  );
}
