// Responsive SVG line chart for an account's BALANCE over time.
// Unlike CategoryTrendLineChart the value can be negative (e.g. a credit card),
// so the Y domain always includes zero and a faint baseline is drawn at 0 when
// the range crosses it. Theme-aware: the line uses the gold accent token; grid
// and labels use design tokens. No glow / heavy gradients.

import { useId } from 'react';

interface Point { label: string; value: number; }

interface Props {
  points: Point[];
  formatValue: (v: number) => string;
  color?: string;           // line colour; defaults to the gold accent token
  height?: number;          // px, drawing area height
}

const W = 320;
const PAD_X = 10;
const PAD_TOP = 16;
const PAD_BOTTOM = 10;

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

export function AccountBalanceLineChart({ points, formatValue, color = 'var(--accent)', height = 112 }: Props) {
  const gradId = useId();
  const values = points.map(p => p.value);
  const hasData = points.length >= 2;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-center text-secondary text-[11px] px-4" style={{ height }}>
        Appena avrai più movimenti, Sunny potrà mostrarti l'andamento del saldo.
      </div>
    );
  }

  // Domain always includes zero so the baseline is meaningful for negatives.
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => PAD_X + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD_X * 2);
  const y = (v: number) => PAD_TOP + (1 - (v - lo) / span) * plotH;

  const coords = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = smoothPath(coords);
  const zeroY = y(0);
  const crossesZero = lo < 0 && hi > 0;

  // Area between the curve and the zero baseline (works above and below zero).
  const area = `${line} L ${coords[coords.length - 1].x} ${zeroY} L ${coords[0].x} ${zeroY} Z`;

  const last = coords[coords.length - 1];
  const minIdx = values.indexOf(Math.min(...values));
  const maxIdx = values.indexOf(Math.max(...values));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.16 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#${gradId})`} />

        {/* Zero baseline — only when the range actually crosses zero. */}
        {crossesZero && (
          <line x1={PAD_X} y1={zeroY} x2={W - PAD_X} y2={zeroY}
            vectorEffect="non-scaling-stroke" strokeDasharray="3 3"
            style={{ stroke: 'var(--border-strong)' }} strokeWidth="1" />
        )}

        <path d={line} fill="none" vectorEffect="non-scaling-stroke"
          style={{ stroke: color }} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />

        {/* Min / max / endpoint markers. */}
        {coords.map((c, i) => (i === minIdx || i === maxIdx || i === coords.length - 1) && (
          <circle key={i} cx={c.x} cy={c.y} r={2.6} fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      <div className="flex justify-between mt-1.5" style={{ paddingLeft: PAD_X, paddingRight: PAD_X }}>
        {points.map((p, i) => (
          <span key={i} className={`text-[9px] text-secondary ${points.length > 7 && i % 2 === 1 ? 'hidden sm:inline' : ''}`}>
            {p.label}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-secondary/70 text-center mt-1">Saldo a fine periodo: {formatValue(last ? values[values.length - 1] : 0)}</p>
    </div>
  );
}
