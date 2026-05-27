import { formatCurrency } from '../utils';

export interface Segment {
  label: string;
  value: number;
  color: string;
  icon?: string;
}

interface Props {
  segments: Segment[];
  centerLabel?: string;
  size?: number;
}

function pol(cx: number, cy: number, r: number, a: number) {
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, oR: number, iR: number, start: number, end: number) {
  const sweep = end - start;
  if (sweep <= 0) return '';
  const large = sweep > Math.PI ? 1 : 0;
  const o1 = pol(cx, cy, oR, start), o2 = pol(cx, cy, oR, end);
  const i1 = pol(cx, cy, iR, end), i2 = pol(cx, cy, iR, start);
  return `M ${o1.x.toFixed(2)} ${o1.y.toFixed(2)} A ${oR} ${oR} 0 ${large} 1 ${o2.x.toFixed(2)} ${o2.y.toFixed(2)} L ${i1.x.toFixed(2)} ${i1.y.toFixed(2)} A ${iR} ${iR} 0 ${large} 0 ${i2.x.toFixed(2)} ${i2.y.toFixed(2)} Z`;
}

export function Donut({ segments, centerLabel, size = 140 }: Props) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  // Thin ring: oR=90 iR=74 → 16px wide (premium minimal)
  const cx = 100, cy = 100, oR = 90, iR = 74, GAP = 0.025;
  let angle = -Math.PI / 2;

  const paths = segments.filter(s => s.value > 0).map(s => {
    const span = (s.value / total) * 2 * Math.PI;
    const start = angle + GAP / 2;
    const end   = angle + span - GAP / 2;
    angle += span;
    return { ...s, d: arc(cx, cy, oR, iR, start, Math.max(start, end)) };
  });

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size}>
        {paths.length === 0 && (
          <circle cx={cx} cy={cy} r={(oR + iR) / 2} fill="none" stroke="#1C1C1C" strokeWidth={oR - iR} />
        )}
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} />)}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="label-caps text-secondary">{centerLabel ?? 'Totale'}</span>
        <span className="text-[13px] font-semibold text-primary balance-num mt-0.5">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
