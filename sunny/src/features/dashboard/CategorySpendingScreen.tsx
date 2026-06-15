// "Categorie" — analytics for how spending breaks down by category over time.
// Period selector (Mese / 3M / 6M / 12M) + period navigation, a period summary,
// a deterministic Sunny insight, a compact composition bar, and a horizontal-bar
// ranking. Tapping a category opens a detail sheet (bottom sheet on mobile,
// side panel on desktop). Information density follows the global insightDepth.

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, capitalize } from '../../utils';
import {
  PeriodType, PERIOD_OPTS, getPeriodRange, getPreviousPeriodRange,
  aggregateCategorySpending, buildComposition, CategorySpendingSummary,
} from './categoryAnalytics';
import { CategoryDetailSheet } from './CategoryDetailSheet';

interface Props {
  transactions: Transaction[];
  /** Monthly per-category budgets (from useBudget). Enables budget metrics in advanced mode. */
  categoryBudgets?: Record<string, number>;
}

const OTHER_COLOR = '#6B6B6B';
const deltaColor = (d: number) => (d > 0 ? 'text-[#E08B8B]' : d < 0 ? 'text-[#7B9E87]' : 'text-secondary');

export function CategorySpendingScreen({ transactions, categoryBudgets }: Props) {
  const navigate = useNavigate();
  const { getCat, insightDepth } = useSettings();
  const [period, setPeriod] = useState<PeriodType>('1m');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => getPeriodRange(period, offset, now), [period, offset, now]);
  const prevRange = useMemo(() => getPreviousPeriodRange(period, offset, now), [period, offset, now]);

  const agg = useMemo(
    () => aggregateCategorySpending(transactions, range, prevRange, { categoryBudgets, now }),
    [transactions, range, prevRange, categoryBudgets, now],
  );
  const composition = useMemo(() => buildComposition(agg.categories, agg.total, 4), [agg]);

  // Changing the window closes any open detail.
  useEffect(() => { setSelectedId(null); }, [period, offset]);

  const selected = selectedId ? agg.categories.find(c => c.categoryId === selectedId) ?? null : null;
  const showDelta = insightDepth !== 'minimal';
  const showComposition = insightDepth !== 'minimal' && composition.length > 0;
  const maxAmount = agg.categories[0]?.amount ?? 0;

  const insight = useMemo(() => buildScreenInsight(agg, getCat), [agg, getCat]);

  // Advanced summary metrics.
  const activeCount = agg.categories.length;
  const top3Concentration = agg.total > 0
    ? Math.round((agg.categories.slice(0, 3).reduce((s, c) => s + c.amount, 0) / agg.total) * 100)
    : 0;
  const overPaceCount = agg.categories.filter(c =>
    c.isOverPace === true || (c.isOverPace === undefined && c.deltaPercentage !== null && c.deltaPercentage > 20),
  ).length;

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
          className="w-9 h-9 rounded-2xl bg-elevated flex items-center justify-center text-secondary active:scale-95 transition-transform flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-primary tracking-[-0.03em]">Categorie</h1>
      </div>
      <p className="text-[13px] text-secondary mb-5 ml-12">Analizza come cambiano le tue spese nel tempo.</p>

      {/* Sticky controls — remain visible while scrolling the category list */}
      <div className="sticky top-0 z-10 -mx-5 px-5 md:-mx-8 md:px-8 pt-1 pb-3 bg-bg border-b border-divider mb-5">

        {/* Period selector */}
        <div className="flex items-center gap-1.5 mb-3">
          {PERIOD_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setPeriod(opt.value); setOffset(0); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                period === opt.value ? 'bg-gold/10 text-gold' : 'text-secondary hover:text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Period navigator */}
        <div className="flex items-center justify-between bg-card rounded-xl px-1.5 py-1.5">
        <button
          onClick={() => setOffset(o => o + 1)}
          aria-label="Periodo precedente"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-primary">{capitalize(range.label)}</span>
          {offset > 0 && (
            <button onClick={() => setOffset(0)} className="text-[11px] font-medium text-gold">Oggi</button>
          )}
        </div>
        <button
          onClick={() => setOffset(o => Math.max(0, o - 1))}
          disabled={offset === 0}
          aria-label="Periodo successivo"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        </div>
      </div>{/* end sticky controls */}

      {agg.total === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-12 text-center">
          <p className="text-3xl mb-3 opacity-50">📊</p>
          <p className="text-[13px] text-secondary">Nessuna spesa in questo periodo.</p>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="glass-card rounded-2xl p-5 mb-3">
            <p className="label-caps text-secondary mb-1.5">Totale spese periodo</p>
            <p className="text-[34px] leading-none font-bold text-primary balance-num">{formatCurrency(agg.total)}</p>
            {showDelta && agg.deltaPercentage !== null && (
              <p className={`text-[13px] mt-2 balance-num ${deltaColor(agg.total - agg.previousTotal)}`}>
                {agg.deltaPercentage > 0 ? '+' : ''}{Math.round(agg.deltaPercentage)}%
                <span className="text-secondary"> rispetto al periodo precedente</span>
              </p>
            )}

            {/* Advanced summary metrics */}
            {insightDepth === 'advanced' && (
              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-divider">
                <MiniStat label="Categorie attive" value={String(activeCount)} />
                <MiniStat label="Top 3" value={`${top3Concentration}%`} />
                <MiniStat label="Sopra ritmo" value={String(overPaceCount)} tone={overPaceCount > 0 ? 'text-[#E08B8B]' : undefined} />
              </div>
            )}
          </div>

          {/* Sunny insight */}
          <div className="glass-card rounded-2xl px-5 py-4 mb-3">
            <p className="label-caps text-secondary mb-1.5">Sunny nota</p>
            <p className="text-[13px] text-primary leading-snug">{insight}</p>
          </div>

          {/* Composition */}
          {showComposition && (
            <div className="glass-card rounded-2xl p-5 mb-3">
              <p className="label-caps text-secondary mb-3">Composizione</p>
              <div className="flex w-full h-2.5 rounded-full overflow-hidden gap-px">
                {composition.map(seg => {
                  const color = seg.categoryId === '__other__' ? OTHER_COLOR : getCat(seg.categoryId).color;
                  return (
                    <div key={seg.categoryId} style={{ width: `${seg.percentage}%`, backgroundColor: color }} className="h-full first:rounded-l-full last:rounded-r-full" />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                {composition.map(seg => {
                  const isOther = seg.categoryId === '__other__';
                  const color = isOther ? OTHER_COLOR : getCat(seg.categoryId).color;
                  const label = isOther ? 'Altro' : getCat(seg.categoryId).label;
                  return (
                    <span key={seg.categoryId} className="flex items-center gap-1.5 text-[12px] text-secondary min-w-0">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="truncate text-primary">{label}</span>
                      <span className="balance-num">{Math.round(seg.percentage)}%</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Ranking */}
          <div className="glass-card rounded-2xl overflow-hidden">
            {agg.categories.map((c, i) => (
              <CategoryRankingRow
                key={c.categoryId}
                summary={c}
                meta={getCat(c.categoryId)}
                maxAmount={maxAmount}
                depth={insightDepth}
                last={i === agg.categories.length - 1}
                onClick={() => setSelectedId(c.categoryId)}
              />
            ))}
          </div>
        </>
      )}

      {selected && (
        <CategoryDetailSheet
          summary={selected}
          transactions={transactions}
          period={period}
          offset={offset}
          periodLabel={range.label}
          now={now}
          depth={insightDepth}
          onClose={() => setSelectedId(null)}
          onSeeAll={() => navigate(`/transactions?cat=${selected.categoryId}`)}
        />
      )}
    </div>
  );
}

function CategoryRankingRow({ summary, meta, maxAmount, depth, last, onClick }: {
  summary: CategorySpendingSummary;
  meta: { label: string; icon: string; color: string };
  maxAmount: number;
  depth: 'minimal' | 'medium' | 'advanced';
  last: boolean;
  onClick: () => void;
}) {
  const barPct = maxAmount > 0 ? (summary.amount / maxAmount) * 100 : 0;
  const showDetail = depth !== 'minimal';

  // Secondary metric line (medium) and the extra-dense line (advanced).
  const metaParts: string[] = [];
  if (showDetail) {
    metaParts.push(`${Math.round(summary.percentageOfTotal)}% del totale`);
    if (summary.deltaPercentage !== null) {
      metaParts.push(`${summary.deltaPercentage > 0 ? '+' : ''}${Math.round(summary.deltaPercentage)}% vs prec.`);
    }
  }
  const advParts: string[] = [];
  if (depth === 'advanced') {
    if (summary.budgetUsedPercentage !== undefined) advParts.push(`${Math.round(summary.budgetUsedPercentage)}% budget`);
    advParts.push(`${summary.transactionCount} mov.`);
    advParts.push(`ticket ${formatCurrency(summary.avgTransactionAmount)}`);
  }

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3.5 active:bg-card-hover transition-colors ${last ? '' : 'border-b border-divider'}`}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: meta.color + '1a' }}>
          {meta.icon}
        </span>
        <span className="text-[13px] text-primary flex-1 truncate">{meta.label}</span>
        {showDetail && summary.deltaPercentage !== null && (
          <span className={`text-[11px] balance-num flex-shrink-0 ${deltaColor(summary.deltaAmount)}`}>
            {summary.deltaPercentage > 0 ? '+' : ''}{Math.round(summary.deltaPercentage)}%
          </span>
        )}
        <span className="text-[13px] font-semibold balance-num text-primary flex-shrink-0">{formatCurrency(summary.amount)}</span>
      </div>

      {/* Bar */}
      <div className="h-[3px] rounded-full overflow-hidden ml-11" style={{ backgroundColor: 'var(--progress-track)' }}>
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(2, barPct)}%`, backgroundColor: meta.color }} />
      </div>

      {showDetail && metaParts.length > 0 && (
        <p className="text-[11px] text-secondary mt-1.5 ml-11">{metaParts.join(' · ')}</p>
      )}
      {depth === 'advanced' && advParts.length > 0 && (
        <p className="text-[11px] text-secondary/70 mt-0.5 ml-11">{advParts.join(' · ')}</p>
      )}
    </button>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className={`text-[15px] font-semibold balance-num ${tone ?? 'text-primary'}`}>{value}</p>
      <p className="text-[10px] text-secondary mt-0.5 truncate">{label}</p>
    </div>
  );
}

/** Deterministic period-level insight. */
function buildScreenInsight(
  agg: ReturnType<typeof aggregateCategorySpending>,
  getCat: (id: string) => { label: string },
): string {
  if (agg.total === 0 || agg.categories.length === 0) {
    return 'Appena avrai più movimenti, Sunny evidenzierà le categorie più rilevanti.';
  }

  // Spending grew vs the previous period → name the biggest drivers.
  if (agg.previousTotal > 0 && agg.total > agg.previousTotal * 1.05) {
    const risers = agg.categories
      .filter(c => c.deltaAmount > 0)
      .sort((a, b) => b.deltaAmount - a.deltaAmount)
      .slice(0, 2)
      .map(c => getCat(c.categoryId).label);
    if (risers.length === 2) return `${risers[0]} e ${risers[1]} spiegano gran parte dell'aumento rispetto al periodo precedente.`;
    if (risers.length === 1) return `${risers[0]} spiega gran parte dell'aumento rispetto al periodo precedente.`;
  }

  // Spending shrank → reassure.
  if (agg.previousTotal > 0 && agg.total < agg.previousTotal * 0.95) {
    return `Hai speso meno rispetto al periodo precedente: bel passo.`;
  }

  // Otherwise highlight the heaviest category.
  const top = agg.categories[0];
  return `${getCat(top.categoryId).label} è la voce più pesante del periodo: ${Math.round(top.percentageOfTotal)}% del totale.`;
}
