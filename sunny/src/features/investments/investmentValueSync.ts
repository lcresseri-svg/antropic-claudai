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
 * OFFLINE: le transazioni Firestore richiedono il server. Quando il browser è
 * offline l'operazione dell'utente non va persa: si degrada alla scrittura
 * semplice in coda (come prima di questa feature), SENZA stamp — il documento
 * resta "unmanaged" come i dati legacy e il controvalore non viene toccato.
 */
import {
  collection, doc, writeBatch, runTransaction,
  DocumentReference, Transaction as FsTransaction,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CategoryDef, Transaction, TransactionPatch, AppliedValueEffect } from '../../types';
import {
  planValueChange, applyValueChanges, ValueRequest, ValuePlan,
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

const todayISO = () => new Date().toISOString().slice(0, 10);

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

function warnDegraded(op: string, err?: unknown): void {
  console.warn(`investmentValueSync: ${op} degraded to plain write (offline/error)`,
    (err as { code?: string })?.code ?? '');
}

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

async function runSyncTransaction(uid: string, ops: SyncOp[]): Promise<void> {
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
      if (!op.isCreate) {
        const snap = await trx.get(op.ref);
        exists = snap.exists();
        const d = snap.data() ?? {};
        priorType = d.type as string | undefined;
        priorEffect = (d.valueEffect as AppliedValueEffect | undefined) ?? null;
      }
      plans.push({ op, plan: planValueChange({ exists, priorType, priorEffect, next: op.data }) });
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
    const result = applyValueChanges(categories, changes, todayISO());

    // ── Writes ───────────────────────────────────────────────────────────────
    const now = Date.now();
    plans.forEach(({ op, plan }, i) => {
      if (op.data === null) { trx.delete(op.ref); return; }
      const payload: Record<string, unknown> = { ...stripUndefined(op.data) };
      delete payload.valueEffect; // never trust an inherited stamp on the payload
      const reqIdx = requestIndex[i];
      if (plan.stamp === 'set' && reqIdx !== null) {
        const appliedChange = result.applied[reqIdx];
        payload.valueEffect = {
          category: appliedChange.category,
          delta: appliedChange.applied,
          appliedAt: now,
        } satisfies AppliedValueEffect;
      }
      trx.set(op.ref, payload);
    });

    if (result.changed && settingsSnap.exists()) {
      trx.update(settingsRef, { categories: stripUndefined(result.categories) });
    }
  });
}

/** Plain (offline-safe) batch fallback: docs written unmanaged, value untouched. */
async function plainWrite(uid: string, ops: SyncOp[]): Promise<void> {
  const batch = writeBatch(db);
  for (const op of ops) {
    if (op.data === null) batch.delete(op.ref);
    else {
      const payload: Record<string, unknown> = { ...stripUndefined(op.data) };
      delete payload.valueEffect;
      batch.set(op.ref, payload);
    }
  }
  await batch.commit();
}

async function runOps(uid: string, ops: SyncOp[], needsSync: boolean, opName: string): Promise<void> {
  if (ops.length === 0) return;
  if (!needsSync) { await plainWrite(uid, ops); return; }
  if (offline()) { warnDegraded(opName); await plainWrite(uid, ops); return; }
  try {
    await runSyncTransaction(uid, ops);
  } catch (err) {
    // Never lose the user's movement: fall back to the historical plain write
    // (unmanaged, controvalore untouched — same as legacy data).
    warnDegraded(opName, err);
    await plainWrite(uid, ops);
  }
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
    await runOps(uid, ops, sync && involvesInvestment(slice), 'create');
  }
}

/** Overwrite ONE document in place (same id), reverting/reapplying its effect. */
export async function replaceTransactionSynced(uid: string, id: string, data: TxData): Promise<void> {
  const ref = txDoc(uid, id);
  // The prior state may be an investment even when the new one isn't: the
  // pre-filter must stay conservative, so sync whenever either side could be.
  await runOps(uid, [{ ref, data, isCreate: false }], true, 'edit');
}

/** Delete documents, reverting stamped effects. */
export async function deleteTransactionsSynced(uid: string, ids: string[]): Promise<void> {
  for (let i = 0; i < ids.length; i += CHUNK) {
    const ops: SyncOp[] = ids.slice(i, i + CHUNK)
      .map(id => ({ ref: txDoc(uid, id), data: null, isCreate: false }));
    await runOps(uid, ops, true, 'delete');
  }
}

/** Group restructure: delete + create in one atomic move. */
export async function replaceGroupSynced(uid: string, deleteIds: string[], create: TxData[]): Promise<void> {
  const ops: SyncOp[] = [
    ...deleteIds.map(id => ({ ref: txDoc(uid, id), data: null as TxData | null, isCreate: false })),
    ...create.map(data => ({ ref: doc(txCol(uid)), data: data as TxData | null, isCreate: true })),
  ];
  await runOps(uid, ops, true, 'replaceGroup');
}

/** Bulk field patch (category/account/type): read each doc, merge, resync. */
export async function patchTransactionsSynced(uid: string, ids: string[], patch: TransactionPatch): Promise<void> {
  const clean = stripUndefined(patch);
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    if (offline()) {
      warnDegraded('patch');
      const batch = writeBatch(db);
      slice.forEach(id => batch.update(txDoc(uid, id), clean));
      await batch.commit();
      continue;
    }
    try {
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
          const prior = snap.data() as TxData & { valueEffect?: AppliedValueEffect };
          const next = { ...prior, ...clean } as TxData;
          rows.push({
            ref,
            data: next,
            plan: planValueChange({
              exists: true,
              priorType: prior.type,
              priorEffect: prior.valueEffect ?? null,
              next,
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
        const result = applyValueChanges(categories, changes, todayISO());

        const now = Date.now();
        rows.forEach((r, i) => {
          const payload: Record<string, unknown> = { ...stripUndefined(r.data) };
          delete payload.valueEffect;
          const reqIdx = requestIndex[i];
          if (r.plan.stamp === 'set' && reqIdx !== null) {
            const appliedChange = result.applied[reqIdx];
            payload.valueEffect = {
              category: appliedChange.category,
              delta: appliedChange.applied,
              appliedAt: now,
            } satisfies AppliedValueEffect;
          }
          trx.set(r.ref, payload);
        });
        if (result.changed && settingsSnap.exists()) {
          trx.update(settingsRef, { categories: stripUndefined(result.categories) });
        }
      });
    } catch (err) {
      warnDegraded('patch', err);
      const batch = writeBatch(db);
      slice.forEach(id => batch.update(txDoc(uid, id), clean));
      await batch.commit();
    }
  }
}
