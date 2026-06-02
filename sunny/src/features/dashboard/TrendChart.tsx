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

/** Filled band between a top curve and a bottom curve (both smoothed). */
function areaBetween(top: { x: number; y: number }[], bottom: { x: number; y: number }[]): string {
  if (top.length < 2) return '';
  const topLine = smoothPath(top);
  const botReversed = smoothPath([...bottom].reverse()).replace(/^M/, 'L');
  return `${topLine} ${botReversed} Z`;
}

const COLORS = {
  income:  'var(--accent-green)',
  expense: '#E08B8B',
  invest:  'var(--accent-gold)',
};

export function TrendChart({ data }: Props) {
  // Expenses and investments are stacked: the gold line sits on top of the red
  // one, so its height is "uscite + investimenti" (total money going out).
  const stacked = data.map(d => d.expense + d.invest);
  const max = Math.max(1, ...data.map(d => Math.max(d.income, d.expense + d.invest)));
  const hasData = data.some(d => d.income > 0 || d.expense > 0 || d.invest > 0);

  const incPts = toPoints(data.map(d => d.income), max);
  const expPts = toPoints(data.map(d => d.expense), max);
  const topPts = toPoints(stacked, max);

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-y-2">
        <p className="label-caps text-secondary">Andamento 6 mesi</p>
        <div className="flex items-center gap-3 text-[11px] text-secondary">
          <span className="flex items-center gap-1.5"><span className="w-5 h-px inline-block" style={{ backgroundColor: COLORS.income }} /> Entrate</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-px inline-block" style={{ backgroundColor: COLORS.expense }} /> Uscite</span>
          <span className="flex items-center gap-1.5"><span className="w-5 h-px inline-block" style={{ backgroundColor: COLORS.invest }} /> Investito</span>
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

            {/* Stacked outflow: expense band (0→expense) + investment band (expense→top) */}
            <path d={areaToBase(expPts)} fill="rgba(224,139,139,0.07)" />
            <path d={areaBetween(topPts, expPts)} fill="rgba(230,185,92,0.10)" />
            <path d={areaToBase(incPts)} fill="rgba(122,158,110,0.05)" />

            {/* Lines */}
            <path d={smoothPath(incPts)} fill="none" style={{ stroke: COLORS.income }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={smoothPath(expPts)} fill="none" style={{ stroke: COLORS.expense }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={smoothPath(topPts)} fill="none" style={{ stroke: COLORS.invest }} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2.5" />

            {/* Dots at last point */}
            <circle cx={incPts[incPts.length - 1].x} cy={incPts[incPts.length - 1].y} r="2.5" style={{ fill: COLORS.income }} />
            <circle cx={expPts[expPts.length - 1].x} cy={expPts[expPts.length - 1].y} r="2.5" style={{ fill: COLORS.expense }} />
            <circle cx={topPts[topPts.length - 1].x} cy={topPts[topPts.length - 1].y} r="2.5" style={{ fill: COLORS.invest }} />
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
