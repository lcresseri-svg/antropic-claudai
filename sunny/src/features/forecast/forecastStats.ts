/** Statistical utility functions for the V2 forecast engine. */

/** Median of an array of numbers. Returns 0 for empty arrays. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

/** Median absolute deviation (MAD). Robust spread measure. */
export function mad(values: number[]): number {
  if (values.length === 0) return 0;
  const m = median(values);
  return median(values.map(v => Math.abs(v - m)));
}

/**
 * Winsorize values at `k` × MAD above the median.
 * Values more than `k×MAD` above the median are capped.
 * Default k = 3.0 (keeps ≥99% of a normal distribution).
 */
export function winsorize(values: number[], k = 3.0): number[] {
  if (values.length <= 2) return values;
  const m = median(values);
  const d = mad(values);
  if (d === 0) return values; // all identical, nothing to cap
  const cap = m + k * d;
  return values.map(v => Math.min(v, cap));
}

/**
 * Robust mean: winsorize then average.
 * Returns 0 for empty arrays.
 */
export function robustMean(values: number[], k = 3.0): number {
  if (values.length === 0) return 0;
  const w = winsorize(values, k);
  return w.reduce((s, v) => s + v, 0) / w.length;
}

/**
 * Weighted mean where `weights[i]` corresponds to `values[i]`.
 * Falls back to plain mean if all weights are 0.
 */
export function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const totalW = weights.reduce((s, w) => s + w, 0);
  if (totalW === 0) return values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v, i) => s + v * weights[i], 0) / totalW;
}

/**
 * Linear interpolation between `a` and `b` at `t` ∈ [0,1].
 * Clamps `t` to [0,1].
 */
export function lerp(a: number, b: number, t: number): number {
  const tc = Math.max(0, Math.min(1, t));
  return a * (1 - tc) + b * tc;
}
