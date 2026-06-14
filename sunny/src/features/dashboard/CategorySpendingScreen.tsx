import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, ownShare } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, capitalize } from '../../utils';

type Period = '1m' | '3m' | '6m' | '1y';
type View = 'main' | 'altro';
type DetailTab = 'overview' | 'trend' | 'movimenti';

const PERIOD_OPTS: { value: Period; label: string; months: number }[] = [
  { value: '1m', label: 'Mese',   months: 1 },
  { value: '3m', label: '3 mesi', months: 3 },
  { value: '6m', label: '6 mesi', months: 6 },
  { value: '1y', label: 'Anno',   months: 12 },
];

const STAGE_W = 272; // px — fixed bubble-stage width
const THR = 0.03;    // categories below 3% of the total are folded into "Altro"

interface CatDatum {
  id: string;
  amount: number;
  pct: number;
  txCount: number;
  prevAmount: number;
  delta: number;
}

// ── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────────
// A fixed seed keeps the bubble scatter stable across re-renders (no jitter on
// every state change) while still looking organically random.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Layout engine ────────────────────────────────────────────────────────────
interface BubbleDatum {
  id: string;
  amount: number;
  r: number;
  x: number;
  y: number;
}

// Physics-ish packer: seeds bubbles on a polar scatter, then relaxes them with
// pairwise repulsion + a decaying pull toward the centre so they cluster snugly
// without overlapping. Returns the laid-out bubbles plus the stage height needed.
function computeBubbleLayout(
  items: { id: string; amount: number }[],
  stageW: number,
  minR: number,
  maxR: number,
  GAP: number,
  seed: number,
): { bubbles: BubbleDatum[]; stageH: number } {
  if (!items.length) return { bubbles: [], stageH: 100 };

  const rand = mulberry32(seed);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const maxAmt = Math.max(...items.map(c => c.amount)) || 1;

  // Sort by amount desc; radius scales linearly with amount.
  const sorted = [...items]
    .sort((a, b) => b.amount - a.amount)
    .map(c => ({ ...c, r: Math.round(minR + (c.amount / maxAmt) * (maxR - minR)) }));

  // Estimate stage height from total bubble area (~45% packing density).
  const totalArea = sorted.reduce((s, b) => s + Math.PI * b.r * b.r, 0);
  const H = Math.max(Math.round(totalArea / 0.45 / stageW), sorted[0].r * 2 + GAP * 4);
  const cx = stageW / 2, cy = H / 2;

  // Initial positions: random polar distribution biased toward the centre.
  const pos: { x: number; y: number }[] = sorted.map((b, i) => {
    if (i === 0) return { x: cx + (rand() - 0.5) * 20, y: cy + (rand() - 0.5) * 20 };
    const angle = rand() * Math.PI * 2;
    const maxDist = Math.min(stageW / 2, H / 2) * 0.85;
    const minDist = sorted[0].r * 0.3;
    const dist = minDist + rand() * rand() * (maxDist - minDist);
    return {
      x: clamp(cx + Math.cos(angle) * dist, b.r + GAP, stageW - b.r - GAP),
      y: clamp(cy + Math.sin(angle) * dist, b.r + GAP, H - b.r - GAP),
    };
  });

  // Relaxation: strong repulsion early, gentle settle late + gravity to centre.
  for (let iter = 0; iter < 600; iter++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j].x - pos[i].x;
        const dy = pos[j].y - pos[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        const minD = sorted[i].r + sorted[j].r + GAP;
        if (dist < minD) {
          moved = true;
          const force = (minD - dist) / 2 + (iter < 400 ? 1.0 : 0.1);
          const nx = dx / dist, ny = dy / dist;
          pos[i].x = clamp(pos[i].x - nx * force, sorted[i].r + GAP, stageW - sorted[i].r - GAP);
          pos[i].y = clamp(pos[i].y - ny * force, sorted[i].r + GAP, H - sorted[i].r - GAP);
          pos[j].x = clamp(pos[j].x + nx * force, sorted[j].r + GAP, stageW - sorted[j].r - GAP);
          pos[j].y = clamp(pos[j].y + ny * force, sorted[j].r + GAP, H - sorted[j].r - GAP);
        }
      }
    }
    if (iter < 400) {
      const g = 0.012 * (1 - iter / 400);
      for (let i = 0; i < pos.length; i++) {
        pos[i].x = clamp(pos[i].x + (cx - pos[i].x) * g, sorted[i].r + GAP, stageW - sorted[i].r - GAP);
        pos[i].y = clamp(pos[i].y + (cy - pos[i].y) * g, sorted[i].r + GAP, H - sorted[i].r - GAP);
      }
    }
    if (!moved && iter > 100) break;
  }

  // Pull the cluster up so the stage isn't taller than necessary.
  const minY = Math.min(...pos.map((p, i) => p.y - sorted[i].r));
  if (minY > GAP) pos.forEach(p => { p.y -= (minY - GAP); });

  const finalH = Math.max(...pos.map((p, i) => p.y + sorted[i].r)) + GAP;

  return {
    bubbles: sorted.map((b, i) => ({ id: b.id, amount: b.amount, r: b.r, x: pos[i].x, y: pos[i].y })),
    stageH: Math.ceil(finalH),
  };
}

// Six-month monthly totals for one category (timezone-safe YYYY-MM key — building
// it from local getFullYear/getMonth avoids the UTC roll-back that toISOString
// causes for local-midnight dates in TZ ahead of UTC, e.g. Europe/Rome).
function monthlyTotals(catId: string, transactions: Transaction[]): { month: string; total: number; isCurrent: boolean }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const total = transactions
      .filter(t => t.type === 'expense' && t.category === catId && t.date.startsWith(ym))
      .reduce((s, t) => s + ownShare(t), 0);
    return {
      month: capitalize(d.toLocaleString('it-IT', { month: 'short' }).replace('.', '')),
      total,
      isCurrent: i === 5,
    };
  });
}

// ── BubbleStage ──────────────────────────────────────────────────────────────
interface BubbleStageProps {
  layout: { bubbles: BubbleDatum[]; stageH: number };
  total: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  getCatMeta: (id: string) => { icon: string; color: string; label: string };
}

function BubbleStage({ layout, total, selectedId, onSelect, getCatMeta }: BubbleStageProps) {
  return (
    <div className="relative mx-auto" style={{ width: STAGE_W, height: layout.stageH }}>
      {layout.bubbles.map(b => {
        const isAltro = b.id === '__altro__';
        const meta = isAltro
          ? { icon: '+', color: '#5A5A5A', label: 'Altro' }
          : getCatMeta(b.id);
        const pct = total > 0 ? Math.round((b.amount / total) * 100) : 0;
        const emojiSize = Math.round(b.r * 0.5);
        const isSelected = selectedId === b.id;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b.id)}
            aria-label={`${meta.label}, ${pct}%`}
            className="absolute rounded-full flex flex-col items-center justify-center active:scale-90 transition-transform duration-100 border"
            style={{
              width: b.r * 2,
              height: b.r * 2,
              left: Math.round(b.x - b.r),
              top: Math.round(b.y - b.r),
              background: meta.color + '1A',
              borderColor: meta.color + '2E',
              outline: isSelected ? `2.5px solid ${meta.color}B0` : 'none',
              outlineOffset: isSelected ? '3px' : '0',
            }}
          >
            <span style={{ fontSize: emojiSize, lineHeight: 1 }} aria-hidden="true">
              {meta.icon}
            </span>
            <span className="text-[8px] font-medium mt-0.5 balance-num" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {pct}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── MiniTrendBars ────────────────────────────────────────────────────────────
function MiniTrendBars({ catId, transactions, color, tall = false }: {
  catId: string;
  transactions: Transaction[];
  color: string;
  tall?: boolean;
}) {
  const bars = useMemo(() => monthlyTotals(catId, transactions), [catId, transactions]);
  const maxVal = Math.max(...bars.map(b => b.total), 1);
  const maxBarH = tall ? 80 : 40;

  return (
    <div className={`flex items-end gap-1 ${tall ? 'h-24' : 'h-12'}`}>
      {bars.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5" style={{ height: '100%', justifyContent: 'flex-end' }}>
          <div
            className="w-full rounded-t-[2px]"
            style={{
              height: Math.max(3, Math.round((b.total / maxVal) * maxBarH)),
              background: color,
              opacity: b.isCurrent ? 1 : 0.28,
            }}
          />
          <span className="text-[8px] text-secondary">{b.month}</span>
        </div>
      ))}
    </div>
  );
}

// ── CategoryDetailPanel ──────────────────────────────────────────────────────
interface DetailPanelProps {
  cat: CatDatum;
  catMeta: { icon: string; color: string; label: string };
  transactions: Transaction[];
  total: number;
  prevLabel: string;
  activeTab: DetailTab;
  onTabChange: (t: DetailTab) => void;
  onSeeAll: () => void;
  periodTxs: Transaction[];
}

function CategoryDetailPanel({
  cat, catMeta, transactions, total, prevLabel, activeTab, onTabChange, onSeeAll, periodTxs,
}: DetailPanelProps) {
  const monthly = useMemo(() => monthlyTotals(cat.id, transactions).map(m => m.total), [cat.id, transactions]);
  const avgMonth = monthly.reduce((s, v) => s + v, 0) / 6;
  const minMonth = Math.min(...monthly);
  const maxMonth = Math.max(...monthly);

  const deltaColor =
    cat.delta > 0 ? 'text-[#E08B8B]'
    : cat.delta < 0 ? 'text-[#7B9E87]'
    : 'text-secondary';
  const deltaText =
    cat.prevAmount === 0
      ? null
      : cat.delta === 0
      ? `Stabile rispetto a ${prevLabel}`
      : `${cat.delta > 0 ? '+' : ''}${formatCurrency(Math.abs(cat.delta))} rispetto a ${prevLabel}`;

  const TABS: { id: DetailTab; label: string }[] = [
    { id: 'overview',  label: 'Riepilogo' },
    { id: 'trend',     label: 'Storico' },
    { id: 'movimenti', label: 'Movimenti' },
  ];

  const fmtDay = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).replace('.', '');

  return (
    <div className="glass-card rounded-2xl overflow-hidden mt-3 animate-fade-in-fast">
      {/* Hero row */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: catMeta.color + '1A' }}
        >
          {catMeta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-primary truncate">{catMeta.label}</p>
          {deltaText && <p className={`text-[11px] mt-0.5 balance-num ${deltaColor}`}>{deltaText}</p>}
        </div>
        <p className="text-[22px] font-bold balance-num text-primary flex-shrink-0">{formatCurrency(cat.amount)}</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-3 pb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              activeTab === t.id ? 'bg-gold/10 text-gold' : 'text-secondary hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      <div className="px-4 pb-4 pt-1 border-t border-white/[0.05]">
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <StatCell label="Media/mese" value={formatCurrency(avgMonth)} />
              <StatCell label="Movimenti" value={String(cat.txCount)} />
              <StatCell label="% del totale" value={`${cat.pct}%`} />
            </div>
            <p className="label-caps text-secondary mt-4 mb-2">Ultimi 6 mesi</p>
            <MiniTrendBars catId={cat.id} transactions={transactions} color={catMeta.color} />
          </>
        )}

        {activeTab === 'trend' && (
          <>
            <div className="mt-3">
              <p className="label-caps text-secondary mb-1">Media mensile</p>
              <p className="text-[26px] font-bold balance-num text-primary leading-none">{formatCurrency(avgMonth)}</p>
            </div>
            <div className="mt-4">
              <MiniTrendBars catId={cat.id} transactions={transactions} color={catMeta.color} tall />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <StatCell label="Minimo" value={formatCurrency(minMonth)} />
              <StatCell label="Media" value={formatCurrency(avgMonth)} />
              <StatCell label="Massimo" value={formatCurrency(maxMonth)} />
            </div>
          </>
        )}

        {activeTab === 'movimenti' && (
          <div className="mt-3">
            {periodTxs.length === 0 ? (
              <p className="text-[12px] text-secondary text-center py-4">Nessun movimento nel periodo</p>
            ) : (
              <div className="space-y-2">
                {periodTxs.slice(0, 5).map(t => (
                  <div key={t.id} className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-xs flex-shrink-0"
                      style={{ background: catMeta.color + '1a' }}
                    >
                      {catMeta.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] text-primary truncate">{t.description || catMeta.label}</p>
                      <p className="text-[10px] text-secondary">{fmtDay(t.date)}</p>
                    </div>
                    <p className="text-[12px] font-semibold balance-num text-primary flex-shrink-0">{formatCurrency(ownShare(t))}</p>
                  </div>
                ))}
                {cat.txCount > 5 && (
                  <button
                    type="button"
                    onClick={onSeeAll}
                    className="w-full flex items-center justify-center gap-1.5 pt-2 text-[12px] font-semibold text-gold active:opacity-70 transition-opacity"
                  >
                    Vedi tutti i {cat.txCount} movimenti
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-elevated rounded-xl px-2.5 py-2.5 text-center">
      <p className="text-[13px] font-semibold balance-num text-primary truncate">{value}</p>
      <p className="text-[9px] text-secondary mt-0.5 truncate">{label}</p>
    </div>
  );
}

interface Props {
  transactions: Transaction[];
}

export function CategorySpendingScreen({ transactions }: Props) {
  const navigate = useNavigate();
  const { getCat } = useSettings();
  const [period, setPeriod] = useState<Period>('1m');
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<View>('main');
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [altroSelCatId, setAltroSelCatId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('overview');
  const [altroDetailTab, setAltroDetailTab] = useState<DetailTab>('overview');

  const detailRef = useRef<HTMLDivElement>(null);
  const altroDetailRef = useRef<HTMLDivElement>(null);

  const now = useMemo(() => new Date(), []);
  const months = PERIOD_OPTS.find(o => o.value === period)!.months;

  // Changing the window invalidates the current selection.
  useEffect(() => {
    setSelectedCatId(null);
    setAltroSelCatId(null);
    setDetailTab('overview');
    setAltroDetailTab('overview');
  }, [period, offset]);

  // Auto-scroll the detail panels into view when a bubble is tapped.
  useEffect(() => {
    if (selectedCatId) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedCatId]);
  useEffect(() => {
    if (altroSelCatId) altroDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [altroSelCatId]);

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
    const cats: CatDatum[] = Object.entries(r)
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

  const visibleCats = useMemo(() => (total > 0 ? cats.filter(c => c.amount / total >= THR) : cats), [cats, total]);
  const hiddenCats  = useMemo(() => (total > 0 ? cats.filter(c => c.amount / total <  THR) : []), [cats, total]);
  const altroTotal  = useMemo(() => hiddenCats.reduce((s, c) => s + c.amount, 0), [hiddenCats]);

  const mainLayout = useMemo(
    () => computeBubbleLayout(
      [
        ...visibleCats.map(c => ({ id: c.id, amount: c.amount })),
        ...(hiddenCats.length > 0 ? [{ id: '__altro__', amount: altroTotal }] : []),
      ],
      STAGE_W, 24, 70, 14, 42,
    ),
    [visibleCats, hiddenCats, altroTotal],
  );

  const altroLayout = useMemo(
    () => computeBubbleLayout(hiddenCats.map(c => ({ id: c.id, amount: c.amount })), STAGE_W, 16, 42, 10, 99),
    [hiddenCats],
  );

  const catMeta = (id: string) => {
    const c = getCat(id);
    return { icon: c.icon, color: c.color, label: c.label };
  };
  const periodTxsFor = (catId: string) =>
    transactions
      .filter(t => t.type === 'expense' && t.category === catId)
      .filter(t => { const d = new Date(t.date); return d >= start && d <= end; })
      .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <>
      {view === 'main' && (
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

          {/* Bubble card */}
          {total > 0 && (
            <div className="glass-card rounded-2xl p-4 mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="label-caps text-secondary">Distribuzione</p>
                <span className="text-[13px] font-semibold balance-num text-primary">{formatCurrency(total)}</span>
              </div>
              <BubbleStage
                layout={mainLayout}
                total={total}
                selectedId={selectedCatId}
                onSelect={(id) => {
                  if (id === '__altro__') {
                    setSelectedCatId(null);
                    setDetailTab('overview');
                    setView('altro');
                    return;
                  }
                  setSelectedCatId(prev => (prev === id ? null : id));
                  setDetailTab('overview');
                }}
                getCatMeta={catMeta}
              />
              <p className="text-[9px] text-secondary/25 text-center mt-1.5">
                Tocca una categoria per i dettagli
              </p>
            </div>
          )}

          {/* Detail panel */}
          {selectedCatId && (() => {
            const cat = cats.find(c => c.id === selectedCatId);
            if (!cat) return null;
            return (
              <div ref={detailRef}>
                <CategoryDetailPanel
                  cat={cat}
                  catMeta={catMeta(cat.id)}
                  transactions={transactions}
                  total={total}
                  prevLabel={prevLabel}
                  activeTab={detailTab}
                  onTabChange={setDetailTab}
                  onSeeAll={() => navigate(`/transactions?cat=${cat.id}`)}
                  periodTxs={periodTxsFor(cat.id)}
                />
              </div>
            );
          })()}

          {/* Empty state */}
          {total === 0 && (
            <div className="glass-card rounded-2xl px-5 py-10 text-center text-secondary text-[13px]">
              Nessuna spesa in questo periodo
            </div>
          )}
        </div>
      )}

      {view === 'altro' && (
        <div className="pb-32">
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => { setView('main'); setAltroSelCatId(null); }}
              aria-label="Torna a tutte le categorie"
              className="w-9 h-9 rounded-2xl bg-elevated flex items-center justify-center text-secondary active:scale-95 transition-transform flex-shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6"/>
              </svg>
            </button>
            <h1 className="text-xl font-bold text-primary tracking-[-0.03em]">Altre categorie</h1>
            <span className="ml-auto text-[13px] font-semibold balance-num text-primary">{formatCurrency(altroTotal)}</span>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-3">
            <button onClick={() => { setView('main'); setAltroSelCatId(null); }} className="text-[11px] text-secondary flex items-center gap-1">
              ← Tutte le categorie
            </button>
            <span className="text-[10px] text-secondary/30">›</span>
            <span className="text-[11px] text-secondary/60">Altro</span>
          </div>

          {/* Bubble card — categorie minori */}
          <div className="glass-card rounded-2xl p-4 mb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="label-caps text-secondary">Categorie minori</p>
              <span className="text-[11px] text-secondary">{hiddenCats.length} categorie · sotto 3%</span>
            </div>
            {hiddenCats.length > 0 ? (
              <BubbleStage
                layout={altroLayout}
                total={total}
                selectedId={altroSelCatId}
                onSelect={(id) => {
                  setAltroSelCatId(prev => (prev === id ? null : id));
                  setAltroDetailTab('overview');
                }}
                getCatMeta={catMeta}
              />
            ) : (
              <p className="text-[12px] text-secondary text-center py-6">Nessuna categoria minore</p>
            )}
            {hiddenCats.length > 0 && (
              <p className="text-[9px] text-secondary/25 text-center mt-1.5">
                Tocca una categoria per i dettagli
              </p>
            )}
          </div>

          {/* Detail panel */}
          {altroSelCatId && (() => {
            const cat = hiddenCats.find(c => c.id === altroSelCatId);
            if (!cat) return null;
            return (
              <div ref={altroDetailRef}>
                <CategoryDetailPanel
                  cat={cat}
                  catMeta={catMeta(cat.id)}
                  transactions={transactions}
                  total={total}
                  prevLabel={prevLabel}
                  activeTab={altroDetailTab}
                  onTabChange={setAltroDetailTab}
                  onSeeAll={() => navigate(`/transactions?cat=${cat.id}`)}
                  periodTxs={periodTxsFor(cat.id)}
                />
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}
