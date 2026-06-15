// Category detail — a bottom sheet on mobile, a right side-panel on desktop.
// Content density follows the global "Livello di analisi" (insightDepth):
//   minimal  → essentials only
//   medium   → KPIs + comparison
//   advanced → extra metrics, historical baseline, projection + metric toggle.

import { useEffect, useMemo, useState } from 'react';
import { Transaction, ownShare } from '../../types';
import { useSettings, InsightDepth } from '../../shared/providers/settings';
import { formatCurrency, formatDate, capitalize } from '../../utils';
import {
  PeriodType, getPeriodRange, aggregateCategoryTrend, getCategoryMovements,
  historicalMonthlyAverage, periodElapsedFraction, CategorySpendingSummary,
} from './categoryAnalytics';
import { CategoryTrendLineChart } from './CategoryTrendLineChart';
import { useScrollLock } from '../../shared/useScrollLock';

interface Props {
  summary: CategorySpendingSummary;
  transactions: Transaction[];
  period: PeriodType;
  offset: number;
  periodLabel: string;
  now: Date;
  depth: InsightDepth;
  onClose: () => void;
  onSeeAll: () => void;
}

type Metric = 'amount' | 'count' | 'avg';

const deltaColor = (d: number) => (d > 0 ? 'text-[#E08B8B]' : d < 0 ? 'text-[#7B9E87]' : 'text-secondary');

export function CategoryDetailSheet({
  summary, transactions, period, offset, periodLabel, now, depth, onClose, onSeeAll,
}: Props) {
  const { getCat, getAcc } = useSettings();
  const cat = getCat(summary.categoryId);
  const [metric, setMetric] = useState<Metric>('amount');

  // Lock background scroll + close on Esc while open.
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const range = useMemo(() => getPeriodRange(period, offset, now), [period, offset, now]);
  const trend = useMemo(
    () => aggregateCategoryTrend(transactions, summary.categoryId, period, offset, now),
    [transactions, summary.categoryId, period, offset, now],
  );
  const movements = useMemo(
    () => getCategoryMovements(transactions, summary.categoryId, range),
    [transactions, summary.categoryId, range],
  );
  const histAvg = useMemo(
    () => historicalMonthlyAverage(transactions, summary.categoryId, now),
    [transactions, summary.categoryId, now],
  );

  const months = range.months;
  const monthlyEquivalent = summary.amount / months;
  const elapsed = periodElapsedFraction(range, now);
  const projection = range.isCurrent && elapsed > 0.05 && elapsed < 0.97 ? summary.amount / elapsed : null;
  const histDeviation = monthlyEquivalent - histAvg;
  const histDeviationPct = histAvg > 0 ? (histDeviation / histAvg) * 100 : null;

  const chartPoints = trend.map(p => ({
    label: p.label,
    value: metric === 'amount' ? p.amount : metric === 'count' ? p.transactionCount : p.avgTransactionAmount,
  }));
  const formatChart = (v: number) => (metric === 'count' ? `${Math.round(v)} mov.` : formatCurrency(v));

  // Deterministic note comparing this period's pace to the usual.
  const note = (() => {
    if (summary.transactionCount === 0) return 'Nessuna spesa in questa categoria nel periodo selezionato.';
    if (histAvg > 0 && histDeviationPct !== null && Math.abs(histDeviationPct) >= 12) {
      return histDeviationPct > 0
        ? `Le spese in ${cat.label} sono più alte del solito in questo periodo.`
        : `Le spese in ${cat.label} sono più contenute del solito in questo periodo.`;
    }
    if (summary.deltaPercentage !== null && Math.abs(summary.deltaPercentage) >= 12) {
      return summary.deltaPercentage > 0
        ? `${cat.label} è in aumento rispetto al periodo precedente.`
        : `${cat.label} è in calo rispetto al periodo precedente.`;
    }
    return `Spesa in ${cat.label} in linea con il tuo solito ritmo.`;
  })();

  // KPI cells, built per density.
  const kpis: { label: string; value: string; tone?: string }[] = [];
  if (depth !== 'minimal') {
    kpis.push({ label: 'Movimenti', value: String(summary.transactionCount) });
    kpis.push({ label: 'Spesa media', value: formatCurrency(summary.avgTransactionAmount) });
    kpis.push({ label: '% del totale', value: `${Math.round(summary.percentageOfTotal)}%` });
    if (summary.deltaPercentage !== null) {
      kpis.push({
        label: 'Variazione',
        value: `${summary.deltaPercentage > 0 ? '+' : ''}${Math.round(summary.deltaPercentage)}%`,
        tone: deltaColor(summary.deltaAmount),
      });
    } else {
      kpis.push({ label: 'Media/mese', value: formatCurrency(monthlyEquivalent) });
    }
  }
  if (depth === 'advanced') {
    if (histAvg > 0) kpis.push({ label: 'Media storica', value: `${formatCurrency(histAvg)}/mese` });
    if (histAvg > 0) kpis.push({
      label: 'Scostamento',
      value: `${histDeviation > 0 ? '+' : ''}${formatCurrency(histDeviation)}`,
      tone: deltaColor(histDeviation),
    });
    kpis.push({ label: 'Ticket mediano', value: formatCurrency(summary.medianTransactionAmount) });
    if (summary.budgetUsedPercentage !== undefined) {
      kpis.push({
        label: 'Budget usato',
        value: `${Math.round(summary.budgetUsedPercentage)}%`,
        tone: summary.budgetUsedPercentage > 100 ? 'text-[#E08B8B]' : undefined,
      });
    }
    if (projection !== null) kpis.push({ label: 'Proiezione periodo', value: `~${formatCurrency(projection)}` });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-stretch md:justify-end" role="dialog" aria-modal="true">
      <button aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-black/70 animate-fade-in-fast" />

      <div className="relative w-full md:w-[460px] md:max-w-[92vw] md:h-full max-h-[88vh] md:max-h-none
                      glass-elevated rounded-t-3xl md:rounded-t-none md:rounded-l-3xl shadow-float
                      flex flex-col animate-sheet-up overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-divider">
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ backgroundColor: cat.color + '1f' }}>
            {cat.icon}
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-[17px] font-bold text-primary tracking-[-0.02em] truncate">{cat.label}</h2>
            <p className="text-[11px] text-secondary mt-0.5">{capitalize(periodLabel)}</p>
          </div>
          <button onClick={onClose} aria-label="Chiudi"
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary hover:text-primary transition-colors flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          {/* Total */}
          <div>
            <p className="label-caps text-secondary mb-1">Totale periodo</p>
            <p className="text-[30px] leading-none font-bold text-primary balance-num">{formatCurrency(summary.amount)}</p>
            {summary.previousAmount > 0 && depth !== 'minimal' && (
              <p className={`text-[12px] mt-1.5 balance-num ${deltaColor(summary.deltaAmount)}`}>
                {summary.deltaAmount > 0 ? '+' : ''}{formatCurrency(summary.deltaAmount)}
                {summary.deltaPercentage !== null && ` · ${summary.deltaPercentage > 0 ? '+' : ''}${Math.round(summary.deltaPercentage)}%`}
                <span className="text-secondary"> rispetto al periodo precedente</span>
              </p>
            )}
          </div>

          {/* KPIs */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {kpis.map(k => (
                <div key={k.label} className="bg-card rounded-xl px-3 py-2.5">
                  <p className={`text-[14px] font-semibold balance-num ${k.tone ?? 'text-primary'}`}>{k.value}</p>
                  <p className="text-[10px] text-secondary mt-0.5 truncate">{k.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Trend */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="label-caps text-secondary">{period === '1m' ? 'Andamento del mese' : 'Andamento nel tempo'}</p>
              {depth === 'advanced' && (
                <div className="flex gap-0.5 bg-card rounded-lg p-0.5">
                  {([['amount', 'Importo'], ['count', 'Movimenti'], ['avg', 'Spesa media']] as [Metric, string][]).map(([m, lbl]) => (
                    <button key={m} onClick={() => setMetric(m)}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                        metric === m ? 'bg-elevated text-primary' : 'text-secondary'
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <CategoryTrendLineChart points={chartPoints} color={cat.color} formatValue={formatChart} />
          </div>

          {/* Sunny note */}
          <div className="bg-card rounded-2xl px-4 py-3">
            <p className="label-caps text-secondary mb-1">Sunny nota</p>
            <p className="text-[13px] text-primary leading-snug">{note}</p>
          </div>

          {/* Movements */}
          <div>
            <p className="label-caps text-secondary mb-2">Movimenti recenti</p>
            {movements.length === 0 ? (
              <p className="text-[12px] text-secondary py-3 text-center">Nessuna spesa in questa categoria nel periodo selezionato.</p>
            ) : (
              <div className="space-y-2.5">
                {movements.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-primary truncate">{t.description || cat.label}</p>
                      <p className="text-[11px] text-secondary">{capitalize(formatDate(t.date))} · {getAcc(t.account).label}</p>
                    </div>
                    <span className="text-[13px] font-semibold balance-num text-primary flex-shrink-0">
                      −{formatCurrency(ownShare(t))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="border-t border-divider px-5 py-3 safe-bottom">
          <button onClick={onSeeAll}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl glass-cta-gold text-[13px] font-semibold active:opacity-80 transition-opacity">
            Vedi tutti i movimenti
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
