import { ChartData } from '../../shared/components/ChartData';
import { useUiVersion } from '../../shared/providers/UiVersionProvider';
// Responsive SVG line chart for the THREE wealth series (total / liquidity /
// investments) over time. The total is the protagonist: thicker gold line with
// a light area fill; liquidity and investments are thinner support lines. A
// dashed horizontal guide marks the INITIAL total, so growth/decline reads at a
// glance. Values can be negative (e.g. debt-heavy liquidity): the Y domain
// follows the data, and a faint zero baseline appears when the range crosses 0.
// Pointer/touch hover shows a tooltip with date + all three values.

import { useRef, useState, useId } from 'react';
import { WealthPoint } from './wealthAnalytics';

interface Props {
  points: WealthPoint[];
  formatValue: (v: number) => string;
  height?: number;      // px, drawing area height
  /** Match the qualified total shown by the parent; defaults to full history. */
  includeInvestments?: boolean;
}

const W = 600;
const PAD_X = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 10;

const COLORS = {
  total: 'var(--accent-gold)',
  liquidity: 'var(--ui31-chart-blue, var(--accent-blue))',
  investments: 'var(--ui31-chart-purple, var(--accent-green))',
};

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const t = 0.16;
    d += ` C ${p1.x + (p2.x - p0.x) * t} ${p1.y + (p2.y - p0.y) * t}, ${p2.x - (p3.x - p1.x) * t} ${p2.y - (p3.y - p1.y) * t}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function WealthLineChart({ points: sourcePoints, formatValue, height = 190, includeInvestments = true }: Props) {
  const points = includeInvestments ? sourcePoints : sourcePoints.map(p => ({ ...p, total: p.total - p.investments }));
  const totalLabel = includeInvestments ? 'Totale' : points.some(p=>Math.abs(p.total-p.liquidity)>0.005) ? 'Conti al netto delle carte' : 'Liquidità inclusa';
  const ui3=useUiVersion()==='3.0';
  const path=(pts:{x:number;y:number}[])=>ui3?pts.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '):smoothPath(pts);
  const [showLiquidity,setShowLiquidity]=useState(true);
  const [showInvestments,setShowInvestments]=useState(true);
  const gradientId=useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHover] = useState<number | null>(null);
  const hover = hoverIndex !== null && hoverIndex < points.length ? hoverIndex : null;

  const data = <ChartData title="Patrimonio" columns={includeInvestments ? ['Data','Totale','Liquidità','Investimenti'] : ['Data',totalLabel]} rows={points.map(p=>includeInvestments ? [fmtDate(p.date),formatValue(p.total),formatValue(p.liquidity),formatValue(p.investments)] : [fmtDate(p.date),formatValue(p.total)])} scale="Scala adattata ai valori, non ancorata allo zero. Capitale investito sulla base dei versamenti, non storico di mercato."/>;

  if (ui3 && points.length === 1) return <div className="ui31-history-single"><p className="text-sm text-secondary">Un solo punto disponibile · {fmtDate(points[0].date)}</p><p className="balance-num text-primary font-semibold mt-2">{totalLabel} {formatValue(points[0].total)}</p>{data}</div>;

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-center text-secondary text-[12px] px-6" style={{ height }}>
        Appena avrai qualche movimento in più, Sunny potrà mostrarti come si muove il tuo patrimonio nel tempo.
      </div>
    );
  }

  const all = points.flatMap(p => includeInvestments ? [p.total, p.liquidity, p.investments] : [p.total]);
  const initialTotal = points[0].total;
  let lo = Math.min(...all, initialTotal);
  let hi = Math.max(...all, initialTotal);
  const pad = (hi - lo || Math.max(1, Math.abs(hi))) * 0.08;
  lo -= pad; hi += pad;
  const span = hi - lo;

  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
  const y = (v: number) => PAD_TOP + (1 - (v - lo) / span) * plotH;

  const coords = (get: (p: WealthPoint) => number) => points.map((p, i) => ({ x: x(i), y: y(get(p)) }));
  const totPts = coords(p => p.total);
  const liqPts = coords(p => p.liquidity);
  const invPts = coords(p => p.investments);

  const baseY = Math.min(y(lo), height - PAD_BOTTOM);
  const area = `${path(totPts)} L ${totPts[totPts.length - 1].x} ${baseY} L ${totPts[0].x} ${baseY} Z`;
  const initY = y(initialTotal);
  const crossesZero = lo < 0 && hi > 0;
  const zeroY = y(0);

  // Pointer → nearest sample index (viewBox scales non-uniformly, so map by fraction).
  const locate = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const frac = (clientX - rect.left) / rect.width;                 // 0..1 of full width
    const inner = (frac * W - PAD_X) / (W - PAD_X * 2);              // 0..1 of plot area
    const idx = Math.round(inner * (points.length - 1));
    return Math.max(0, Math.min(points.length - 1, idx));
  };

  const hp = hover != null ? points[hover] : null;
  // Tooltip anchors to the hovered X as a % of the width, clamped off the edges.
  const tipLeft = hover != null ? Math.min(82, Math.max(18, (x(hover) / W) * 100)) : 50;

  // Thin the X labels: aim for ~6 visible.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div>
      <div
        ref={wrapRef} tabIndex={ui3?0:undefined} role={ui3?'group':undefined} aria-label={ui3?'Andamento patrimonio: frecce per esplorare i valori':undefined}
        onKeyDown={e=>{if(ui3&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setHover(i=>e.key==='Home'?0:e.key==='End'?points.length-1:Math.max(0,Math.min(points.length-1,(i??0)+(e.key==='ArrowRight'?1:-1))));}}}
        className="relative select-none touch-pan-y"
        onPointerMove={e => setHover(locate(e.clientX))}
        onPointerDown={e => setHover(locate(e.clientX))}
        onPointerLeave={() => setHover(null)}
      >
        {/* Tooltip */}
        {hp && (
          <div
            className="absolute -top-2 z-10 -translate-x-1/2 -translate-y-full pointer-events-none bg-elevated border border-divider rounded-xl px-3 py-2 shadow-float whitespace-nowrap"
            style={{ left: `${tipLeft}%` }}
          >
            <p className="text-[10px] text-secondary mb-1">{fmtDate(hp.date)}</p>
            <p className="text-[11px] font-semibold text-primary balance-num flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: COLORS.total }} />
              {totalLabel} {formatValue(hp.total)}
            </p>
            {includeInvestments&&showLiquidity&&<p className="text-[11px] text-secondary balance-num flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: COLORS.liquidity }} />
              Liquidità {formatValue(hp.liquidity)}
            </p>}
            {includeInvestments&&showInvestments&&<p className="text-[11px] text-secondary balance-num flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: COLORS.investments }} />
              Investimenti {formatValue(hp.investments)}
            </p>}
          </div>
        )}

        <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--accent-gold)', stopOpacity: 0.14 }} />
              <stop offset="100%" style={{ stopColor: 'var(--accent-gold)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          <path d={area} fill={`url(#${gradientId})`} />

          {/* Zero baseline — only when the domain actually crosses zero. */}
          {crossesZero && (
            <line x1={PAD_X} y1={zeroY} x2={W - PAD_X} y2={zeroY}
              vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--border-strong)' }} strokeWidth="1" />
          )}

          {/* Dashed guide at the INITIAL total of the period. */}
          <line x1={PAD_X} y1={initY} x2={W - PAD_X} y2={initY}
            vectorEffect="non-scaling-stroke" strokeDasharray="4 4"
            style={{ stroke: 'var(--accent-gold)', opacity: 0.35 }} strokeWidth="1" />

          {/* Support lines first, protagonist on top. */}
          {includeInvestments&&showLiquidity&&<path data-wealth-series="liq" d={path(liqPts)} fill="none" vectorEffect="non-scaling-stroke"
            style={{ stroke: COLORS.liquidity }} strokeWidth={ui3 ? 1.5 : 1.25} strokeDasharray={ui3 ? "5 3" : undefined} strokeLinecap="round" strokeLinejoin="round" />}
          {includeInvestments&&showInvestments&&<path data-wealth-series="inv" d={path(invPts)} fill="none" vectorEffect="non-scaling-stroke"
            style={{ stroke: COLORS.investments }} strokeWidth={ui3 ? 1.5 : 1.25} strokeDasharray={ui3 ? "2 4" : undefined} strokeLinecap="round" strokeLinejoin="round" />}
          <path d={path(totPts)} fill="none" vectorEffect="non-scaling-stroke"
            style={{ stroke: COLORS.total }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Hover guide + markers on all three series. */}
          {hover != null && (
            <g>
              <line x1={x(hover)} y1={PAD_TOP} x2={x(hover)} y2={height - PAD_BOTTOM}
                vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--border-strong)' }} strokeWidth="1" />
              <circle cx={totPts[hover].x} cy={totPts[hover].y} r={3} fill={COLORS.total} vectorEffect="non-scaling-stroke" />
              {includeInvestments&&showLiquidity&&<circle cx={liqPts[hover].x} cy={liqPts[hover].y} r={2.4} fill={COLORS.liquidity} vectorEffect="non-scaling-stroke" />}
              {includeInvestments&&showInvestments&&<circle cx={invPts[hover].x} cy={invPts[hover].y} r={2.4} fill={COLORS.investments} vectorEffect="non-scaling-stroke" />}
            </g>
          )}

          {/* Endpoint marker on the total. */}
          <circle cx={totPts[totPts.length - 1].x} cy={totPts[totPts.length - 1].y} r={3}
            fill={COLORS.total} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      {ui3 && <p className="ui31-chart-scale text-[12px] text-secondary mt-2">Scala: {formatValue(lo)} — {formatValue(hi)}</p>}
      {/* X labels — thinned to stay readable. */}
      <div className="flex justify-between mt-1.5" style={{ paddingLeft: PAD_X * 0.02 + '%', paddingRight: PAD_X * 0.02 + '%' }}>
        {points.map((p, i) => (
          (i % labelEvery === 0 || i === points.length - 1) && (
            <span key={p.date} className="ui-chart-tick text-[9px] text-secondary">{p.label}</span>
          )
        ))}
      </div>

      {/* Legend */}
      <div className="liquid-chart-legend flex items-center justify-center gap-4 mt-2.5 text-[11px] text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-5 h-[2px] inline-block rounded" style={{ background: COLORS.total }} />
          <span className="font-medium text-primary">{totalLabel}</span>
        </span>
        {includeInvestments && (ui3?<button type="button" aria-pressed={showLiquidity} aria-label={`${showLiquidity?'Nascondi':'Mostra'} Liquidità`} onClick={()=>setShowLiquidity(v=>!v)} className="flex items-center gap-1.5" style={{minHeight:44,textDecoration:showLiquidity?'none':'line-through'}}><span className="w-5 h-px inline-block" style={{ background: ui3 ? `repeating-linear-gradient(90deg, ${COLORS.liquidity} 0 5px, transparent 5px 8px)` : COLORS.liquidity }}/>Liquidità</button>:<span className="flex items-center gap-1.5"><span className="w-5 h-px inline-block" style={{ background: ui3 ? `repeating-linear-gradient(90deg, ${COLORS.liquidity} 0 5px, transparent 5px 8px)` : COLORS.liquidity }}/>Liquidità</span>)}
        {includeInvestments && (ui3?<button type="button" aria-pressed={showInvestments} aria-label={`${showInvestments?'Nascondi':'Mostra'} Investimenti`} onClick={()=>setShowInvestments(v=>!v)} className="flex items-center gap-1.5" style={{minHeight:44,textDecoration:showInvestments?'none':'line-through'}}><span className="w-5 h-px inline-block" style={{ background: ui3 ? `repeating-linear-gradient(90deg, ${COLORS.investments} 0 2px, transparent 2px 6px)` : COLORS.investments }}/>Investimenti</button>:<span className="flex items-center gap-1.5"><span className="w-5 h-px inline-block" style={{ background: ui3 ? `repeating-linear-gradient(90deg, ${COLORS.investments} 0 2px, transparent 2px 6px)` : COLORS.investments }}/>Investimenti</span>)}
      </div>
      {data}
    </div>
  );
}
