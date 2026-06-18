/**
 * Small shared helpers for the V4 engine modules.
 * Kept dependency-free (only the shared statistical helpers) so every V4
 * sub-module can import without circular references.
 */
import { median } from '../forecastStats';

/** A planned expense is "important" (large) at or above this amount. */
export const LARGE_EXPENSE_THRESHOLD = 300;

/** Seasonal detection only considers months with a single tx at/above this. */
export const SEASONAL_MIN_AMOUNT = 300;

/** Stale categories with no activity for this many months get residual decay. */
export const STALE_MONTHS = 6;

/** YYYY-MM key for a Date. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** ISO YYYY-MM-DD for a Date (local calendar date, not UTC). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Number of days in a month (0-based month index). */
export function daysInMonth(year: number, monthIdx: number): number {
  return new Date(year, monthIdx + 1, 0).getDate();
}

/**
 * Two amounts are "similar" when they differ by less than 15% relative OR less
 * than 50 € absolute (the looser of the two wins). e.g. 870 vs 880 → similar.
 */
export function amountsSimilar(a: number, b: number): boolean {
  const absDiff = Math.abs(a - b);
  if (absDiff <= 50) return true;
  const base = Math.max(Math.abs(a), Math.abs(b));
  if (base === 0) return true;
  return absDiff / base < 0.15;
}

/**
 * Percentile (0..100) of a numeric array using linear interpolation between
 * closest ranks. Returns 0 for empty arrays. P60 is the V4 residual estimator.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

export { median };

// ── Category label matching ─────────────────────────────────────────────────

/** Case/space-insensitive contains check on a category label. */
function labelHas(label: string, ...needles: string[]): boolean {
  const l = label.toLowerCase();
  return needles.some(n => l.includes(n));
}

/**
 * Categories whose residual must NEVER be reduced by stale decay even if quiet:
 * financing, subscriptions, insurance, planned university, etc.
 */
export function isStaleDecayExempt(label: string): boolean {
  return labelHas(
    label,
    'finanziamento', 'abbonament', 'assicuraz', 'universit', 'rata', 'mutuo', 'leasing',
  );
}

/** A category whose label suggests a periodic/seasonal nature (insurance, tax…). */
export function looksSeasonalByLabel(label: string): boolean {
  return labelHas(
    label,
    'assicuraz', 'bollo', 'tass', 'imu', 'universit', 'iscrizion', 'canone',
  );
}

/**
 * Fallback budget-reliability by category label, used when there isn't enough
 * historical budget data to compute reliability empirically.
 * Higher = the budget is a reliable predictor of real spend (fixed/committed);
 * lower = the budget is more of a generic ceiling.
 */
export function fallbackReliabilityByCategory(label: string): number {
  const l = label.toLowerCase();
  // Order matters: most specific / highest-reliability first.
  if (l.includes('finanziamento')) return 1.0;
  if (l.includes('assicuraz')) return 0.95;
  if (l.includes('universit')) return 0.95;
  if (l.includes('abbonament')) return 0.8;
  if (l.includes('vacanz')) return 0.75;
  if (l.includes('soldi casa') || l.includes('casa')) return 0.7;
  if (l.includes('fumo')) return 0.6;
  if (l.includes('regal')) return 0.5;
  if (l.includes('pieno') || l.includes('mezzi') || l.includes('benzina') || l.includes('carburante')) return 0.45;
  if (l.includes('caff')) return 0.45;
  if (l.includes('auto')) return 0.45;
  if (l.includes('superm') || l.includes('spesa')) return 0.35;
  if (l.includes('cene') || l.includes('cena') || l.includes('ristorant')) return 0.35;
  if (l.includes('acquist')) return 0.25;
  if (l.includes('uscit')) return 0.25;
  if (l.includes('extra')) return 0.25;
  return 0.4;
}
