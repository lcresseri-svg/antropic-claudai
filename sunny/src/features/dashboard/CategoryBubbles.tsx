import { formatCurrency } from '../../utils';
import type { Segment } from './Donut';

interface Props {
  segments: Segment[];
  /** How many of the top categories to render as bubbles. */
  count?: number;
}

// SVG canvas — responsive via viewBox + aspect-ratio on the element.
const VW = 320, VH = 190;
const R_MAX = 46, R_MIN = 22;

// Deterministic PRNG (mulberry32). The bubble layout is "random" but must stay
// stable across re-renders — re-randomizing every render would make the bubbles
// jump around. Seeding from the category set gives a fixed scatter per dataset.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Pick black or white text for legibility against the bubble's fill colour.
function readableText(hex: string): string {
  const h = hex.replace('#', '');
  if (h.length < 6) return 'rgba(255,255,255,0.96)';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.96)';
}

export function CategoryBubbles({ segments, count = 5 }: Props) {
  const top = segments.filter(s => s.value > 0).slice(0, count);
  if (top.length === 0) return null;

  // Bubble area ∝ value → radius ∝ √value, clamped to a readable range.
  const values = top.map(s => s.value);
  const sqMax = Math.sqrt(Math.max(...values));
  const sqMin = Math.sqrt(Math.min(...values));
  const radius = (v: number) =>
    sqMax === sqMin
      ? (R_MAX + R_MIN) / 2
      : R_MIN + (R_MAX - R_MIN) * ((Math.sqrt(v) - sqMin) / (sqMax - sqMin));

  // Place largest first (greedy): for each bubble, sample random spots and keep
  // the one with the largest gap to already-placed bubbles. Accept early once a
  // spot clears a small padding; otherwise keep the least-overlapping candidate.
  const sized = top
    .map(s => ({ ...s, r: radius(s.value) }))
    .sort((a, b) => b.r - a.r);

  const rng = mulberry32(hashStr(top.map(s => s.label).join('|')));
  const placed: { cx: number; cy: number; r: number }[] = [];
  for (const b of sized) {
    let best = { cx: VW / 2, cy: VH / 2 };
    let bestGap = -Infinity;
    for (let i = 0; i < 220; i++) {
      const cx = b.r + rng() * (VW - 2 * b.r);
      const cy = b.r + rng() * (VH - 2 * b.r);
      let minGap = Infinity;
      for (const p of placed) {
        const gap = Math.hypot(cx - p.cx, cy - p.cy) - p.r - b.r;
        if (gap < minGap) minGap = gap;
      }
      if (minGap > bestGap) { bestGap = minGap; best = { cx, cy }; }
      if (minGap >= 3) break;
    }
    placed.push({ cx: best.cx, cy: best.cy, r: b.r });
  }

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ aspectRatio: `${VW} / ${VH}` }}>
      {sized.map((b, i) => {
        const { cx, cy, r } = placed[i];
        const showAmount = r >= 32;
        return (
          <g key={b.label}>
            <circle
              cx={cx} cy={cy} r={r} fill={b.color} opacity={0.92}
              stroke="rgba(255,255,255,0.10)" strokeWidth={1}
            />
            <text
              x={cx} y={showAmount ? cy - r * 0.16 : cy}
              textAnchor="middle" dominantBaseline="central"
              fontSize={showAmount ? r * 0.6 : r * 0.78}
            >
              {b.icon ?? '•'}
            </text>
            {showAmount && (
              <text
                x={cx} y={cy + r * 0.46}
                textAnchor="middle" dominantBaseline="central"
                fontSize={Math.max(8, r * 0.24)} fontWeight={600}
                fill={readableText(b.color)}
              >
                {formatCurrency(b.value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
