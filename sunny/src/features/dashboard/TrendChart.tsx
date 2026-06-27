import { useState } from 'react';
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

function areaToBase(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  const line = smoothPath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L ${last.x} ${H} L ${first.x} ${H} Z`;
}

type SeriesKey = 'income' | 'expense' | 'invest';

const SERIES: { key: SeriesKey; label: string; color: string; fill: string; dash?: string }[] = [
  { key: 'income',  label: 'Entrate',      color: 'var(--accent-green)', fill: 'rgba(122,158,110,0.05)' },
  { key: 'expense', label: 'Uscite',       color: '#E08B8B',             fill: 'rgba(224,139,139,0.07)' },
  { key: 'invest',  label: 'Investimenti', color: 'var(--accent-gold)',  fill: 'rgba(230,185,92,0.10)', dash: '3 2.5' },
];

export function TrendChart({ data }: Props) {
  // Each series can be toggled independently (entrate / uscite / investimenti),
  // drawn from the baseline — no stacking — so hiding one doesn't shift the others.
  const [show, setShow] = useState<Record<SeriesKey, boolean>>({ income: true, expense: true, invest: true });
  const toggle = (k: SeriesKey) => setShow(s => ({ ...s, [k]: !s[k] }));

  const valuesOf = (k: SeriesKey) => data.map(d => d[k]);
  const enabled = SERIES.filter(s => show[s.key]);
  const max = Math.max(1, ...enabled.flatMap(s => valuesOf(s.key)));
  const hasData = data.some(d => d.income > 0 || d.expense > 0 || d.invest > 0);

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-y-2">
        <p className="label-caps text-secondary">Andamento 12 mesi</p>
        <div className="flex items-center gap-3 text-[11px]">
          {SERIES.map(s => (
            <button key={s.key} type="button" onClick={() => toggle(s.key)} aria-pressed={show[s.key]}
              className={`flex items-center gap-1.5 transition-opacity ${show[s.key] ? 'text-secondary' : 'text-secondary/40 line-through'}`}>
              <span className="w-5 h-px inline-block" style={{ backgroundColor: show[s.key] ? s.color : 'currentColor' }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center text-secondary text-xs h-[110px] md:h-[180px]">
          Aggiungi transazioni per vedere il grafico
        </div>
      ) : (
        <div>
          {/* preserveAspectRatio="none" lets the chart fill the full width on
              wide desktop layouts; vector-effect keeps strokes crisp at 1.5px
              despite the non-uniform scaling. */}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full overflow-visible h-[120px] md:h-[200px] lg:h-[240px]">
            {[0.25, 0.5, 0.75].map(t => (
              <line key={t}
                x1={PAD_X} y1={PAD_Y + t * (H - PAD_Y * 2)}
                x2={W - PAD_X} y2={PAD_Y + t * (H - PAD_Y * 2)}
                vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--progress-track)' }} strokeWidth="1" />
            ))}

            {/* Light area under each enabled series */}
            {enabled.map(s => (
              <path key={`a-${s.key}`} d={areaToBase(toPoints(valuesOf(s.key), max))} fill={s.fill} />
            ))}

            {/* Lines */}
            {enabled.map(s => (
              <path key={`l-${s.key}`} d={smoothPath(toPoints(valuesOf(s.key), max))} fill="none"
                vectorEffect="non-scaling-stroke" style={{ stroke: s.color }} strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dash} />
            ))}
          </svg>

          <div className="flex justify-between mt-2" style={{ paddingLeft: PAD_X, paddingRight: PAD_X }}>
            {data.map((d, i) => (
              <span
                key={d.key}
                className={`text-[10px] text-secondary ${i % 2 === 1 ? 'hidden sm:inline' : ''}`}
              >
                {capitalize(formatMonthShort(d.key))}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
