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
import { pickNextMove } from '../dashboard/NextMoveCard';
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
  /** Insight archiviati in questa sessione (nessun archivio persistito). */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

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

  // La cosa più importante: il ranking V2 quando è attivo, altrimenti la stessa
  // scelta che fa la home ("prossima mossa") — una sola definizione di priorità.
  const featured = top?.insight ?? pickNextMove(insights);
  // Archiviare qui vale per la sessione: non esiste (ancora) un archivio
  // persistito degli insight, e inventarne uno non è presentazione.
  const rest = insights.filter(i => i !== featured && !dismissed.has(i.title));
  const shown = featured && !dismissed.has(featured.title) ? featured : rest[0] ?? null;

  // Group insights into 4 display groups
  const grouped = new Map<DisplayGroup, Insight[]>();
  for (const ins of insights) {
    if (ins === shown || dismissed.has(ins.title)) continue;
    const group = CATEGORY_TO_GROUP[ins.category];
    const list = grouped.get(group) ?? [];
    list.push(ins);
    grouped.set(group, list);
  }

  const saved = p.monthlyIncome - p.monthlyExpenses - p.monthlyInvestments;

  return (
    <div className="pb-32">
      <div className="h-14 flex items-center">
        <h1 className="text-[17px] md:text-xl font-semibold text-primary tracking-[-0.03em]">Consigli</h1>
      </div>

      {/* Una sola priorità in evidenza. Via la card di debug del ranking
          (priorità / impatto / dominio): erano numeri per chi ha scritto il
          motore, non per chi legge il consiglio. */}
      {shown && (
        <section className="accent-card rounded-[22px] shadow-elev-1 p-[18px] mb-4 animate-rise-in"
          aria-label="Il consiglio più importante">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="w-[30px] h-[30px] rounded-[11px] bg-gold/[0.14] flex items-center justify-center text-sm flex-none">
              {shown.icon}
            </span>
            <p className="label-caps text-gold">La cosa più importante</p>
          </div>
          <p className="text-[19px] font-semibold text-primary leading-[1.3]">{shown.title}</p>
          <p className="mt-2 text-[13px] text-secondary leading-relaxed">{shown.detail}</p>

          <div className="flex items-center gap-2.5 mt-4">
            {shown.explain && (
              <button type="button"
                onClick={() => { setDetail(shown); if (user) logEvent(user.uid, 'insight_open'); }}
                className="flex-1 rounded-[14px] bg-primary text-bg py-3 text-[13px] font-semibold
                           active:scale-[0.98] transition-transform">
                Come mai?
              </button>
            )}
            <button type="button" aria-label="Archivia questo consiglio"
              onClick={() => setDismissed(d => new Set(d).add(shown.title))}
              className={`w-11 h-11 rounded-[14px] glass-card flex items-center justify-center text-secondary
                          active:scale-[0.98] transition-transform ${shown.explain ? 'flex-none' : 'ml-auto'}`}>
              ✕
            </button>
          </div>

          <InsightFeedback insightKey={`${shown.category}:${shown.title}`} user={user} />
        </section>
      )}

      {p.monthlyIncome > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-6">
          <SummaryPill label="Entrate" value={formatCurrency(p.monthlyIncome)} color="var(--accent-green)" />
          <SummaryPill label="Uscite"  value={formatCurrency(p.monthlyExpenses)} color="rgb(var(--c-secondary))" />
          <SummaryPill label={saved >= 0 ? 'Risparmiato' : 'Sforamento'} value={formatCurrency(Math.abs(saved))} color={saved >= 0 ? 'var(--accent)' : 'var(--accent-red)'} />
        </div>
      )}

      <div className="space-y-6">
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
                <span className="text-[11px] text-secondary/50">
                  · {items.length} {items.length === 1 ? 'consiglio' : 'consigli'}
                </span>
                {isAdvanced && (
                  <span className="ml-auto text-secondary/50 text-[11px]">{advancedOpen ? '▲' : '▼'}</span>
                )}
              </button>
              {/* Righe compatte, non card: il pollice su/giù resta solo sul
                  consiglio in evidenza e dentro la sheet di dettaglio. */}
              {isOpen && (
                <div className="glass-card rounded-[20px] shadow-elev-1 overflow-hidden">
                  {items.map((ins, i) => (
                    <button key={i} type="button"
                      onClick={() => { setDetail(ins); if (user) logEvent(user.uid, 'insight_open'); }}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-card-hover transition-colors ${
                        i < items.length - 1 ? 'border-b border-divider' : ''}`}>
                      <span className="w-[34px] h-[34px] rounded-xl flex items-center justify-center text-base flex-none"
                        style={{ backgroundColor: ins.accent + '26' }}>
                        {ins.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] text-primary truncate">{ins.title}</span>
                        <span className="block text-[11.5px] text-tertiary truncate">{ins.detail}</span>
                      </span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        strokeLinecap="round" strokeLinejoin="round" className="text-tertiary flex-none">
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </button>
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
    <div className="glass-card rounded-[18px] px-3 py-3">
      <p className="text-[12px] text-secondary mb-1">{label}</p>
      <p className="text-[14px] font-semibold balance-num truncate" style={{ color }}>{value}</p>
    </div>
  );
}
