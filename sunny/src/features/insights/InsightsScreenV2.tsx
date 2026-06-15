import { useState } from 'react';
import { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights, Insight, InsightCategory } from './insightsEngine';
import { InsightDetailSheet } from './InsightDetailSheet';
import { InsightFeedback } from '../feedback/InsightFeedback';
import { formatCurrency } from '../../utils';

interface Props {
  user?: User | null;
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  portfolio?: { controvalore: number; versato: number };
  isAdmin?: boolean;
  budgets?: Record<string, number>;
}

const CAT_META: Record<InsightCategory, { label: string; icon: string }> = {
  alert:     { label: 'Priorità',      icon: '⚡' },
  forecast:  { label: 'Previsione',    icon: '🔮' },
  seasonal:  { label: 'Stagionalità',  icon: '🗓️' },
  trend:     { label: 'Tendenze',      icon: '📈' },
  habit:     { label: 'Abitudini',     icon: '🧠' },
  highlight: { label: 'Questo mese',   icon: '✦' },
};

// Remapping to 4 display groups (InsightCategory type stays untouched)
type DisplayGroup = 'now' | 'forecast' | 'habit' | 'advanced';
const CATEGORY_TO_GROUP: Record<InsightCategory, DisplayGroup> = {
  alert:     'now',
  highlight: 'now',
  forecast:  'forecast',
  habit:     'habit',
  seasonal:  'advanced',
  trend:     'advanced',
};
const GROUP_META: Record<DisplayGroup, { label: string; icon: string }> = {
  now:      { label: 'Da vedere ora',    icon: '⚡' },
  forecast: { label: 'Previsioni',       icon: '🔮' },
  habit:    { label: 'Abitudini',        icon: '🧠' },
  advanced: { label: 'Analisi avanzata', icon: '📊' },
};
const GROUP_ORDER: DisplayGroup[] = ['now', 'forecast', 'habit', 'advanced'];

const CAT_ORDER: InsightCategory[] = ['alert', 'forecast', 'seasonal', 'trend', 'habit', 'highlight'];

export function InsightsScreenV2(p: Props) {
  const { getCat, insightDepth, categories } = useSettings();
  const user = p.user ?? null;
  const [detail, setDetail] = useState<Insight | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const insights = buildInsights({
    transactions: p.transactions,
    monthlyIncome: p.monthlyIncome,
    monthlyExpenses: p.monthlyExpenses,
    monthlyInvestments: p.monthlyInvestments,
    getCat,
    depth: insightDepth,
    forecastV3Categories: categories.filter(c => c.kind === 'expense'),
    portfolio: p.portfolio,
    isAdmin: p.isAdmin,
    budgets: p.budgets,
  });

  // Group insights into 4 display groups
  const grouped = new Map<DisplayGroup, Insight[]>();
  for (const ins of insights) {
    const group = CATEGORY_TO_GROUP[ins.category];
    const list = grouped.get(group) ?? [];
    list.push(ins);
    grouped.set(group, list);
  }

  const saved = p.monthlyIncome - p.monthlyExpenses - p.monthlyInvestments;

  return (
    <div className="pb-32">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Consigli</h1>
        <p className="text-[13px] text-secondary mt-1">Le cose più importanti da sapere sui tuoi soldi.</p>
      </div>

      {p.monthlyIncome > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-6">
          <SummaryPill label="Entrate" value={formatCurrency(p.monthlyIncome)} color="#8A9270" />
          <SummaryPill label="Uscite"  value={formatCurrency(p.monthlyExpenses)} color="#8B8B8B" />
          <SummaryPill label={saved >= 0 ? 'Risparmiato' : 'Sforamento'} value={formatCurrency(Math.abs(saved))} color={saved >= 0 ? '#E6B95C' : '#E08B8B'} />
        </div>
      )}

      <div className="space-y-8">
        {GROUP_ORDER.filter(g => grouped.has(g)).map(g => {
          const meta  = GROUP_META[g];
          const items = grouped.get(g)!;
          const isAdvanced = g === 'advanced';
          const isOpen = !isAdvanced || advancedOpen;
          return (
            <section key={g}>
              <button
                type="button"
                className="flex items-center gap-2 mb-3 px-1 w-full text-left"
                onClick={() => isAdvanced && setAdvancedOpen(o => !o)}
              >
                <span className="text-sm">{meta.icon}</span>
                <p className="label-caps text-secondary">{meta.label}</p>
                <span className="text-[11px] text-secondary/50">· {items.length}</span>
                {isAdvanced && (
                  <span className="ml-auto text-secondary/50 text-[11px]">{advancedOpen ? '▲' : '▼'}</span>
                )}
              </button>
              {isOpen && (
                <div className="space-y-2.5">
                  {items.map((ins, i) => (
                    <div key={i} className={`glass-card rounded-2xl p-4 ${ins.urgent ? 'ring-1 ring-[#E08B8B]/30' : ''}`}>
                      <div className="flex items-start gap-3.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                          style={{ backgroundColor: ins.accent + '18' }}>
                          {ins.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-primary leading-snug">{ins.title}</p>
                          <p className="text-xs mt-0.5 leading-snug" style={{ color: ins.accent + 'cc' }}>{ins.detail}</p>
                        </div>
                        {ins.explain && (
                          <button onClick={() => setDetail(ins)} aria-label="Spiegazione"
                            className="w-6 h-6 rounded-full flex items-center justify-center text-secondary hover:text-primary hover:bg-card-hover transition-colors flex-shrink-0 mt-0.5">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                              <circle cx="12" cy="12" r="9" /><path d="M12 11v5" strokeLinecap="round" /><circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none" />
                            </svg>
                          </button>
                        )}
                      </div>
                      <InsightFeedback insightKey={`${ins.category}:${ins.title}`} user={user} />
                    </div>
                  ))}
                </div>
              )}
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
