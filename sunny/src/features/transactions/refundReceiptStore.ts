/**
 * Atomic refund receipts, with injected Firestore (no Firebase initialization).
 * Each source has an authoritative allocation control. Legacy baseline queries
 * are only used when the transaction finds that control absent; competing first
 * writers conflict on the same control document and retry against its new value.
 */
import {
  collection, doc, getDocFromServer, getDocsFromServer, query, runTransaction, where,
  type Firestore, type Transaction as FirestoreTransaction,
} from 'firebase/firestore';
import { grossOwnShare, type Transaction } from '../../types';
import {
  allocateRefundCents, isRefundableSource, MAX_REFUND_SOURCES, REFUND_GAIN_CATEGORY,
  refundAllocationRowId, refundGroupIdOf, toRefundCents, type RefundReceiptDraft,
} from '../../shared/multiRefunds';

export type { RefundReceiptDraft } from '../../shared/multiRefunds';
export interface RefundControl { allocatedCents: number; revision: number; gainOnlyReceipts?: number }
interface RefundReceiptHeader { expenseIds: string[]; rowIds: string[]; revision: number }
type TxData = Omit<Transaction, 'id'>;
const txRef = (db: Firestore, uid: string, id: string) => doc(db, 'users', uid, 'transactions', id);
const controlRef = (db: Firestore, uid: string, id: string) => doc(db, 'users', uid, 'refundControls', id);
const headerRef = (db: Firestore, uid: string, id: string) => doc(db, 'users', uid, 'refundReceipts', id);
const unique = (ids: string[]) => [...new Set(ids)];
function assertId(id: string): void {
  if (!id || id.length > 128 || id.includes('/')) throw new Error('Identificativo del rimborso non valido.');
}
function assertDraft(draft: RefundReceiptDraft): void {
  assertId(draft.receiptId);
  if (!draft.expenseIds.length || draft.expenseIds.length > MAX_REFUND_SOURCES || unique(draft.expenseIds).length !== draft.expenseIds.length) {
    throw new Error(`Seleziona da 1 a ${MAX_REFUND_SOURCES} spese diverse.`);
  }
  draft.expenseIds.forEach(assertId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !draft.account || (draft.notes?.length ?? 0) > 2000 || toRefundCents(draft.amount) <= 0) {
    throw new Error('Controlla importo, data, conto e nota.');
  }
}
function clean(data: Record<string, unknown>): Record<string, unknown> {
  const { id: _, refundedTotal: _derived, projected: _projected, cashDelta: _cash, ...rest } = data;
  return Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));
}
function controlFrom(data: unknown, baseline: number): RefundControl {
  if (!data) return { allocatedCents: baseline, revision: 0 };
  const value = data as RefundControl;
  if (!Number.isSafeInteger(value.allocatedCents) || value.allocatedCents < 0 || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error('Controllo rimborso non valido. Aggiorna i dati e riprova.');
  }
  return value;
}
async function legacyBaselines(db: Firestore, uid: string, ids: string[]): Promise<Map<string, number>> {
  const entries = await Promise.all(ids.map(async id => {
    const snapshot = await getDocsFromServer(query(collection(db, 'users', uid, 'transactions'), where('refundOf', '==', id)));
    return [id, snapshot.docs.reduce((sum, row) => {
      const data = row.data();
      return data.type === 'refund' && !data.projected ? sum + toRefundCents(data.amount) : sum;
    }, 0)] as const;
  }));
  return new Map(entries);
}
const sameIds = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);

/** Called by ordinary financial writers after reading the source and BEFORE any writes. */
export async function assertRefundSourceMutation(
  db: Firestore, uid: string, before: Transaction, next: TxData | null, transaction: FirestoreTransaction,
): Promise<void> {
  if (before.type !== 'expense') return;
  const snap = await transaction.get(controlRef(db, uid, before.id));
  const { allocatedCents, gainOnlyReceipts } = controlFrom(snap.data(), 0);
  if (!allocatedCents && !gainOnlyReceipts) return;
  const source = next && { ...next, id: before.id };
  if (!source || !isRefundableSource(source) || toRefundCents(grossOwnShare(source)) < Math.max(1, allocatedCents)) {
    throw new Error('La spesa è collegata a rimborsi: modifica o elimina prima il rimborso.');
  }
}

/** Saves the whole receipt, optionally replacing a legacy single refund in the same transaction. */
export async function saveRefundReceipt(db: Firestore, uid: string, draft: RefundReceiptDraft, legacyRefundId?: string): Promise<void> {
  assertDraft(draft);
  const receiptRef = headerRef(db, uid, draft.receiptId);
  const preflight = (await getDocFromServer(receiptRef)).data() as RefundReceiptHeader | undefined;
  if (legacyRefundId && (legacyRefundId !== draft.receiptId || draft.expenseIds.length !== 1)) {
    throw new Error('Identificativo dello storno non valido.');
  }
  const legacyRef = legacyRefundId ? txRef(db, uid, legacyRefundId) : undefined;
  const legacy = legacyRef && !preflight ? (await getDocFromServer(legacyRef)).data() : undefined;
  const allIds = unique([...draft.expenseIds, ...(preflight?.expenseIds ?? []),
    ...(legacy?.refundOf ? [legacy.refundOf as string] : [])]);
  const baselines = await legacyBaselines(db, uid, allIds);
  await runTransaction(db, async trx => {
    const headerSnap = await trx.get(receiptRef);
    const header = headerSnap.data() as RefundReceiptHeader | undefined;
    if (header && !sameIds(header.expenseIds, preflight?.expenseIds ?? (legacyRefundId ? draft.expenseIds : []))) throw new Error('Questo rimborso è cambiato. Riaprilo e riprova.');
    const oldRows = await Promise.all((header?.rowIds ?? []).map(async id => {
      const snap = await trx.get(txRef(db, uid, id));
      if (!snap.exists()) throw new Error('Una parte del rimborso è assente. Aggiorna i dati.');
      const row = { ...snap.data(), id: snap.id } as Transaction;
      if (refundGroupIdOf(row) !== draft.receiptId) throw new Error('Collegamento del rimborso non valido.');
      return row;
    }));
    if (legacyRef && !header) {
      const snapshot = await trx.get(legacyRef);
      const row = snapshot.data() as TxData | undefined;
      if (!row || row.type !== 'refund' || !row.refundOf || row.refundGroupId || row.refundOf !== legacy?.refundOf) {
        throw new Error('Lo storno è cambiato. Riaprilo e riprova.');
      }
      oldRows.push({ ...row, id: snapshot.id });
    }
    if (header && sameIds(header.expenseIds, draft.expenseIds)
      && oldRows.reduce((sum, row) => sum + toRefundCents(row.amount), 0) === toRefundCents(draft.amount)
      && oldRows.every(row => row.date === draft.date && row.account === draft.account && (row.notes ?? '') === (draft.notes?.trim() ?? ''))) return;

    const sources = new Map<string, Transaction>();
    const controls = new Map<string, RefundControl>();
    for (const id of allIds) {
      const [source, control] = await Promise.all([trx.get(txRef(db, uid, id)), trx.get(controlRef(db, uid, id))]);
      if (source.exists()) sources.set(id, { ...source.data(), id } as Transaction);
      controls.set(id, controlFrom(control.data(), baselines.get(id) ?? 0));
    }
    const oldBySource = new Map<string, number>();
    for (const row of oldRows) if (row.type === 'refund' && row.refundOf) oldBySource.set(row.refundOf, (oldBySource.get(row.refundOf) ?? 0) + toRefundCents(row.amount));
    const available = draft.expenseIds.map(id => {
      const source = sources.get(id);
      if (!source || !isRefundableSource(source) || toRefundCents(grossOwnShare(source)) === 0) throw new Error('Una spesa è stata eliminata o modificata. Aggiorna la selezione.');
      const other = controls.get(id)!.allocatedCents - (oldBySource.get(id) ?? 0);
      if (other < 0) throw new Error('Controllo rimborso incoerente. Aggiorna i dati.');
      return { expenseId: id, availableCents: toRefundCents(grossOwnShare(source)) - other };
    });
    const allocation = allocateRefundCents(available, toRefundCents(draft.amount));
    const createdAt = oldRows[0]?.createdAt ?? Date.now();
    const common = { date: draft.date, account: draft.account, notes: draft.notes?.trim() || undefined,
      refundGroupId: draft.receiptId, createdAt };
    const rows: { id: string; data: Record<string, unknown> }[] = allocation.allocations.filter(a => a.allocatedCents > 0).map(a => {
      const source = sources.get(a.expenseId)!;
      return { id: refundAllocationRowId(draft.receiptId, a.expenseId), data: clean({ ...common, type: 'refund', refundOf: a.expenseId,
        description: `Storno · ${source.description || source.category}`.slice(0, 500), category: source.category, amount: a.allocatedCents / 100 }) };
    });
    if (allocation.gainCents > 0) rows.push({ id: `${draft.receiptId}__gain`, data: clean({ ...common,
      type: 'income', description: 'Guadagno da rimborso', category: REFUND_GAIN_CATEGORY, amount: allocation.gainCents / 100 }) });
    // Read every target to reject collisions and ensure all reads precede writes.
    for (const row of rows) {
      const existing = await trx.get(txRef(db, uid, row.id));
      if (existing.exists() && !(header?.rowIds.includes(row.id))) throw new Error('Identificativo ricevuta già utilizzato.');
    }
    const newBySource = new Map(allocation.allocations.map(a => [a.expenseId, a.allocatedCents]));
    const oldGainOnlySource = header?.expenseIds.length === 1 && oldRows.every(row => row.type === 'income')
      ? header.expenseIds[0] : undefined;
    const newGainOnlySource = allocation.refundedCents === 0 ? draft.expenseIds[0] : undefined;
    for (const id of allIds) {
      const prior = controls.get(id)!;
      const total = prior.allocatedCents - (oldBySource.get(id) ?? 0) + (newBySource.get(id) ?? 0);
      const gainOnlyReceipts = (prior.gainOnlyReceipts ?? 0) - Number(oldGainOnlySource === id) + Number(newGainOnlySource === id);
      if (total < 0 || gainOnlyReceipts < 0) throw new Error('Controllo rimborso incoerente.');
      trx.set(controlRef(db, uid, id), { allocatedCents: total, revision: prior.revision + 1, ...(gainOnlyReceipts ? { gainOnlyReceipts } : {}) });
    }
    const nextIds = new Set(rows.map(r => r.id));
    for (const row of oldRows) if (!nextIds.has(row.id)) trx.delete(txRef(db, uid, row.id));
    for (const row of rows) trx.set(txRef(db, uid, row.id), row.data);
    trx.set(receiptRef, { expenseIds: draft.expenseIds, rowIds: rows.map(r => r.id), revision: (header?.revision ?? 0) + 1 } satisfies RefundReceiptHeader);
  });
}

export async function deleteRefundReceipt(db: Firestore, uid: string, receiptId: string): Promise<void> {
  assertId(receiptId);
  const receiptRef = headerRef(db, uid, receiptId);
  const preflight = (await getDocFromServer(receiptRef)).data() as RefundReceiptHeader | undefined;
  if (!preflight) return;
  const baselines = await legacyBaselines(db, uid, preflight.expenseIds);
  await runTransaction(db, async trx => {
    const header = (await trx.get(receiptRef)).data() as RefundReceiptHeader | undefined;
    if (!header) return;
    if (!sameIds(header.expenseIds, preflight.expenseIds)) throw new Error('Questo rimborso è cambiato. Riaprilo e riprova.');
    const rows = await Promise.all(header.rowIds.map(async id => {
      const snap = await trx.get(txRef(db, uid, id));
      if (!snap.exists() || snap.data()?.refundGroupId !== receiptId) throw new Error('Collegamento del rimborso non valido.');
      return { ...snap.data(), id } as Transaction;
    }));
    const controls = await Promise.all(header.expenseIds.map(async id => ({ id,
      control: controlFrom((await trx.get(controlRef(db, uid, id))).data(), baselines.get(id) ?? 0) })));
    const gainOnly = header.expenseIds.length === 1 && rows.every(row => row.type === 'income');
    for (const { id, control } of controls) {
      const removed = rows.filter(r => r.type === 'refund' && r.refundOf === id).reduce((sum, r) => sum + toRefundCents(r.amount), 0);
      const gainOnlyReceipts = (control.gainOnlyReceipts ?? 0) - Number(gainOnly);
      if (control.allocatedCents < removed || gainOnlyReceipts < 0) throw new Error('Controllo rimborso incoerente.');
      trx.set(controlRef(db, uid, id), { allocatedCents: control.allocatedCents - removed, revision: control.revision + 1, ...(gainOnlyReceipts ? { gainOnlyReceipts } : {}) });
    }
    rows.forEach(row => trx.delete(txRef(db, uid, row.id)));
    trx.delete(receiptRef);
  });
}

/** Writes a standalone legacy refund against the same source controls. */
export async function saveSingleRefund(db: Firestore, uid: string, refundId: string, data: TxData): Promise<void> {
  assertId(refundId);
  if (data.type !== 'refund' || !data.refundOf || refundGroupIdOf(data as Transaction) || toRefundCents(data.amount) <= 0) throw new Error('Storno non valido.');
  assertDraft({ receiptId: refundId, expenseIds: [data.refundOf], amount: data.amount, date: data.date, account: data.account, notes: data.notes });
  const ref = txRef(db, uid, refundId);
  const preflight = (await getDocFromServer(ref)).data() as TxData | undefined;
  if (preflight && (preflight.type !== 'refund' || refundGroupIdOf(preflight as Transaction))) throw new Error('Modifica la ricevuta completa.');
  const ids = unique([data.refundOf, ...(preflight?.refundOf ? [preflight.refundOf] : [])]);
  const baselines = await legacyBaselines(db, uid, ids);
  await runTransaction(db, async trx => {
    const before = (await trx.get(ref)).data() as TxData | undefined;
    if (before && (before.type !== 'refund' || refundGroupIdOf(before as Transaction) || before.refundOf !== preflight?.refundOf)) throw new Error('Lo storno è cambiato. Riaprilo e riprova.');
    const controls = new Map<string, RefundControl>();
    const sources = new Map<string, Transaction>();
    for (const id of ids) {
      const [source, control] = await Promise.all([trx.get(txRef(db, uid, id)), trx.get(controlRef(db, uid, id))]);
      if (source.exists()) sources.set(id, { ...source.data(), id } as Transaction);
      controls.set(id, controlFrom(control.data(), baselines.get(id) ?? 0));
    }
    const source = sources.get(data.refundOf!);
    if (!source || !isRefundableSource(source)) throw new Error('La spesa non è più rimborsabile.');
    const oldCents = before ? toRefundCents(before.amount) : 0;
    const nextCents = toRefundCents(data.amount);
    for (const id of ids) {
      const control = controls.get(id)!;
      const total = control.allocatedCents - (before?.refundOf === id ? oldCents : 0) + (data.refundOf === id ? nextCents : 0);
      if (total < 0 || (data.refundOf === id && total > toRefundCents(grossOwnShare(source)))) throw new Error('Lo storno supera il residuo disponibile. Aggiorna i dati.');
      trx.set(controlRef(db, uid, id), { ...control, allocatedCents: total, revision: control.revision + 1 });
    }
    trx.set(ref, clean({ ...data, amount: nextCents / 100, category: source.category, createdAt: before?.createdAt ?? data.createdAt ?? Date.now() }));
  });
}

export async function deleteSingleRefund(db: Firestore, uid: string, refundId: string): Promise<void> {
  assertId(refundId);
  const ref = txRef(db, uid, refundId);
  const preflight = (await getDocFromServer(ref)).data() as TxData | undefined;
  if (!preflight) return;
  if (preflight.type !== 'refund' || !preflight.refundOf || refundGroupIdOf(preflight as Transaction)) throw new Error('Elimina la ricevuta completa.');
  const sourceId = preflight.refundOf;
  const baselines = await legacyBaselines(db, uid, [sourceId]);
  await runTransaction(db, async trx => {
    const before = (await trx.get(ref)).data() as TxData | undefined;
    if (!before) return;
    if (before.type !== 'refund' || before.refundOf !== sourceId || refundGroupIdOf(before as Transaction)) throw new Error('Lo storno è cambiato. Riaprilo e riprova.');
    const control = controlFrom((await trx.get(controlRef(db, uid, sourceId))).data(), baselines.get(sourceId) ?? 0);
    const amount = toRefundCents(before.amount);
    if (control.allocatedCents < amount) throw new Error('Controllo rimborso incoerente.');
    trx.set(controlRef(db, uid, sourceId), { ...control, allocatedCents: control.allocatedCents - amount, revision: control.revision + 1 });
    trx.delete(ref);
  });
}
