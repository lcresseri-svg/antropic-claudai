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
  limit?: number;
  onSeeAll?: () => void;
}

export function Insights({ transactions, monthlyIncome, monthlyExpenses, monthlyInvestments, limit = 5, onSeeAll }: Props) {
  const { getCat } = useSettings();
  const [detail, setDetail] = useState<Insight | null>(null);

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
        {insights.map((ins, i) => <InsightCard key={i} ins={ins} onInfo={setDetail} />)}
      </div>
      <InsightDetailSheet insight={detail} onClose={() => setDetail(null)} />
    </section>
  );
}

export function InsightCard({ ins, onInfo }: { ins: Insight; onInfo?: (ins: Insight) => void }) {
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
      {onInfo && ins.explain && (
        <button onClick={() => onInfo(ins)} aria-label="Spiegazione"
          className="w-6 h-6 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-card-hover transition-colors flex-shrink-0 mt-0.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="12" cy="12" r="9" /><path d="M12 11v5" strokeLinecap="round" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
      )}
    </div>
  );
}
