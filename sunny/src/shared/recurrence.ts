import { Transaction, Freq } from '../types';

// Monthly-equivalent multipliers — kept identical to the original "fixed cost
// load" insight so refactors don't shift existing numbers.
const MONTHLY_EQUIV: Record<Freq, number> = {
  daily: 30,
  weekly: 4.33,
  monthly: 1,
  yearly: 1 / 12,
};

/**
 * Next occurrence date (YYYY-MM-DD) after advancing one period.
 * Mirrors the original client-side logic that used to live in insightsEngine
 * so projected dates and insight output stay byte-for-byte the same.
 */
export function addPeriod(dateStr: string, freq: Freq): string {
  const d = new Date(dateStr);
  if      (freq === 'daily')   d.setDate(d.getDate() + 1);
  else if (freq === 'weekly')  d.setDate(d.getDate() + 7);
  else if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  else                          d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export interface ProjectOpts {
  /** Max number of virtual occurrences to emit (guards dense daily series). */
  cap?: number;
}

// Bounds a single series; for `daily` this effectively caps the horizon to
// ~60 days, which keeps the Movimenti list sane.
const DEFAULT_CAP = 60;

/**
 * Virtual future occurrences of a recurring TEMPLATE, strictly AFTER the
 * template's own date (the template row already represents its own date),
 * up to min(toISO, recurring.until).
 *
 * The returned objects are DISPLAY-ONLY: `projected: true`, a synthetic id, and
 * NO `recurring` field. They must never reach a Firestore write path.
 */
export function projectOccurrences(
  template: Transaction,
  fromISO: string,
  toISO: string,
  opts: ProjectOpts = {},
): Transaction[] {
  const rule = template.recurring;
  if (!rule) return [];

  const cap = opts.cap ?? DEFAULT_CAP;
  const upper = rule.until && rule.until < toISO ? rule.until : toISO;
  const seriesId = template.seriesId ?? template.id;

  const out: Transaction[] = [];
  let guard = 5000;
  let d = addPeriod(template.date, rule.freq);
  // Fast-forward past occurrences before the visible window start.
  while (d < fromISO && --guard > 0) d = addPeriod(d, rule.freq);
  while (d <= upper && out.length < cap && --guard > 0) {
    // Strip the recurring rule: a projected row is an occurrence, not the template.
    const { recurring: _r, projected: _p, ...rest } = template;
    void _r; void _p;
    out.push({ ...rest, id: `${template.id}__${d}`, date: d, seriesId, projected: true });
    d = addPeriod(d, rule.freq);
  }
  return out;
}

/** Every virtual future occurrence across all active recurring templates. */
export function buildProjectedOccurrences(
  transactions: Transaction[],
  fromISO: string,
  toISO: string,
  opts?: ProjectOpts,
): Transaction[] {
  const out: Transaction[] = [];
  for (const t of transactions) {
    if (!t.recurring) continue;
    if (t.recurring.until && t.recurring.until < fromISO) continue; // series already ended
    out.push(...projectOccurrences(t, fromISO, toISO, opts));
  }
  return out;
}

/**
 * Monthly-equivalent total of active recurring templates of a given type.
 * Normalization matches the existing "fixed cost load" insight.
 */
export function recurringMonthlyEquivalent(
  transactions: Transaction[],
  type: Transaction['type'],
  todayISO: string,
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.type !== type || !t.recurring) continue;
    if (t.recurring.until && t.recurring.until < todayISO) continue;
    total += t.amount * MONTHLY_EQUIV[t.recurring.freq];
  }
  return total;
}
