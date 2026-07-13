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
 * MANAGED vs LEGACY: a document is managed when it carries a `valueEffect`
 * stamp — written atomically together with the settings update. Documents that
 * predate this feature (or arrive from CSV import / demo data) have no stamp:
 * they never contributed to currentValue, so their edits and deletions must
 * not touch it either. The transition rule is deterministic:
 *
 *   create                                → apply + stamp
 *   edit,   stamped                       → revert stamp, re-apply, restamp
 *   edit,   unstamped, was NOT investment → apply + stamp (became investment)
 *   edit,   unstamped, was investment     → stay unmanaged (legacy)
 *   delete, stamped                       → revert stamp
 *   delete, unstamped                     → nothing
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
  recurring?: unknown;
  projected?: boolean;
  valueDelta?: number;
}

export interface ValueRequest { category: string; delta: number }

/**
 * The currentValue change this document ASKS for, or null when it must not
 * touch the value: non-investments, recurring TEMPLATES (pointers, not flows),
 * projected rows, and malformed amounts.
 */
export function desiredValueDelta(t: TxValueView | null | undefined): ValueRequest | null {
  if (!t || t.type !== 'investment') return null;
  if (t.recurring || t.projected) return null;
  if (!t.category || typeof t.category !== 'string') return null;
  const amount = Number(t.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const override = Number(t.valueDelta);
  if (t.valueDelta != null && Number.isFinite(override)) {
    return { category: t.category, delta: r2(override) };
  }
  return { category: t.category, delta: r2(t.direction === 'out' ? -amount : amount) };
}

export type StampAction = 'set' | 'clear' | 'none';

export interface ValuePlan {
  /** Exact effect to undo first (from the stamp), if any. */
  revert: ValueRequest | null;
  /** New effect to apply (pre-clamp), if any. */
  request: ValueRequest | null;
  /** What to do with the document's valueEffect stamp. */
  stamp: StampAction;
}

/**
 * Plan the currentValue change for one document write.
 *
 * @param exists       the document already exists (edit/delete) vs create
 * @param priorType    existing document's `type` (undefined on create)
 * @param priorEffect  existing document's stamp (undefined/null = unmanaged)
 * @param next         the new document data; null = delete
 */
export function planValueChange(opts: {
  exists: boolean;
  priorType?: string;
  priorEffect?: AppliedValueEffect | null;
  next: TxValueView | null;
}): ValuePlan {
  const { exists, priorType, priorEffect, next } = opts;
  const desired = desiredValueDelta(next);
  const revert = priorEffect
    ? { category: priorEffect.category, delta: r2(-priorEffect.delta) }
    : null;

  // Delete: undo whatever was applied; nothing else.
  if (next === null) return { revert, request: null, stamp: 'none' };

  if (!exists) {
    // Create: apply + stamp when the new doc asks for an effect.
    return { revert: null, request: desired, stamp: desired ? 'set' : 'none' };
  }

  if (priorEffect) {
    // Managed doc: revert old, apply new (if still investment-like).
    return { revert, request: desired, stamp: desired ? 'set' : 'clear' };
  }

  // Unmanaged doc. A legacy investment stays unmanaged forever (applying on a
  // cosmetic edit would double-count history the user already reconciled by
  // hand). A doc that BECOMES an investment gets managed from now on.
  if (priorType !== 'investment' && desired) {
    return { revert: null, request: desired, stamp: 'set' };
  }
  return { revert: null, request: null, stamp: 'none' };
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
