import { Category, CATEGORY_META } from '../types';
import { formatCurrency } from '../utils';

interface Props {
  categoryTotals: Partial<Record<Category, number>>;
}

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function donutPath(
  cx: number, cy: number,
  outerR: number, innerR: number,
  startAngle: number, endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep <= 0) return '';
  const large = sweep > Math.PI ? 1 : 0;
  const o1 = polarToCartesian(cx, cy, outerR, startAngle);
  const o2 = polarToCartesian(cx, cy, outerR, endAngle);
  const i1 = polarToCartesian(cx, cy, innerR, endAngle);
  const i2 = polarToCartesian(cx, cy, innerR, startAngle);
  return [
    `M ${o1.x.toFixed(3)} ${o1.y.toFixed(3)}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${o2.x.toFixed(3)} ${o2.y.toFixed(3)}`,
    `L ${i1.x.toFixed(3)} ${i1.y.toFixed(3)}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${i2.x.toFixed(3)} ${i2.y.toFixed(3)}`,
    'Z',
  ].join(' ');
}

export function CategoryChart({ categoryTotals }: Props) {
  const entries = (Object.entries(categoryTotals) as [Category, number][])
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return null;

  const cx = 100, cy = 100, outerR = 78, innerR = 50;
  const GAP = 0.025;
  let angle = -Math.PI / 2;

  const segments = entries.map(([cat, value]) => {
    const span = (value / total) * 2 * Math.PI;
    const start = angle + GAP / 2;
    const end = angle + span - GAP / 2;
    angle += span;
    return { cat, value, path: donutPath(cx, cy, outerR, innerR, start, end) };
  });

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <h3 className="text-xs font-semibold text-dark/40 uppercase tracking-widest mb-4">
        Spese per categoria
      </h3>
      <div className="flex items-center gap-5">
        <div className="flex-shrink-0 relative">
          <svg viewBox="0 0 200 200" width="140" height="140">
            {segments.map(seg => (
              <path
                key={seg.cat}
                d={seg.path}
                fill={CATEGORY_META[seg.cat].color}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xs text-dark/40 font-medium">Totale</span>
            <span className="text-sm font-bold text-dark">{formatCurrency(total)}</span>
          </div>
        </div>

        <ul className="flex-1 space-y-2 min-w-0">
          {segments.map(({ cat, value }) => {
            const meta = CATEGORY_META[cat];
            const pct = ((value / total) * 100).toFixed(0);
            return (
              <li key={cat} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                <span className="text-xs text-dark/60 truncate flex-1">{meta.label}</span>
                <span className="text-xs font-semibold text-dark tabular-nums">{pct}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
