import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Transaction } from '../../types';
import { db } from '../../lib/firebase';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights, Insight, InsightCategory } from './insightsEngine';
import { topInsight } from './insightRankingV2';
import { isFeatureEnabled } from '../../shared/featureRollout';
import { InsightDetailSheet } from './InsightDetailSheet';
import { InsightFeedback } from '../feedback/InsightFeedback';
import { logEvent } from '../../shared/analytics/metrics';
import { formatCurrency } from '../../utils';

// Once-per-app-session guard: we persist the positive-insight pool at most once
// per user per foreground session, not on every render/navigation.
const encouragingPoolWritten = new Set<string>();

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
  const { getCat, insightDepth, visibleCategories } = useSettings();
  const user = p.user ?? null;
  const [detail, setDetail] = useState<Insight | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // metrics: insights_view on mount (fire-and-forget).
  useEffect(() => { if (user) logEvent(user.uid, 'insights_view'); }, [user]);

  const insights = buildInsights({
    transactions: p.transactions,
    monthlyIncome: p.monthlyIncome,
    monthlyExpenses: p.monthlyExpenses,
    monthlyInvestments: p.monthlyInvestments,
    getCat,
    depth: insightDepth,
    forecastExpenseCategories: visibleCategories.filter(c => c.kind === 'expense'),
    portfolio: p.portfolio,
    isAdmin: p.isAdmin,
    budgets: p.budgets,
  });

  // Persist a pool of positive insights for the "encouraging push" Cloud Function.
  // Debounced to once per user per app session (not every render). Only positive
  // insights are stored, each with its minDepth so the function can match the
  // user's analysis level.
  useEffect(() => {
    if (!user || encouragingPoolWritten.has(user.uid)) return;
    const items = insights
      .filter(i => i.tone === 'positive')
      .map(i => ({ title: i.title, detail: i.detail, minDepth: i.minDepth ?? 'advanced' }));
    if (items.length === 0) return; // wait until there's something positive to store
    encouragingPoolWritten.add(user.uid);
    setDoc(
      doc(db, 'users', user.uid, 'derived', 'encouraging'),
      { items, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch(() => encouragingPoolWritten.delete(user.uid)); // allow a retry if the write failed
  }, [user, insights]);

  // Ranking V2 (gated): ONE prioritized insight on top, scored on impact /
  // urgency / confidence / novelty / actionability by the pure ranking module.
  const rankingEnabled = isFeatureEnabled('insight_ranking_v2', user);
  const top = rankingEnabled ? topInsight(insights) : null;

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
          <SummaryPill label="Entrate" value={formatCurrency(p.monthlyIncome)} color="var(--accent-green)" />
          <SummaryPill label="Uscite"  value={formatCurrency(p.monthlyExpenses)} color="rgb(var(--c-secondary))" />
          <SummaryPill label={saved >= 0 ? 'Risparmiato' : 'Sforamento'} value={formatCurrency(Math.abs(saved))} color={saved >= 0 ? 'var(--accent)' : 'var(--accent-red)'} />
        </div>
      )}

      {top && (
        <section className="mb-6" aria-label="Insight prioritario">
          <div className="flex items-center gap-2 mb-3 px-1">
            <span className="text-sm">🎯</span>
            <p className="label-caps text-secondary">In evidenza (V2)</p>
          </div>
          <div className="glass-card rounded-2xl p-4 ring-1 ring-gold/30">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                style={{ backgroundColor: top.insight.accent + '18' }}>
                {top.insight.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-primary leading-snug">{top.insight.title}</p>
                <p className="text-xs mt-0.5 leading-snug" style={{ color: top.insight.accent + 'cc' }}>{top.insight.detail}</p>
                <p className="text-[10px] text-secondary mt-1.5">
                  priorità {top.total} · impatto {top.scores.impact} · urgenza {top.scores.urgency} · dominio {top.domain.replace('_', ' ')}
                </p>
              </div>
            </div>
          </div>
        </section>
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
                          <button onClick={() => { setDetail(ins); if (user) logEvent(user.uid, 'insight_open'); }} aria-label="Spiegazione"
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
