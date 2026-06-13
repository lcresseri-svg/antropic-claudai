import { formatCurrency } from '../../utils';
import type { Segment } from './Donut';

interface Props {
  /** Segments may carry a category `id` to enable per-bubble drill-in. */
  segments: (Segment & { id?: string })[];
  /** How many of the top categories to render as bubbles. */
  count?: number;
  /** When set, each bubble becomes a button that drills into its category. */
  onSelect?: (id: string) => void;
}

// SVG canvas — responsive via viewBox + aspect-ratio on the element.
const VW = 320, VH = 200;
const R_MAX = 52, R_MIN = 24;

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

// Truncate a label to fit roughly within `availableWidth` px at `fontSize`.
// Assumes ~0.58em per character (average for common sans-serif fonts).
function truncate(label: string, availableWidth: number, fontSize: number): string {
  const maxChars = Math.floor(availableWidth / (fontSize * 0.58));
  if (maxChars <= 1) return '';
  return label.length <= maxChars ? label : label.slice(0, maxChars - 1) + '…';
}

export function CategoryBubbles({ segments, count = 5, onSelect }: Props) {
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
        const fg = readableText(b.color);
        // Available text width = ~85% of diameter.
        const availW = r * 1.7;
        const labelSize = Math.max(9, r * 0.26);
        const amountSize = Math.max(8, r * 0.22);
        const label = truncate(b.label, availW, labelSize);
        const amount = formatCurrency(b.value);
        // Two lines: label slightly above centre, amount slightly below.
        const gap = r * 0.22;
        const clickable = !!(onSelect && b.id);
        return (
          <g
            key={b.label}
            role={clickable ? 'button' : undefined}
            aria-label={clickable ? `${b.label}: ${amount}` : undefined}
            onClick={clickable ? e => { e.stopPropagation(); onSelect!(b.id!); } : undefined}
            style={clickable ? { cursor: 'pointer' } : undefined}
          >
            <circle
              cx={cx} cy={cy} r={r} fill={b.color} opacity={0.92}
              stroke="rgba(255,255,255,0.10)" strokeWidth={1}
            />
            {label && (
              <text
                x={cx} y={cy - gap}
                textAnchor="middle" dominantBaseline="central"
                fontSize={labelSize} fill={fg} opacity={0.85}
              >
                {label}
              </text>
            )}
            <text
              x={cx} y={cy + gap}
              textAnchor="middle" dominantBaseline="central"
              fontSize={amountSize} fontWeight={700} fill={fg}
            >
              {amount}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
