import { Transaction, Freq, ownShare } from '../types';

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
 * Any real document dated in the future is a PLANNED ("previsto") movement:
 * shown as "Programmato", excluded from realized totals/balances, folded into
 * forecasts. This covers ALL types (expense, income, investment, transfer) and
 * ALL flavours (one-off, shared, future-starting recurring series).
 *
 * Recurring templates with a past/today date are NOT pending — they represent a
 * started series whose first occurrence has already been realized.
 * Synthetic projected rows (projected: true) are display-only and never pending.
 */
export function isPending(t: Transaction, todayISO: string): boolean {
  return !t.projected && t.date > todayISO;
}

/**
 * Sum of PLANNED (future, non-recurring) expense own-shares dated strictly after
 * `todayISO` and up to `monthEndISO`. Recurring templates are excluded — their
 * upcoming occurrences are already counted by the separate upcomingRecurring loop.
 */
export function upcomingPlannedThisMonth(
  transactions: Transaction[],
  todayISO: string,
  monthEndISO: string,
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    if (t.recurring) continue; // handled by upcomingRecurring loop, not here
    if (!isPending(t, todayISO)) continue;
    if (t.seriesId) continue; // realized recurring instances are not "planned"
    if (t.date > monthEndISO) continue;
    total += ownShare(t);
  }
  return total;
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

/**
 * Sum of recurring expense occurrences strictly after `todayISO` and up to
 * `monthEndISO`. Represents known committed spending in the days that remain
 * in the current month. Used as a floor when projecting end-of-month expenses.
 */
export function upcomingRecurringThisMonth(
  transactions: Transaction[],
  todayISO: string,
  monthEndISO: string,
): number {
  // Keep only the latest template per logical series.
  const seriesMap = new Map<string, Transaction>();
  for (const t of transactions) {
    if (!t.recurring) continue;
    const key = `${t.description}||${t.type}`;
    const prev = seriesMap.get(key);
    if (!prev || t.date > prev.date) seriesMap.set(key, t);
  }
  let total = 0;
  for (const [, t] of seriesMap) {
    if (t.type !== 'expense') continue;
    const rule = t.recurring!;
    if (rule.until && rule.until < todayISO) continue;
    let d = addPeriod(t.date, rule.freq);
    let guard = 500;
    // Fast-forward to the first occurrence strictly after today.
    while (d <= todayISO && --guard > 0) d = addPeriod(d, rule.freq);
    let cap = 35; // guard against dense daily series
    while (d <= monthEndISO && (!rule.until || d <= rule.until) && --cap > 0) {
      total += t.amount;
      d = addPeriod(d, rule.freq);
    }
  }
  return total;
}
