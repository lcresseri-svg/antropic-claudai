import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, ownShare } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, capitalize } from '../../utils';

type Period = '1m' | '3m' | '6m' | '1y';

const PERIOD_OPTS: { value: Period; label: string; months: number }[] = [
  { value: '1m', label: 'Mese',   months: 1 },
  { value: '3m', label: '3 mesi', months: 3 },
  { value: '6m', label: '6 mesi', months: 6 },
  { value: '1y', label: 'Anno',   months: 12 },
];

// Bubble stage geometry (collision-push layout).
const STAGE_W = 292, STAGE_H = 260;
const R_MIN = 28, R_MAX = 68;
const SEEDS: [number, number][] = [
  [155, 72], [78, 130], [230, 138], [140, 188],
  [55, 210], [230, 218], [260, 72], [60, 72], [180, 230],
];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Props {
  transactions: Transaction[];
}

export function CategorySpendingScreen({ transactions }: Props) {
  const navigate = useNavigate();
  const { getCat } = useSettings();
  const [period, setPeriod] = useState<Period>('1m');
  const [offset, setOffset] = useState(0);
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const months = PERIOD_OPTS.find(o => o.value === period)!.months;

  // Changing the period/window invalidates the current selection.
  useEffect(() => { setSelectedCatId(null); }, [period, offset]);

  const { start, end, label, prevStart, prevEnd, prevLabel } = useMemo(() => {
    const cm = now.getMonth(), cy = now.getFullYear();
    const endMonth = new Date(cy, cm - offset, 1);
    const startMonth = new Date(cy, cm - offset - (months - 1), 1);
    const isCurrent = offset === 0;
    const end = isCurrent ? now : new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0, 23, 59, 59);
    const fmtM = (d: Date) => capitalize(d.toLocaleString('it-IT', { month: 'short' }).replace('.', ''));
    let label: string;
    if (months === 1) {
      label = capitalize(endMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' }));
    } else if (startMonth.getFullYear() === endMonth.getFullYear()) {
      label = `${fmtM(startMonth)}–${fmtM(endMonth)} ${endMonth.getFullYear()}`;
    } else {
      label = `${fmtM(startMonth)} ${startMonth.getFullYear()} – ${fmtM(endMonth)} ${endMonth.getFullYear()}`;
    }
    const prevEndMonth   = new Date(cy, cm - offset - months, 1);
    const prevStartMonth = new Date(cy, cm - offset - months - (months - 1), 1);
    const prevEnd        = new Date(prevEndMonth.getFullYear(), prevEndMonth.getMonth() + 1, 0, 23, 59, 59);
    let prevLabel: string;
    if (months === 1) {
      prevLabel = capitalize(prevEndMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' }));
    } else if (prevStartMonth.getFullYear() === prevEndMonth.getFullYear()) {
      prevLabel = `${fmtM(prevStartMonth)}–${fmtM(prevEndMonth)} ${prevEndMonth.getFullYear()}`;
    } else {
      prevLabel = `${fmtM(prevStartMonth)} ${prevStartMonth.getFullYear()} – ${fmtM(prevEndMonth)} ${prevEndMonth.getFullYear()}`;
    }
    return { start: startMonth, end, label, prevStart: prevStartMonth, prevEnd, prevLabel };
  }, [now, offset, months]);

  const prevCatSpend = useMemo(() => {
    const r: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const d = new Date(t.date);
      if (d < prevStart || d > prevEnd) continue;
      r[t.category] = (r[t.category] ?? 0) + ownShare(t);
    }
    return r;
  }, [transactions, prevStart, prevEnd]);

  const { total, cats } = useMemo(() => {
    const r: Record<string, number> = {};
    const txCount: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const d = new Date(t.date);
      if (d < start || d > end) continue;
      r[t.category] = (r[t.category] ?? 0) + ownShare(t);
      txCount[t.category] = (txCount[t.category] ?? 0) + 1;
    }
    const total = Object.values(r).reduce((s, v) => s + v, 0);
    const cats = Object.entries(r)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([id, amount]) => ({
        id,
        amount,
        pct: total > 0 ? Math.round((amount / total) * 100) : 0,
        txCount: txCount[id] ?? 0,
        prevAmount: prevCatSpend[id] ?? 0,
        delta: amount - (prevCatSpend[id] ?? 0),
      }));
    return { total, cats };
  }, [transactions, start, end, prevCatSpend]);

  // Collision-push bubble layout. Seeded from the (amount-sorted) categories and
  // relaxed over 120 iterations so bubbles spread out without overlapping. Recomputed
  // only when the category set/period changes — stable across unrelated re-renders.
  const bubbleLayout = useMemo(() => {
    const maxAmount = cats.length > 0 ? cats[0].amount : 1;
    const bubbles = cats.map(c => ({
      id: c.id,
      pct: c.pct,
      r: Math.round(R_MIN + (c.amount / maxAmount) * (R_MAX - R_MIN)),
    }));
    const pos = bubbles.map((b, i) => {
      const seed = i < SEEDS.length
        ? SEEDS[i]
        : [(i % 3) * 100 + 50, Math.floor(i / 3) * 80 + 40] as [number, number];
      return {
        x: clamp(seed[0], b.r, STAGE_W - b.r),
        y: clamp(seed[1], b.r, STAGE_H - b.r),
      };
    });
    for (let iter = 0; iter < 120; iter++) {
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const dx = pos[j].x - pos[i].x;
          const dy = pos[j].y - pos[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minDist = bubbles[i].r + bubbles[j].r + 5;
          if (dist < minDist) {
            const push = (minDist - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            pos[i].x = clamp(pos[i].x - nx * push, bubbles[i].r, STAGE_W - bubbles[i].r);
            pos[i].y = clamp(pos[i].y - ny * push, bubbles[i].r, STAGE_H - bubbles[i].r);
            pos[j].x = clamp(pos[j].x + nx * push, bubbles[j].r, STAGE_W - bubbles[j].r);
            pos[j].y = clamp(pos[j].y + ny * push, bubbles[j].r, STAGE_H - bubbles[j].r);
          }
        }
      }
    }
    return bubbles.map((b, i) => ({ ...b, x: pos[i].x, y: pos[i].y }));
  }, [cats]);

  const selectedCat = cats.find(c => c.id === selectedCatId) ?? null;

  return (
    <div className="pb-32">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
          className="w-9 h-9 rounded-2xl bg-elevated flex items-center justify-center text-secondary active:scale-95 transition-transform flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <h1 className="text-xl font-bold text-primary tracking-[-0.03em]">Spese per categoria</h1>
      </div>

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
      <div className="flex items-center justify-between bg-card rounded-xl px-1.5 py-1.5 mb-5">
        <button
          onClick={() => setOffset(o => o + 1)}
          aria-label="Periodo precedente"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-primary">{label}</span>
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
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </button>
      </div>

      {/* Distribuzione — bubble chart (tap a bubble for inline detail) */}
      {total > 0 && (
        <div className="mb-4">
          <div className="glass-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="label-caps text-secondary">Distribuzione</p>
              <span className="text-[13px] font-semibold balance-num text-primary">{formatCurrency(total)}</span>
            </div>
            <div className="relative mx-auto" style={{ width: STAGE_W, height: STAGE_H }}>
              {bubbleLayout.map(b => {
                const cat = getCat(b.id);
                const selected = selectedCatId === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedCatId(prev => (prev === b.id ? null : b.id))}
                    aria-label={`${cat.label}: ${b.pct}%`}
                    className="absolute flex flex-col items-center justify-center active:scale-90 transition-transform duration-100"
                    style={{
                      left: b.x - b.r,
                      top: b.y - b.r,
                      width: b.r * 2,
                      height: b.r * 2,
                      borderRadius: '50%',
                      background: cat.color + '1E',
                      border: `1.5px solid ${cat.color}33`,
                      outline: selected ? `2px solid ${cat.color}B3` : undefined,
                      outlineOffset: selected ? 2 : undefined,
                    }}
                  >
                    <span className="leading-none" style={{ fontSize: b.r * 0.5 }}>{cat.icon}</span>
                    <span className="text-[9px] text-secondary mt-0.5">{b.pct}%</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-secondary/40 text-center mt-1.5">
              Tocca una categoria per i dettagli
            </p>
          </div>

          {/* Detail panel */}
          {selectedCat && (() => {
            const cat = getCat(selectedCat.id);
            const prevAmt = prevCatSpend[selectedCat.id] ?? 0;
            const delta = selectedCat.amount - prevAmt;
            return (
              <div className="glass-card rounded-2xl overflow-hidden mt-3">
                {/* Hero row */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05]">
                  <span
                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                    style={{ background: cat.color + '1E' }}
                  >
                    {cat.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-primary">{cat.label}</p>
                    <p className="text-[11px] text-secondary mt-0.5">
                      {selectedCat.pct}% del totale · {selectedCat.txCount} movimenti
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[16px] font-semibold balance-num text-primary">
                      {formatCurrency(selectedCat.amount)}
                    </p>
                    {prevAmt > 0 && (
                      <p className={`text-[11px] mt-0.5 balance-num ${delta > 0 ? 'text-[#E08B8B]' : delta < 0 ? 'text-[#7B9E87]' : 'text-secondary'}`}>
                        {delta > 0 ? '+' : ''}{formatCurrency(delta)} vs {prevLabel}
                      </p>
                    )}
                  </div>
                </div>
                {/* Mini barchart ultimi 6 mesi */}
                <div className="px-4 py-3 border-b border-white/[0.05]">
                  <p className="label-caps text-secondary mb-2">Ultimi 6 mesi</p>
                  <MiniTrendBars catId={selectedCat.id} transactions={transactions} color={cat.color} />
                </div>
                {/* CTA */}
                <button
                  type="button"
                  onClick={() => navigate(`/transactions?cat=${selectedCat.id}`)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 text-[12px] font-semibold text-gold active:opacity-70 transition-opacity"
                >
                  Vedi movimenti
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Category list */}
      {cats.length === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-10 text-center text-secondary text-[13px]">
          Nessuna spesa in questo periodo
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          {cats.map(({ id, amount, pct, prevAmount, delta }, i) => {
            const cat = getCat(id);
            const deltaText =
              prevAmount === 0
                ? `Nessuna spesa in ${prevLabel}`
                : delta === 0
                ? `Stabile rispetto a ${prevLabel}`
                : `${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))} rispetto a ${prevLabel}`;
            const deltaColor =
              delta > 0 ? 'text-[#E08B8B]'
              : delta < 0 ? 'text-[#7B9E87]'
              : 'text-secondary';
            return (
              <div
                key={id}
                className={`px-4 py-3.5 ${i < cats.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                    style={{ backgroundColor: cat.color + '1a' }}
                  >
                    {cat.icon}
                  </span>
                  <span className="text-[13px] text-primary flex-1 truncate">{cat.label}</span>
                  <span className="text-[11px] text-secondary balance-num w-8 text-right flex-shrink-0">{pct}%</span>
                  <span className="text-[13px] font-semibold balance-num text-primary flex-shrink-0">
                    {formatCurrency(amount)}
                  </span>
                </div>
                <p className={`text-xs mt-1 ml-11 ${deltaColor}`}>{deltaText}</p>
                {/* Proportional bar */}
                <div
                  className="h-[3px] rounded-full overflow-hidden ml-11 mt-2"
                  style={{ backgroundColor: 'var(--progress-track)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: cat.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Six-month spending sparkline for a single category. The current month is fully
// opaque; previous months are dimmed. Heights are normalised to the period's max.
function MiniTrendBars({ catId, transactions, color }: { catId: string; transactions: Transaction[]; color: string }) {
  const bars = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const total = transactions
        .filter(t => t.type === 'expense' && t.category === catId && t.date.startsWith(ym))
        .reduce((s, t) => s + ownShare(t), 0);
      return {
        month: d.toLocaleString('it-IT', { month: 'short' }).replace('.', ''),
        total,
        isCurrent: i === 5,
      };
    });
  }, [catId, transactions]);

  const maxVal = Math.max(...bars.map(b => b.total), 1);
  return (
    <div className="flex items-end gap-1 h-10">
      {bars.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div
            className="w-full rounded-t-sm"
            style={{
              height: `${Math.max(3, Math.round((b.total / maxVal) * 36))}px`,
              backgroundColor: color,
              opacity: b.isCurrent ? 1 : 0.28,
            }}
          />
          <span className="text-[9px] text-secondary">{b.month}</span>
        </div>
      ))}
    </div>
  );
}
