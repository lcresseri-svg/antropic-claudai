/**
 * Controvalore sync — PURE decision logic (no Firestore).
 *
 * Every managed investment movement keeps the category's manually-tracked
 * market value (CategoryDef.currentValue) aligned:
 *
 *   versamento (direction assente/'in')  → currentValue += amount
 *   prelievo   (direction 'out')         → currentValue −= amount (mai < 0)
 *   valueDelta esplicito sul documento   → vince su ±amount
 *
 * MANAGED vs LEGACY vs PENDING:
 *  - MANAGED: the doc carries a `valueEffect` stamp — written atomically with
 *    the settings update. Its edits/deletes revert exactly what was applied.
 *  - LEGACY/unmanaged: docs that predate the feature (or CSV import / demo
 *    data). No stamp: they never contributed to currentValue, so their edits
 *    and deletions must not touch it either.
 *  - PENDING: a FUTURE-dated investment must NOT move the value at write time.
 *    It is stamped `valuePending: true` and the idempotent reconciler applies
 *    the effect EXACTLY ONCE when the date becomes due (see
 *    reconcilePendingInvestments in investmentValueSync).
 *
 * Transition rules (deterministic):
 *
 *   create, due                          → apply + stamp
 *   create, future-dated                 → no effect + valuePending
 *   edit,   stamped, next due            → revert stamp, re-apply, restamp
 *   edit,   stamped, next future         → revert stamp, mark valuePending
 *   edit,   pending, next due            → apply + stamp, clear valuePending
 *   edit,   pending, next future        → stay pending
 *   edit,   unstamped, was NOT investment → apply/pend (became investment)
 *   edit,   unstamped, was investment    → stay unmanaged (legacy)
 *   delete, stamped                      → revert stamp
 *   delete, otherwise                    → nothing
 *
 * Idempotenza: the stamp records the delta ACTUALLY applied (post-clamp), so
 * re-running an edit reverts exactly what was applied and re-applies the same
 * request — net zero. A create is atomic with its stamp, so it can never be
 * counted twice.
 */
import { CategoryDef, AppliedValueEffect } from '../../types';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The subset of Transaction the planner needs (works on raw Firestore data). */
export interface TxValueView {
  type?: string;
  amount?: number;
  direction?: 'in' | 'out';
  category?: string;
  date?: string;
  recurring?: unknown;
  projected?: boolean;
  valueDelta?: number;
}

export interface ValueRequest { category: string; delta: number }

/** True when the doc is an investment FLOW view (not a template/projection)
 *  that will move the controvalore now or when due. */
function isValueFlow(t: TxValueView | null | undefined): t is TxValueView {
  if (!t || t.type !== 'investment') return false;
  if (t.recurring || t.projected) return false;
  if (!t.category || typeof t.category !== 'string') return false;
  const amount = Number(t.amount);
  return Number.isFinite(amount) && amount > 0;
}

/** A future-dated investment flow: its effect must wait for the reconciler. */
export function isFutureFlow(t: TxValueView | null | undefined, todayISO: string): boolean {
  return isValueFlow(t) && typeof t.date === 'string' && t.date > todayISO;
}

/**
 * The currentValue change this document ASKS for, or null when it must not
 * touch the value: non-investments, recurring TEMPLATES (pointers, not flows),
 * projected rows, malformed amounts — and FUTURE-dated flows (they get a
 * valuePending marker instead; the reconciler applies them once due).
 */
export function desiredValueDelta(
  t: TxValueView | null | undefined,
  todayISO?: string,
): ValueRequest | null {
  if (!isValueFlow(t)) return null;
  if (todayISO && isFutureFlow(t, todayISO)) return null;
  const amount = Number(t.amount);
  const override = Number(t.valueDelta);
  if (t.valueDelta != null && Number.isFinite(override)) {
    return { category: t.category!, delta: r2(override) };
  }
  return { category: t.category!, delta: r2(t.direction === 'out' ? -amount : amount) };
}

export type StampAction = 'set' | 'clear' | 'none';

export interface ValuePlan {
  /** Exact effect to undo first (from the stamp), if any. */
  revert: ValueRequest | null;
  /** New effect to apply (pre-clamp), if any. */
  request: ValueRequest | null;
  /** What to do with the document's valueEffect stamp. */
  stamp: StampAction;
  /** TRUE → write `valuePending: true` on the doc (future-dated flow). */
  pending: boolean;
}

/**
 * Plan the currentValue change for one document write.
 *
 * @param exists       the document already exists (edit/delete) vs create
 * @param priorType    existing document's `type` (undefined on create)
 * @param priorEffect  existing document's stamp (undefined/null = unmanaged)
 * @param priorPending existing document's valuePending marker
 * @param next         the new document data; null = delete
 * @param todayISO     "today" — flows dated after it stay pending
 */
export function planValueChange(opts: {
  exists: boolean;
  priorType?: string;
  priorEffect?: AppliedValueEffect | null;
  priorPending?: boolean;
  next: TxValueView | null;
  todayISO: string;
}): ValuePlan {
  const { exists, priorType, priorEffect, priorPending, next, todayISO } = opts;
  const desired = desiredValueDelta(next, todayISO);
  const nextPending = next !== null && isFutureFlow(next, todayISO);
  const revert = priorEffect
    ? { category: priorEffect.category, delta: r2(-priorEffect.delta) }
    : null;

  // Delete: undo whatever was applied; nothing else.
  if (next === null) return { revert, request: null, stamp: 'none', pending: false };

  if (!exists) {
    // Create: apply + stamp when due; mark pending when future-dated.
    return { revert: null, request: desired, stamp: desired ? 'set' : 'none', pending: nextPending };
  }

  if (priorEffect) {
    // Managed doc: revert old, apply new (if still investment-like and due).
    return { revert, request: desired, stamp: desired ? 'set' : 'clear', pending: nextPending };
  }

  if (priorPending) {
    // Pending doc: never applied anything. Apply now if due, else stay pending.
    return { revert: null, request: desired, stamp: desired ? 'set' : 'none', pending: nextPending };
  }

  // Unmanaged doc. A legacy investment stays unmanaged forever (applying on a
  // cosmetic edit would double-count history the user already reconciled by
  // hand). A doc that BECOMES an investment gets managed from now on.
  if (priorType !== 'investment' && (desired || nextPending)) {
    return { revert: null, request: desired, stamp: desired ? 'set' : 'none', pending: nextPending };
  }
  return { revert: null, request: null, stamp: 'none', pending: false };
}

export interface AppliedChange {
  category: string;
  /** Delta actually applied after the ≥ 0 clamp. */
  applied: number;
}

export interface ApplyResult {
  categories: CategoryDef[];
  /** One entry per input change, in order (applied = 0 for unknown categories). */
  applied: AppliedChange[];
  /** True when at least one currentValue changed. */
  changed: boolean;
}

/**
 * Apply an ordered list of value changes to the settings categories array.
 * Sequential: each change sees the values left by the previous one (correct
 * clamping when one run carries several withdrawals). Missing currentValue
 * starts from 0 (explicit product rule). Only `kind === 'investment'`
 * categories are touched; unknown ids apply 0. `lastValueUpdate` is stamped on
 * every touched category. initialBalance / tfrAmount are never modified.
 */
export function applyValueChanges(
  categories: CategoryDef[],
  changes: ValueRequest[],
  todayISO: string,
): ApplyResult {
  const next = categories.map(c => ({ ...c }));
  const byId = new Map(next.map(c => [c.id, c]));
  const applied: AppliedChange[] = [];
  let changed = false;

  for (const change of changes) {
    const cat = byId.get(change.category);
    if (!cat || cat.kind !== 'investment' || !Number.isFinite(change.delta) || change.delta === 0) {
      applied.push({ category: change.category, applied: 0 });
      continue;
    }
    const before = typeof cat.currentValue === 'number' ? cat.currentValue : 0;
    const after = r2(Math.max(0, before + change.delta));
    const actualDelta = r2(after - before);
    applied.push({ category: change.category, applied: actualDelta });
    // A fully-clamped no-op (e.g. withdrawal on a 0/absent value) must not
    // materialize an explicit currentValue: the display keeps its fallback.
    if (actualDelta !== 0) {
      cat.currentValue = after;
      cat.lastValueUpdate = todayISO;
      changed = true;
    }
  }

  return { categories: next, applied, changed };
}
