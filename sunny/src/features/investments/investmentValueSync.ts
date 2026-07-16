/**
 * Controvalore sync — Firestore I/O. Ogni operazione di scrittura sulle
 * transazioni passa da qui quando può toccare il controvalore: documento/i e
 * `meta/settings.categories` vengono aggiornati in UNA transazione Firestore
 * (letture prima, scritture dopo), quindi:
 *
 *  - atomicità: stamp `valueEffect` e nuovo currentValue committano insieme;
 *  - idempotenza: lo stamp è riletto dentro la transazione — un retry o una
 *    doppia chiamata rivede lo stato reale e produce effetto netto nullo;
 *  - revert esatto su modifica/eliminazione (si annulla il delta APPLICATO).
 *
 * NESSUN FALLBACK per gli investimenti: se la transazione atomica fallisce
 * (offline compreso) l'errore viene PROPAGATO — non si salva nulla, la form
 * resta aperta e mostra Retry. Il degradare silenzioso a plain-write creava
 * stati incoerenti (movimento salvato, controvalore no). Le operazioni che non
 * toccano investimenti mantengono la storica scrittura semplice offline-safe.
 *
 * DATE FUTURE: un investimento "previsto" (data > oggi) NON aggiorna il
 * controvalore alla scrittura — viene marcato `valuePending: true` e
 * riconciliato UNA SOLA VOLTA quando diventa effettivo, dal reconciler
 * idempotente in fondo al file (richiamato all'avvio, come il catch-up delle
 * ricorrenti).
 */
import {
  collection, doc, writeBatch, runTransaction,
  DocumentReference, Transaction as FsTransaction, deleteField,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CategoryDef, Transaction, TransactionPatch, AppliedValueEffect } from '../../types';
import {
  planValueChange, applyValueChanges, ValueRequest, ValuePlan, desiredValueDelta,
} from './investmentValueCore';

type TxData = Omit<Transaction, 'id'>;

// Recursively drop `undefined` values — Firestore rejects writes that contain
// `undefined` anywhere, including nested objects (e.g. recurring.until).
function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(v => stripUndefined(v)) as T;
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T;
  }
  return obj;
}

const txCol = (uid: string) => collection(db, 'users', uid, 'transactions');
const txDoc = (uid: string, id: string) => doc(db, 'users', uid, 'transactions', id);
const settingsDoc = (uid: string) => doc(db, 'users', uid, 'meta', 'settings');

/** "Oggi" in Europe/Rome (YYYY-MM-DD) — the app's product timezone: both the
 *  pending cutoff and lastValueUpdate use it. */
export const romeTodayISO = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

/** Might this write ever require the controvalore machinery? Cheap pre-filter
 *  so pure-expense operations keep the historical plain-write path. */
const involvesInvestment = (datas: (TxData | TransactionPatch | null)[]): boolean =>
  datas.some(d => d != null && ('type' in d ? d.type === 'investment' : false));

/**
 * Execute the shared read→plan→write sequence inside a Firestore transaction.
 * `ops` describe the doc writes; plans are computed from the FRESH doc states.
 */
interface SyncOp {
  ref: DocumentReference;
  /** null = delete; otherwise the full new doc payload (create/overwrite). */
  data: TxData | null;
  /** true when ref points at a doc being created (skip the read). */
  isCreate: boolean;
}

/** Build the final payload for one op from its plan + apply results. */
function buildPayload(
  data: TxData,
  plan: ValuePlan,
  appliedChange: { category: string; applied: number } | null,
  now: number,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...stripUndefined(data) };
  // Never trust inherited bookkeeping on the payload — it's recomputed here.
  delete payload.valueEffect;
  delete payload.valuePending;
  if (plan.stamp === 'set' && appliedChange) {
    payload.valueEffect = {
      category: appliedChange.category,
      delta: appliedChange.applied,
      appliedAt: now,
    } satisfies AppliedValueEffect;
  }
  if (plan.pending) payload.valuePending = true;
  return payload;
}

async function runSyncTransaction(uid: string, ops: SyncOp[]): Promise<void> {
  const todayISO = romeTodayISO();
  await runTransaction(db, async (trx: FsTransaction) => {
    // ── Reads first ──────────────────────────────────────────────────────────
    const settingsRef = settingsDoc(uid);
    const settingsSnap = await trx.get(settingsRef);
    const categories: CategoryDef[] =
      (settingsSnap.data()?.categories as CategoryDef[] | undefined) ?? [];

    const plans: { op: SyncOp; plan: ValuePlan }[] = [];
    for (const op of ops) {
      let exists = false;
      let priorType: string | undefined;
      let priorEffect: AppliedValueEffect | null = null;
      let priorPending = false;
      if (!op.isCreate) {
        const snap = await trx.get(op.ref);
        exists = snap.exists();
        const d = snap.data() ?? {};
        priorType = d.type as string | undefined;
        priorEffect = (d.valueEffect as AppliedValueEffect | undefined) ?? null;
        priorPending = d.valuePending === true;
      }
      plans.push({
        op,
        plan: planValueChange({ exists, priorType, priorEffect, priorPending, next: op.data, todayISO }),
      });
    }

    // ── Compute: reverts first, then requests, sequentially clamped ─────────
    const changes: ValueRequest[] = [];
    const requestIndex: (number | null)[] = []; // per-plan index into `changes` of its request
    for (const { plan } of plans) {
      if (plan.revert) changes.push(plan.revert);
    }
    for (const { plan } of plans) {
      if (plan.request) { requestIndex.push(changes.length); changes.push(plan.request); }
      else requestIndex.push(null);
    }
    const result = applyValueChanges(categories, changes, todayISO);

    // ── Writes ───────────────────────────────────────────────────────────────
    const now = Date.now();
    plans.forEach(({ op, plan }, i) => {
      if (op.data === null) { trx.delete(op.ref); return; }
      const reqIdx = requestIndex[i];
      const appliedChange = plan.stamp === 'set' && reqIdx !== null ? result.applied[reqIdx] : null;
      trx.set(op.ref, buildPayload(op.data, plan, appliedChange, now));
    });

    if (result.changed && settingsSnap.exists()) {
      trx.update(settingsRef, { categories: stripUndefined(result.categories) });
    }
  });
}

/** Plain (offline-safe) batch write: NON-investment ops only — docs are
 *  written as-is, the controvalore is never involved. */
async function plainWrite(uid: string, ops: SyncOp[]): Promise<void> {
  const batch = writeBatch(db);
  for (const op of ops) {
    if (op.data === null) batch.delete(op.ref);
    else {
      const payload: Record<string, unknown> = { ...stripUndefined(op.data) };
      delete payload.valueEffect;
      delete payload.valuePending;
      batch.set(op.ref, payload);
    }
  }
  await batch.commit();
}

async function runOps(uid: string, ops: SyncOp[], needsSync: boolean): Promise<void> {
  if (ops.length === 0) return;
  if (!needsSync) { await plainWrite(uid, ops); return; }
  // Investments: atomic or NOTHING. Any failure (offline included) propagates
  // to the caller so the form can stay open and offer Retry — a movement must
  // never land without its controvalore effect.
  await runSyncTransaction(uid, ops);
}

// ── Public operations (used by useTransactions) ───────────────────────────────

const CHUNK = 180; // stays well inside the 500-writes-per-transaction limit

/** Create N documents (auto-id), applying + stamping investment effects. */
export async function createTransactionsSynced(
  uid: string,
  txs: TxData[],
  opts?: { syncInvestments?: boolean },
): Promise<void> {
  const sync = opts?.syncInvestments ?? true;
  for (let i = 0; i < txs.length; i += CHUNK) {
    const slice = txs.slice(i, i + CHUNK);
    const ops: SyncOp[] = slice.map(data => ({ ref: doc(txCol(uid)), data, isCreate: true }));
    await runOps(uid, ops, sync && involvesInvestment(slice));
  }
}

/** Overwrite ONE document in place (same id), reverting/reapplying its effect. */
export async function replaceTransactionSynced(uid: string, id: string, data: TxData): Promise<void> {
  const ref = txDoc(uid, id);
  // The prior state may be an investment even when the new one isn't: the
  // pre-filter must stay conservative, so sync whenever either side could be.
  await runOps(uid, [{ ref, data, isCreate: false }], true);
}

/** Delete documents, reverting stamped effects. */
export async function deleteTransactionsSynced(uid: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const ops: SyncOp[] = ids.slice(i, i + CHUNK)
      .map(id => ({ ref: txDoc(uid, id), data: null, isCreate: false }));
    await runOps(uid, ops, true);
  }
}

/** Group restructure: delete + create in one atomic move. */
export async function replaceGroupSynced(uid: string, deleteIds: string[], create: TxData[]): Promise<void> {
  const ops: SyncOp[] = [
    ...deleteIds.map(id => ({ ref: txDoc(uid, id), data: null as TxData | null, isCreate: false })),
    ...create.map(data => ({ ref: doc(txCol(uid)), data: data as TxData | null, isCreate: true })),
  ];
  await runOps(uid, ops, true);
}

/**
 * Bulk field patch (category/account/type): read each doc, merge, resync.
 * `mustSync` (computed by the caller from its local data): TRUE when the patch
 * can touch an investment → atomic path only, failures propagate. FALSE →
 * plain offline-safe update (historical behaviour for pure expense edits).
 */
export async function patchTransactionsSynced(
  uid: string,
  ids: string[],
  patch: TransactionPatch,
  opts?: { mustSync?: boolean },
): Promise<void> {
  const clean = stripUndefined(patch);
  const mustSync = opts?.mustSync ?? true;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    if (!mustSync) {
      const batch = writeBatch(db);
      slice.forEach(id => batch.update(txDoc(uid, id), clean));
      await batch.commit();
      continue;
    }
    const todayISO = romeTodayISO();
    await runTransaction(db, async (trx) => {
      const settingsRef = settingsDoc(uid);
      const settingsSnap = await trx.get(settingsRef);
      const categories: CategoryDef[] =
        (settingsSnap.data()?.categories as CategoryDef[] | undefined) ?? [];

      const rows: { ref: DocumentReference; data: TxData; plan: ValuePlan }[] = [];
      for (const id of slice) {
        const ref = txDoc(uid, id);
        const snap = await trx.get(ref);
        if (!snap.exists()) continue;
        const prior = snap.data() as TxData & { valueEffect?: AppliedValueEffect; valuePending?: boolean };
        const next = { ...prior, ...clean } as TxData;
        rows.push({
          ref,
          data: next,
          plan: planValueChange({
            exists: true,
            priorType: prior.type,
            priorEffect: prior.valueEffect ?? null,
            priorPending: prior.valuePending === true,
            next,
            todayISO,
          }),
        });
      }

      const changes: ValueRequest[] = [];
      const requestIndex: (number | null)[] = [];
      for (const r of rows) if (r.plan.revert) changes.push(r.plan.revert);
      for (const r of rows) {
        if (r.plan.request) { requestIndex.push(changes.length); changes.push(r.plan.request); }
        else requestIndex.push(null);
      }
      const result = applyValueChanges(categories, changes, todayISO);

      const now = Date.now();
      rows.forEach((r, i) => {
        const reqIdx = requestIndex[i];
        const appliedChange = r.plan.stamp === 'set' && reqIdx !== null ? result.applied[reqIdx] : null;
        trx.set(r.ref, buildPayload(r.data, r.plan, appliedChange, now));
      });
      if (result.changed && settingsSnap.exists()) {
        trx.update(settingsRef, { categories: stripUndefined(result.categories) });
      }
    });
  }
}

// ── Pending reconciler ────────────────────────────────────────────────────────

const RECONCILE_CHUNK = 40;

/**
 * Apply the controvalore effect of investments that were future-dated at write
 * time and are now DUE (valuePending && date <= today, Europe/Rome).
 *
 * Called on app load with the ids the client sees as pending (like the
 * recurring catch-up). Idempotent & race-safe: each doc is re-read INSIDE the
 * transaction — if another device already reconciled it (stamp present /
 * marker gone) or the user re-dated it to the future, it is skipped. The stamp
 * and the settings update commit atomically, so the effect can never be
 * applied twice nor half-applied.
 */
export async function reconcilePendingInvestments(uid: string, candidateIds: string[]): Promise<void> {
  if (candidateIds.length === 0) return;
  const todayISO = romeTodayISO();
  for (let i = 0; i < candidateIds.length; i += RECONCILE_CHUNK) {
    const slice = candidateIds.slice(i, i + RECONCILE_CHUNK);
    await runTransaction(db, async (trx) => {
      const settingsRef = settingsDoc(uid);
      const settingsSnap = await trx.get(settingsRef);
      const categories: CategoryDef[] =
        (settingsSnap.data()?.categories as CategoryDef[] | undefined) ?? [];

      const due: { ref: DocumentReference; request: ValueRequest }[] = [];
      for (const id of slice) {
        const ref = txDoc(uid, id);
        const snap = await trx.get(ref);
        if (!snap.exists()) continue;
        const d = snap.data() as TxData & { valueEffect?: AppliedValueEffect; valuePending?: boolean };
        if (d.valuePending !== true || d.valueEffect) continue;  // already handled elsewhere
        const request = desiredValueDelta(d, todayISO);          // null while still future
        if (!request) continue;
        due.push({ ref, request });
      }
      if (due.length === 0) return;

      const result = applyValueChanges(categories, due.map(d => d.request), todayISO);
      const now = Date.now();
      due.forEach((d, idx) => {
        trx.update(d.ref, {
          valueEffect: {
            category: result.applied[idx].category,
            delta: result.applied[idx].applied,
            appliedAt: now,
          } satisfies AppliedValueEffect,
          valuePending: deleteField(),
        });
      });
      if (result.changed && settingsSnap.exists()) {
        trx.update(settingsRef, { categories: stripUndefined(result.categories) });
      }
    });
  }
}
