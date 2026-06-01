import { formatMonthShort, capitalize } from '../../utils';

interface Props {
  data: { key: string; income: number; expense: number; invest: number }[];
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

const SERIES = [
  { key: 'income'  as const, label: 'Entrate',  color: 'var(--accent-green)', fill: 'rgba(122,158,110,0.06)' },
  { key: 'expense' as const, label: 'Uscite',   color: '#E08B8B',             fill: 'rgba(224,139,139,0.05)' },
  { key: 'invest'  as const, label: 'Investito', color: 'var(--accent-gold)', fill: 'rgba(230,185,92,0.06)' },
];

export function TrendChart({ data }: Props) {
  const max = Math.max(1, ...data.flatMap(d => [d.income, d.expense, d.invest]));
  const hasData = data.some(d => d.income > 0 || d.expense > 0 || d.invest > 0);

  const pts = {
    income:  toPoints(data.map(d => d.income), max),
    expense: toPoints(data.map(d => d.expense), max),
    invest:  toPoints(data.map(d => d.invest), max),
  };

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-y-2">
        <p className="label-caps text-secondary">Andamento 6 mesi</p>
        <div className="flex items-center gap-3 text-[11px] text-secondary">
          {SERIES.map(s => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="w-5 h-px inline-block" style={{ backgroundColor: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center text-secondary text-xs" style={{ height: H }}>
          Aggiungi transazioni per vedere il grafico
        </div>
      ) : (
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" style={{ height: H }}>
            {[0.25, 0.5, 0.75].map(t => (
              <line key={t}
                x1={PAD_X} y1={PAD_Y + t * (H - PAD_Y * 2)}
                x2={W - PAD_X} y2={PAD_Y + t * (H - PAD_Y * 2)}
                style={{ stroke: 'var(--progress-track)' }} strokeWidth="1" />
            ))}

            {SERIES.map(s => <path key={s.key} d={areaPath(pts[s.key])} fill={s.fill} />)}
            {SERIES.map(s => (
              <path key={s.key} d={smoothPath(pts[s.key])} fill="none"
                style={{ stroke: s.color }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {SERIES.map(s => {
              const p = pts[s.key][pts[s.key].length - 1];
              return <circle key={s.key} cx={p.x} cy={p.y} r="2.5" style={{ fill: s.color }} />;
            })}
          </svg>

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
