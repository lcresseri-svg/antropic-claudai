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
 *
 * All arithmetic is done in UTC (parse the y-m-d explicitly, use the setUTC*
 * mutators). The previous version parsed the string as UTC midnight but mutated
 * with the LOCAL setters and read back via toISOString(): crossing a DST
 * boundary shifted the wall-clock vs UTC by an hour and rolled long-range dates
 * back by a day (e.g. a series on the 10th showed the 9th from 2027 onward).
 */
export function addPeriod(dateStr: string, freq: Freq): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if      (freq === 'daily')   dt.setUTCDate(dt.getUTCDate() + 1);
  else if (freq === 'weekly')  dt.setUTCDate(dt.getUTCDate() + 7);
  else if (freq === 'monthly') dt.setUTCMonth(dt.getUTCMonth() + 1);
  else                          dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  return dt.toISOString().slice(0, 10);
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
 * A recurring TEMPLATE that has moved past its own `until` bound: the series is
 * over but the template doc still lingers (future-dated, still flagged
 * recurring). This happens when:
 *   - the user edits a series and sets/lowers `until` below the template's next
 *     occurrence date, or
 *   - a series reaches its natural end and the catch-up / Cloud Function advanced
 *     the template one step past `until` without deleting it.
 *
 * Such a doc must NOT be shown as "Programmato", counted, or projected — and
 * should be cleaned up (see catchUpRecurring's `remove`).
 */
export function isExpiredTemplate(t: Transaction): boolean {
  return !t.projected && !!t.recurring?.until && t.date > t.recurring.until;
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
 * An EXPIRED template (advanced past its own `until`) is an ended series, not a
 * live planned movement.
 */
export function isPending(t: Transaction, todayISO: string): boolean {
  if (isExpiredTemplate(t)) return false;
  return !t.projected && t.date > todayISO;
}

/**
 * Expand a brand-new recurring template into the documents to actually store,
 * so a series whose start date is in the PAST counts as "done" immediately —
 * without waiting for the nightly catch-up Cloud Function. Mirrors that server
 * logic on the client and is type-agnostic (expense / income / investment /
 * transfer all behave the same).
 *
 * Returns, for a past-dated start:
 *   - one REALIZED instance per occurrence with date <= today (no `recurring`
 *     rule, stamped with `seriesId`), and
 *   - the TEMPLATE advanced to its next future occurrence (keeps `recurring`).
 * For a future-dated start it returns the template unchanged (a single
 * "previsto"). Non-recurring inputs are returned as-is.
 */
export function expandRecurringOnCreate<T extends Omit<Transaction, 'id'>>(
  base: T,
  todayISO: string,
): T[] {
  const rule = base.recurring;
  if (!rule) return [base];
  const seriesId = base.seriesId ?? base.date; // callers set seriesId for series
  const out: T[] = [];
  let date = base.date;
  let guard = 400;
  while (date <= todayISO && (!rule.until || date <= rule.until) && guard-- > 0) {
    // Realized occurrence: strip the recurring rule, keep the series link.
    const { recurring: _r, ...rest } = base;
    void _r;
    out.push({ ...(rest as T), seriesId, date });
    date = addPeriod(date, rule.freq);
  }
  // No past occurrence materialized → the series starts in the future: keep the
  // single template as a "previsto".
  if (out.length === 0) return [base];
  // Advance the template to its next future occurrence (unless the series ended).
  if (!rule.until || date <= rule.until) {
    out.push({ ...base, seriesId, date });
  }
  return out;
}

/**
 * Whether saving a transaction should IMMEDIATELY materialize a back-dated
 * series' past occurrences (via expandRecurringOnCreate).
 *
 * - Brand-new transaction            → true (no-op for non-recurring inputs).
 * - Converting a plain one-off        → true: a transaction with NO recurrence
 *   into a recurring series             rule and NO series link becomes a series;
 *                                       its missing months must be created right
 *                                       away, not left to the nightly catch-up.
 * - Editing an existing series/instance → false: those occurrences already exist,
 *   (template edit, or an instance        re-expanding here would duplicate them
 *    that's already part of a series)      (the catch-up handles real series).
 */
export function shouldExpandOnSave(
  editing: { recurring?: unknown; seriesId?: string } | null | undefined,
  isRecurring: boolean,
): boolean {
  if (!editing) return true;                          // brand-new
  if (!isRecurring) return false;                     // not (becoming) a series
  return !editing.recurring && !editing.seriesId;     // one-off → series conversion
}

/**
 * On-load catch-up: for every recurring template whose next occurrence date is
 * already due (<= today), produce the realized instances to create and the new
 * date to advance the template to (its first future occurrence). Mirrors the
 * nightly Cloud Function so nothing stays "Programmato" with a past/today date
 * once the user opens the app. Type-agnostic.
 *
 * Idempotent & race-safe: occurrences already materialized (an instance with the
 * same seriesId + date exists) are skipped, so it never duplicates what the
 * Cloud Function — or another device — already wrote.
 *
 * NON-DESTRUCTIVE: never deletes anything. A series that reaches its end is
 * advanced one step past `until`, turning its template into an *expired* doc
 * (kept in Firestore, hidden from lists/totals via isExpiredTemplate, still
 * resolvable for "edit the whole series"). Nothing is ever removed.
 */
export function catchUpRecurring(
  transactions: Transaction[],
  todayISO: string,
): {
  creates: Omit<Transaction, 'id'>[];
  advance: { id: string; date: string; seriesId: string }[];
} {
  // Occurrences already stored as realized instances (seriesId + date).
  const have = new Set<string>();
  for (const t of transactions) {
    if (t.seriesId && !t.recurring) have.add(`${t.seriesId}|${t.date}`);
  }
  const creates: Omit<Transaction, 'id'>[] = [];
  const advance: { id: string; date: string; seriesId: string }[] = [];
  for (const t of transactions) {
    const rule = t.recurring;
    if (!rule) continue;
    const seriesId = t.seriesId ?? t.id;
    // Already past its end: nothing left to materialize. Leave the (expired)
    // template untouched — never delete it.
    if (rule.until && t.date > rule.until) continue;
    if (t.date > todayISO) continue; // next occurrence still in the future → nothing due
    let date = t.date;
    let guard = 400;
    while (date <= todayISO && (!rule.until || date <= rule.until) && guard-- > 0) {
      const key = `${seriesId}|${date}`;
      if (!have.has(key)) {
        const { recurring: _r, id: _id, ...rest } = t;
        void _r; void _id;
        creates.push({ ...rest, seriesId, date });
        have.add(key);
      }
      date = addPeriod(date, rule.freq);
    }
    // Always advance the template to its next date — even if that is past `until`
    // (it then becomes an expired, hidden template). We never delete it.
    advance.push({ id: t.id, date, seriesId });
  }
  return { creates, advance };
}

/**
 * Editing a whole SERIES must apply to every already-recorded ("contabilizzata")
 * occurrence too — not only the template and its future projections. Given the
 * full transaction set, the template being edited, and the new template payload,
 * this returns the in-place updates for each recorded instance of the series.
 *
 * Each occurrence keeps its OWN identity and position in time — id, createdAt,
 * date and group link are preserved; only the content fields (type, description,
 * amount, category, account, …) are overwritten from the payload. The `recurring`
 * rule lives on the template only, so it is stripped from instances.
 *
 * NON-DESTRUCTIVE: every update is a content overwrite of the same doc id
 * (setDoc, same id), never a delete.
 */
export function seriesInstanceUpdates(
  all: Transaction[],
  template: Pick<Transaction, 'id' | 'seriesId'>,
  payload: Omit<Transaction, 'id'>,
): { id: string; data: Omit<Transaction, 'id'> }[] {
  const sid = template.seriesId ?? template.id;
  const updates: { id: string; data: Omit<Transaction, 'id'> }[] = [];
  for (const inst of all) {
    if (inst.recurring || inst.projected) continue;    // skip templates & virtual rows
    if (inst.id === template.id) continue;             // template written separately
    if ((inst.seriesId ?? inst.id) !== sid) continue;  // a different series
    updates.push({
      id: inst.id,
      data: {
        ...payload,
        date: inst.date,                 // keep the occurrence's own date
        seriesId: sid,                   // keep the series link
        recurring: undefined,            // instances are not templates
        groupId: inst.groupId,           // keep the occurrence's own group link
        createdAt: inst.createdAt ?? payload.createdAt,
      },
    });
  }
  return updates;
}

/**
 * DISSOLVE a series: the user turned OFF "ricorrente" while editing the whole
 * series. The series must stop and everything become plain, unlinked movements:
 *   - FUTURE occurrences (date > today) are DELETED ("le cose dopo");
 *   - PAST recorded occurrences (date ≤ today) are UNLINKED — they keep their own
 *     content/date but lose `seriesId` (and `recurring`), so they're normal
 *     movements with NO recurring badge and edit as single movements.
 * The edited template itself is written separately by the caller (as a normal
 * one-off). Virtual `projected` rows vanish on their own once the rule is gone.
 */
export function dissolveSeries(
  all: Transaction[],
  template: { id: string; seriesId: string },
  todayISO: string,
): { unlink: { id: string; data: Omit<Transaction, 'id'> }[]; remove: string[] } {
  const sid = template.seriesId;
  const unlink: { id: string; data: Omit<Transaction, 'id'> }[] = [];
  const remove: string[] = [];
  for (const t of all) {
    if (t.id === template.id) continue;          // template handled by the caller
    if (t.projected) continue;                   // virtual rows vanish on their own
    if ((t.seriesId ?? t.id) !== sid) continue;  // a different series
    if (t.date > todayISO) {
      remove.push(t.id);                         // future occurrence → delete
    } else {
      const { id: _id, recurring: _r, seriesId: _s, ...rest } = t;
      void _id; void _r; void _s;
      unlink.push({ id: t.id, data: { ...rest } }); // past → normal, unlinked
    }
  }
  return { unlink, remove };
}

/**
 * Sum of PLANNED (future, non-recurring) own-shares of a given type, dated
 * strictly after `todayISO` and up to `monthEndISO`. Recurring templates are
 * excluded — their upcoming occurrences are counted by upcomingRecurringThisMonth.
 */
export function upcomingPlannedThisMonth(
  transactions: Transaction[],
  todayISO: string,
  monthEndISO: string,
  type: Transaction['type'] = 'expense',
): number {
  let total = 0;
  for (const t of transactions) {
    if (t.type !== type) continue;
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
    if (isExpiredTemplate(t)) continue; // ended series whose template lingers past `until`
    total += t.amount * MONTHLY_EQUIV[t.recurring.freq];
  }
  return total;
}

/**
 * Sum of recurring occurrences of a given type strictly after `todayISO` and up
 * to `monthEndISO`. Represents known committed movements in the days that remain
 * in the current month. Includes a series whose first occurrence (the template's
 * own date) is itself still in the future this month.
 */
export function upcomingRecurringThisMonth(
  transactions: Transaction[],
  todayISO: string,
  monthEndISO: string,
  type: Transaction['type'] = 'expense',
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
    if (t.type !== type) continue;
    const rule = t.recurring!;
    if (rule.until && rule.until < todayISO) continue;
    // Start at the template's own date so a future-starting series counts its
    // first occurrence; fast-forward past any occurrence already realized (<= today).
    let d = t.date;
    let guard = 500;
    while (d <= todayISO && --guard > 0) d = addPeriod(d, rule.freq);
    let cap = 35; // guard against dense daily series
    while (d <= monthEndISO && (!rule.until || d <= rule.until) && --cap > 0) {
      total += t.amount;
      d = addPeriod(d, rule.freq);
    }
  }
  return total;
}
