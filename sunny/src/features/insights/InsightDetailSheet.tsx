import { useEffect } from 'react';
import { Insight, InsightChart } from './insightsEngine';
import { formatCurrency } from '../../utils';
import { useScrollLock } from '../../shared/useScrollLock';

interface Props {
  insight: Insight | null;
  onClose: () => void;
}

export function InsightDetailSheet({ insight, onClose }: Props) {
  useScrollLock(!!insight);
  useEffect(() => {
    if (!insight) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [insight, onClose]);

  if (!insight) return null;
  const ex = insight.explain;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float animate-sheet-up max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start gap-3.5 px-6 pt-6 pb-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-lg flex-shrink-0"
            style={{ backgroundColor: insight.accent + '20' }}>
            {insight.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-primary leading-snug">{insight.title}</h3>
            <p className="text-xs mt-0.5 leading-snug" style={{ color: insight.accent + 'cc' }}>{insight.detail}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary text-sm flex-shrink-0">✕</button>
        </div>

        <div className="overflow-y-auto overscroll-contain scrollbar-hide px-6 pb-7 space-y-5">
          {ex?.chart && <MiniBars chart={ex.chart} accent={insight.accent} />}

          {ex ? (
            <div className="space-y-4">
              <Block icon="💡" label="Cosa indica" text={ex.what} />
              <Block icon="🧮" label="Come è calcolato" text={ex.how} accent={insight.accent} />
              <Block icon="🗂️" label="Su quali dati" text={ex.basis} />
            </div>
          ) : (
            <p className="text-[13px] text-secondary">Nessuna spiegazione disponibile per questo insight.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ icon, label, text, accent }: { icon: string; label: string; text: string; accent?: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-sm mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="label-caps mb-1" style={{ color: accent ?? undefined }}>{label}</p>
        <p className="text-[13px] text-primary/90 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function fmt(v: number, format?: InsightChart['format']): string {
  if (format === 'percent') return `${Math.round(v)}%`;
  if (format === 'currency') return formatCurrency(v);
  return String(Math.round(v));
}

function MiniBars({ chart, accent }: { chart: InsightChart; accent: string }) {
  const { labels, values, format, refLine, refLabel } = chart;
  const highlight = chart.highlightIndex ?? values.length - 1;
  const maxVal = Math.max(...values.map(Math.abs), refLine ?? 0, 1);
  const H = 96;

  return (
    <div className="bg-card rounded-2xl p-4">
      <div className="relative flex items-end justify-around gap-2" style={{ height: H }}>
        {/* Reference line (e.g. average) */}
        {refLine != null && refLine > 0 && (
          <div className="absolute left-0 right-0 flex items-center pointer-events-none"
            style={{ bottom: `${(refLine / maxVal) * H}px` }}>
            <div className="flex-1 border-t border-dashed" style={{ borderColor: 'var(--progress-track)' }} />
            {refLabel && <span className="text-[9px] text-secondary ml-1 -mt-3">{refLabel}</span>}
          </div>
        )}
        {values.map((v, i) => {
          const h = Math.max(2, (Math.abs(v) / maxVal) * (H - 4));
          const on = i === highlight;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1 min-w-0">
              <span className="text-[10px] font-medium balance-num truncate w-full text-center"
                style={{ color: on ? accent : 'rgb(var(--c-secondary))' }}>
                {fmt(v, format)}
              </span>
              <div className="w-full rounded-t-md transition-all"
                style={{ height: h, backgroundColor: on ? accent : accent + '40', maxWidth: 44 }} />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-around gap-2 mt-2">
        {labels.map((l, i) => (
          <span key={i} className="text-[10px] text-secondary text-center flex-1 truncate min-w-0">{l}</span>
        ))}
      </div>
    </div>
  );
}
