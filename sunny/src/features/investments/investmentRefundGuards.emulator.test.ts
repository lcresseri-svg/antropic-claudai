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

  it('persists a historical series occurrence edit without changing its ended template or siblings', async () => {
    const original = expense({ amount: 0.74, date: '2026-09-30', seriesId: 'series' });
    const template = expense({ amount: 0.74, date: '2026-11-30', seriesId: 'series', recurring: { freq: 'monthly', until: '2026-10-30' } });
    const sibling = expense({ amount: 234.33, date: '2026-08-31', seriesId: 'series' });
    await seed('source', original); await seed('template', template); await seed('sibling', sibling);
    await sync.replaceTransactionSynced(uid, 'source', { ...original, amount: 1.24, description: 'Occorrenza corretta' });
    expect((await getDoc(sourceRef())).data()).toMatchObject({ amount: 1.24, description: 'Occorrenza corretta', seriesId: 'series', date: '2026-09-30' });
    expect((await getDoc(doc(db, 'users', uid, 'transactions', 'template'))).data()).toEqual(template);
    expect((await getDoc(doc(db, 'users', uid, 'transactions', 'sibling'))).data()).toEqual(sibling);
  });
  it('keeps explicit manual overrides when a later series edit uses a stale snapshot', async () => {
    const template = {...expense({amount:10,seriesId:'series',recurring:{freq:'monthly'}}),id:'template'};
    const ordinary = expense({amount:10,seriesId:'series'});
    await seed('source', ordinary);await seed('sibling',ordinary);
    await sync.replaceTransactionSynced(uid,'source',{...ordinary,amount:7.5,seriesOverride:true});
    await sync.replaceTransactionSynced(uid,'source',{...ordinary,amount:20},{seriesTemplate:template});
    await sync.replaceTransactionSynced(uid,'sibling',{...ordinary,amount:20},{seriesTemplate:template});
    expect((await getDoc(sourceRef())).data()).toMatchObject({amount:7.5,seriesOverride:true});
    expect((await getDoc(doc(db,'users',uid,'transactions','sibling'))).data()).toMatchObject({amount:20});
  });
  it('preserves legacy individualized values without a flag on a stale series write',async()=>{
    const template={...expense({amount:10,seriesId:'series',recurring:{freq:'monthly'}}),id:'template'};
    await seed('source',expense({amount:1.24,seriesId:'series'}));
    await sync.replaceTransactionSynced(uid,'source',expense({amount:.74,seriesId:'series'}),{seriesTemplate:template});
    expect((await getDoc(sourceRef())).data()?.amount).toBe(1.24);
  });
  it('rolls back the template and all occurrence writes when a refund rejects one series change',async()=>{
    const template={...expense({amount:100,seriesId:'series',date:'2026-12-01',recurring:{freq:'monthly'}}),id:'template'};
    const original=expense({amount:100,seriesId:'series'});
    await seed('template',template);await seed('source',original);await seed('sibling',original);
    await saveRefundReceipt(db,uid,{...draft(),amount:80});
    await expect(sync.replaceSeriesSynced(uid,[
      {id:'template',data:{...template,amount:50}},
      {id:'sibling',data:{...original,amount:50},seriesTemplate:template},
      {id:'source',data:{...original,amount:50},seriesTemplate:template},
    ])).rejects.toThrow();
    for(const id of ['template','source','sibling'])expect((await getDoc(doc(db,'users',uid,'transactions',id))).data()?.amount).toBe(100);
  });
  it('protects customized future occurrences even when dissolution was planned before their manual edit',async()=>{
    const template={...expense({amount:10,seriesId:'series',recurring:{freq:'monthly'}}),id:'template'};
    await seed('source',expense({amount:10,seriesId:'series',seriesOverride:true,date:'2026-12-01'}));
    await sync.replaceSeriesSynced(uid,[{id:'source',data:null,seriesTemplate:template}]);
    expect((await getDoc(sourceRef())).data()).toMatchObject({amount:10,seriesOverride:true,date:'2026-12-01'});
  });
  it('rejects a stale series template without committing a divergent template or history',async()=>{
    const old={...expense({amount:100,seriesId:'series',recurring:{freq:'monthly'}}),id:'template'};
    await seed('template',{...old,amount:150});await seed('source',expense({amount:150,seriesId:'series'}));
    await expect(sync.replaceSeriesSynced(uid,[
      {id:'template',data:{...old,amount:200},expectedTemplate:old},
      {id:'source',data:expense({amount:200,seriesId:'series'}),seriesTemplate:old},
    ])).rejects.toThrow(/serie è cambiata/);
    expect((await getDoc(doc(db,'users',uid,'transactions','template'))).data()?.amount).toBe(150);
    expect((await getDoc(sourceRef())).data()?.amount).toBe(150);
  });
  it('unlinks from the fresh personalized data without overwriting its business or investment fields',async()=>{
    const fresh=expense({amount:7.5,seriesId:'series',seriesOverride:true,notes:'Manuale',valueEffect:{category:'fund',delta:2,appliedAt:42}});
    await seed('source',fresh);
    await sync.replaceSeriesSynced(uid,[{id:'source',data:expense({amount:10}),unlinkSeries:'series'}]);
    const stored=(await getDoc(sourceRef())).data()!;
    expect(stored).not.toHaveProperty('seriesId');expect(stored).toMatchObject({amount:7.5,notes:'Manuale',seriesOverride:true,valueEffect:fresh.valueEffect});
  });
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
