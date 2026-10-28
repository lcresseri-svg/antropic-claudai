/** Synthetic data only; requires a local Firestore emulator, no Auth emulator. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '../../../../firestore-tests/node_modules/@firebase/rules-unit-testing';
import { doc as seedDoc, setDoc as seedSetDoc } from '../../../../firestore-tests/node_modules/firebase/firestore';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { collection, connectFirestoreEmulator, disableNetwork, doc, enableNetwork, getDoc, getDocs, getFirestore, type Firestore } from 'firebase/firestore';
import { saveRefundReceipt } from '../transactions/refundReceiptStore';

let db: Firestore;
vi.mock('../../lib/firebase', () => ({ get db() { return db; } }));
const host = process.env.FIRESTORE_EMULATOR_HOST;
const run = host ? describe : describe.skip;
const uid = 'mutation-test-user';
const expense = (extra: Record<string, unknown> = {}) => ({ type: 'expense' as const, amount: 60, date: '2026-10-01', description: 'Source', category: 'food', account: 'bank', ...extra });
const sourceRef = () => doc(db, 'users', uid, 'transactions', 'source');
const draft = () => ({ receiptId: 'receipt', amount: 48, expenseIds: ['source'], date: '2026-10-12', account: 'bank' });

run('ordinary mutations contend with refund allocations', () => {
  let env: RulesTestEnvironment;
  let app: FirebaseApp;
  let sync: typeof import('./investmentValueSync');
  const seed = async (id: string, data: Record<string, unknown>) => env.withSecurityRulesDisabled(async context => {
    await seedSetDoc(seedDoc(context.firestore(), 'users', uid, 'transactions', id), data);
  });
  beforeAll(async () => {
    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host!)) throw new Error('Local emulator required.');
    const [hostname, port] = host!.split(':');
    env = await initializeTestEnvironment({ projectId: 'demo-sunny-mutations', firestore: {
      host: hostname, port: Number(port), rules: readFileSync(new URL('../../../../firestore.rules', import.meta.url), 'utf8'),
    } });
    app = initializeApp({ projectId: 'demo-sunny-mutations', apiKey: 'synthetic' }, 'mutation-tests');
    db = getFirestore(app);
    connectFirestoreEmulator(db, hostname, Number(port), { mockUserToken: { sub: uid, user_id: uid } });
    sync = await import('./investmentValueSync');
  });
  afterAll(async () => { await env?.cleanup(); if (app) await deleteApp(app); });
  beforeEach(async () => { await env.clearFirestore(); await seed('source', expense()); });

  it('blocks deletion through the noninvestment and investment paths', async () => {
    await saveRefundReceipt(db, uid, draft());
    for (const mustSync of [false, true]) {
      await expect(sync.deleteTransactionsSynced(uid, ['source'], { mustSync })).rejects.toThrow(/rimborso|rimborsi/);
      expect((await getDoc(sourceRef())).exists()).toBe(true);
    }
  });
  it('blocks group replacement before creating any replacement documents', async () => {
    await saveRefundReceipt(db, uid, draft());
    await expect(sync.replaceGroupSynced(uid, ['source'], [expense({ description: 'replacement' })], { mustSync: false })).rejects.toThrow();
    const rows = (await getDocs(collection(db, 'users', uid, 'transactions'))).docs;
    expect(rows.some(row => row.data().description === 'replacement')).toBe(false);
    expect((await getDoc(sourceRef())).exists()).toBe(true);
  });
  it('blocks retyping to investment and lowering the personal share in ordinary replace', async () => {
    await saveRefundReceipt(db, uid, draft());
    await expect(sync.replaceTransactionSynced(uid, 'source', expense({ type: 'investment' }))).rejects.toThrow();
    await expect(sync.replaceTransactionSynced(uid, 'source', expense({ shared: 20 }))).rejects.toThrow();
    expect((await getDoc(sourceRef())).data()?.type).toBe('expense');
  });
  it('guards every row of bulk edits, before any writes, for either sync option', async () => {
    await seed('other', expense({ amount: 20 }));
    await saveRefundReceipt(db, uid, draft());
    for (const mustSync of [false, true]) {
      await expect(sync.patchTransactionsSynced(uid, ['other', 'source'], { type: 'income' }, { mustSync })).rejects.toThrow();
      expect((await getDoc(doc(db, 'users', uid, 'transactions', 'other'))).data()?.type).toBe('expense');
    }
  });
  it('allows bulk edits preserving source capacity and strips derived fields from both create paths', async () => {
    await seed('other', expense({ amount: 20 }));
    await saveRefundReceipt(db, uid, draft());
    await sync.patchTransactionsSynced(uid, ['source', 'other'], { category: 'other' }, { mustSync: false });
    expect((await getDoc(sourceRef())).data()?.category).toBe('other');
    for (const type of ['expense', 'investment'] as const) {
      await sync.createTransactionsSynced(uid, [expense({ type, description: type, cashDelta: -50, refundedTotal: 4 })]);
    }
    const rows = (await getDocs(collection(db, 'users', uid, 'transactions'))).docs.filter(row => ['expense', 'investment'].includes(row.data().description));
    expect(rows).toHaveLength(2);
    rows.forEach(row => { expect(row.data()).not.toHaveProperty('cashDelta'); expect(row.data()).not.toHaveProperty('refundedTotal'); });
  });
  it('reads fresh source state on a concurrent refund versus bulk retype', async () => {
    const result = await Promise.allSettled([
      saveRefundReceipt(db, uid, draft()),
      sync.patchTransactionsSynced(uid, ['source'], { type: 'income' }, { mustSync: false }),
    ]);
    expect(result.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const source = (await getDoc(sourceRef())).data();
    if (result[0].status === 'fulfilled') expect(source?.type).toBe('expense');
    else expect(source?.type).toBe('income');
  });
  it('ordinary new expenses are queued while offline without requiring transaction reads', async () => {
    await disableNetwork(db);
    let completed = false;
    const pending = sync.createTransactionsSynced(uid, [expense({ description: 'Offline creation' })]).then(() => { completed = true; });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(completed).toBe(false);
    await enableNetwork(db);
    await pending;
    expect((await getDocs(collection(db, 'users', uid, 'transactions'))).docs.some(row => row.data().description === 'Offline creation')).toBe(true);
  });
  it('generic create and patch cannot bypass refund controls or inject receipt metadata', async () => {
    await expect(sync.createTransactionsSynced(uid, [expense({ type: 'refund', refundOf: 'source' })])).rejects.toThrow();
    await expect(sync.createTransactionsSynced(uid, [expense({ type: 'income', refundGroupId: 'forged' })])).rejects.toThrow();
    await expect(sync.patchTransactionsSynced(uid, ['source'], { type: 'refund' }, { mustSync: false })).rejects.toThrow();
    await expect(sync.patchTransactionsSynced(uid, ['source'], { type: 'refund' }, { mustSync: true })).rejects.toThrow();
    expect((await getDoc(sourceRef())).data()?.type).toBe('expense');
  });
  it('generic writers cannot edit, retype, delete or detach existing receipt rows', async () => {
    await saveRefundReceipt(db, uid, draft());
    const id = 'receipt__refund__source';
    await expect(sync.replaceTransactionSynced(uid, id, expense())).rejects.toThrow();
    for (const mustSync of [false, true]) {
      await expect(sync.patchTransactionsSynced(uid, [id], { category: 'other' }, { mustSync })).rejects.toThrow();
      await expect(sync.deleteTransactionsSynced(uid, [id], { mustSync })).rejects.toThrow();
    }
    expect((await getDoc(doc(db, 'users', uid, 'transactions', id))).exists()).toBe(true);
  });
});
