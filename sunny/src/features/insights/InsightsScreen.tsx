import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights, Insight, InsightCategory } from './insightsEngine';
import { InsightCard } from './Insights';
import { InsightDetailSheet } from './InsightDetailSheet';
import { logEvent } from '../../shared/analytics/metrics';
import { formatCurrency } from '../../utils';

interface Props {
  user?: User | null;
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  portfolio?: { controvalore: number; versato: number };
}

const CAT_META: Record<InsightCategory, { label: string; icon: string }> = {
  alert:     { label: 'Priorità',      icon: '⚡' },
  forecast:  { label: 'Previsione',    icon: '🔮' },
  seasonal:  { label: 'Stagionalità',  icon: '🗓️' },
  trend:     { label: 'Tendenze',      icon: '📈' },
  habit:     { label: 'Abitudini',     icon: '🧠' },
  highlight: { label: 'Questo mese',   icon: '✦' },
};

const CAT_ORDER: InsightCategory[] = ['alert', 'forecast', 'seasonal', 'trend', 'habit', 'highlight'];

export function InsightsScreen(p: Props) {
  const { getCat, insightDepth, visibleCategories } = useSettings();
  const [detail, setDetail] = useState<Insight | null>(null);
  const uid = p.user?.uid;

  // metrics: insights_view on mount (fire-and-forget).
  useEffect(() => { if (uid) logEvent(uid, 'insights_view'); }, [uid]);

  const openDetail = (ins: Insight) => {
    setDetail(ins);
    if (uid) logEvent(uid, 'insight_open');
  };

  const insights = buildInsights({
    transactions: p.transactions,
    monthlyIncome: p.monthlyIncome,
    monthlyExpenses: p.monthlyExpenses,
    monthlyInvestments: p.monthlyInvestments,
    getCat,
    depth: insightDepth,
    forecastV3Categories: visibleCategories.filter(c => c.kind === 'expense'),
    portfolio: p.portfolio,
  });

  const grouped = new Map<InsightCategory, Insight[]>();
  for (const ins of insights) {
    const list = grouped.get(ins.category) ?? [];
    list.push(ins);
    grouped.set(ins.category, list);
  }

  const saved = p.monthlyIncome - p.monthlyExpenses - p.monthlyInvestments;

  return (
    <div className="pb-32">
      <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] mb-5">Insight</h1>

      {p.monthlyIncome > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-6">
          <SummaryPill label="Entrate" value={formatCurrency(p.monthlyIncome)} color="var(--accent-green)" />
          <SummaryPill label="Uscite"  value={formatCurrency(p.monthlyExpenses)} color="rgb(var(--c-secondary))" />
          <SummaryPill label={saved >= 0 ? 'Risparmiato' : 'Sforamento'} value={formatCurrency(Math.abs(saved))} color={saved >= 0 ? 'var(--accent)' : 'var(--accent-red)'} />
        </div>
      )}

      <div className="space-y-8">
        {CAT_ORDER.filter(cat => grouped.has(cat)).map(cat => {
          const meta  = CAT_META[cat];
          const items = grouped.get(cat)!;
          return (
            <section key={cat}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-sm">{meta.icon}</span>
                <p className="label-caps text-secondary">{meta.label}</p>
                <span className="text-[11px] text-secondary/50">· {items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.map((ins, i) => <InsightCard key={i} ins={ins} onInfo={openDetail} />)}
              </div>
            </section>
          );
        })}
      </div>

      <InsightDetailSheet insight={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card rounded-2xl px-3 py-3">
      <p className="label-caps text-secondary mb-1.5">{label}</p>
      <p className="text-xs font-semibold balance-num truncate" style={{ color }}>{value}</p>
    </div>
  );
}
