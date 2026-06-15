// Responsive SVG line chart for a single category's trend over time.
// Theme-aware (gridlines + labels use design tokens; the line uses the category
// colour). Smooth but restrained curve — no playful overshoot. Falls back to a
// neutral message when there isn't enough data to draw a meaningful line.

import { useId } from 'react';

interface Point { label: string; value: number; }

interface Props {
  points: Point[];
  color: string;            // category colour (hex)
  formatValue: (v: number) => string;
  height?: number;          // px, drawing area height
}

const W = 320;
const PAD_X = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 6;

function buildPoints(values: number[], max: number, h: number) {
  const n = values.length;
  return values.map((v, i) => ({
    x: PAD_X + (n === 1 ? 0.5 : i / (n - 1)) * (W - PAD_X * 2),
    y: PAD_TOP + (1 - (max > 0 ? v / max : 0)) * (h - PAD_TOP - PAD_BOTTOM),
  }));
}

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

export function CategoryTrendLineChart({ points, color, formatValue, height = 96 }: Props) {
  const gradId = useId();
  const values = points.map(p => p.value);
  const max = Math.max(1, ...values);
  const hasData = points.length >= 2 && values.some(v => v > 0);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-center text-secondary text-[11px] px-4" style={{ height }}>
        Appena avrai più movimenti, Sunny potrà mostrarti un andamento più utile.
      </div>
    );
  }

  const coords = buildPoints(values, max, height);
  const line = smoothPath(coords);
  const area = `${line} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;
  const peakIdx = values.indexOf(Math.max(...values));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.5, 1].map(t => (
          <line key={t}
            x1={PAD_X} y1={PAD_TOP + t * (height - PAD_TOP - PAD_BOTTOM)}
            x2={W - PAD_X} y2={PAD_TOP + t * (height - PAD_TOP - PAD_BOTTOM)}
            vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--progress-track)' }} strokeWidth="1" />
        ))}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" vectorEffect="non-scaling-stroke" style={{ stroke: color }} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />

        {/* Peak + endpoint markers */}
        {coords.map((c, i) => (i === peakIdx || i === coords.length - 1) && (
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
      <p className="text-[10px] text-secondary/70 text-center mt-1">Picco: {formatValue(max)}</p>
    </div>
  );
}
