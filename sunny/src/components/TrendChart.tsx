import { formatMonthShort, formatCurrency, capitalize } from '../utils';

interface Props {
  data: { key: string; income: number; expense: number }[];
}

const W = 600;
const H = 110;
const PAD_X = 16;
const PAD_Y = 12;

function toPoints(values: number[], max: number): { x: number; y: number }[] {
  const n = values.length;
  return values.map((v, i) => ({
    x: PAD_X + (i / (n - 1)) * (W - PAD_X * 2),
    y: PAD_Y + (1 - (max > 0 ? v / max : 0)) * (H - PAD_Y * 2),
  }));
}

// Smooth cubic bezier path through points (Catmull-Rom → bezier conversion)
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const tension = 0.18;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function areaPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last.x} ${H} L ${first.x} ${H} Z`;
}

export function TrendChart({ data }: Props) {
  const max = Math.max(1, ...data.flatMap(d => [d.income, d.expense]));
  const hasData = data.some(d => d.income > 0 || d.expense > 0);

  const incPts = toPoints(data.map(d => d.income), max);
  const expPts = toPoints(data.map(d => d.expense), max);

  return (
    <div className="bg-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <p className="label-caps text-secondary">Andamento 6 mesi</p>
        <div className="flex items-center gap-3 text-[11px] text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-px inline-block" style={{ backgroundColor: '#7A9E6E' }} /> Entrate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-px inline-block" style={{ backgroundColor: '#E6B95C' }} /> Uscite
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center text-secondary text-xs" style={{ height: H }}>
          Aggiungi transazioni per vedere il grafico
        </div>
      ) : (
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ height: H }}>
            <defs>
              <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7A9E6E" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#7A9E6E" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E6B95C" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#E6B95C" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map(t => (
              <line key={t}
                x1={PAD_X} y1={PAD_Y + t * (H - PAD_Y * 2)}
                x2={W - PAD_X} y2={PAD_Y + t * (H - PAD_Y * 2)}
                stroke="#1C1C1C" strokeWidth="1" />
            ))}

            {/* Area fills */}
            <path d={areaPath(incPts)} fill="url(#incGrad)" />
            <path d={areaPath(expPts)} fill="url(#expGrad)" />

            {/* Lines */}
            <path d={smoothPath(incPts)} fill="none"
              stroke="#7A9E6E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={smoothPath(expPts)} fill="none"
              stroke="#E6B95C" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />

            {/* Dots at last point */}
            <circle cx={incPts[incPts.length - 1].x} cy={incPts[incPts.length - 1].y}
              r="2.5" fill="#7A9E6E" />
            <circle cx={expPts[expPts.length - 1].x} cy={expPts[expPts.length - 1].y}
              r="2.5" fill="#E6B95C" />
          </svg>

          {/* Month labels */}
          <div className="flex justify-between mt-2" style={{ paddingLeft: PAD_X, paddingRight: PAD_X }}>
            {data.map(d => (
              <span key={d.key} className="text-[10px] text-secondary">
                {capitalize(formatMonthShort(d.key))}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
