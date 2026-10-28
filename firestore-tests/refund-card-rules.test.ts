import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const uid = 'refund-card-owner';
const dbOf = (actor: string | null = uid) => (actor ? env.authenticatedContext(actor) : env.unauthenticatedContext()).firestore();
const tx = (extra: Record<string, unknown> = {}) => ({ date: '2026-10-01', description: 'Expense', amount: 60, type: 'expense', account: 'bank', category: 'food', ...extra });
const settlement = { cardId: 'card', period: '2026-10', paymentDay: 1, paymentAccountId: 'bank', policyFromMonth: '2026-10' };
beforeAll(async () => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) throw new Error('Local emulator required.');
  env = await initializeTestEnvironment({ projectId: 'demo-sunny-refund-card-rules', firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('server managed credit card settlements', () => {
  const ref = (id: string, actor: string | null = uid) => doc(dbOf(actor), 'users', uid, 'transactions', id);
  it('rejects reserved ids and settlement metadata on create, even null metadata', async () => {
    await assertFails(setDoc(ref('__cc__card_2026-10'), tx()));
    await assertFails(setDoc(ref('ordinary'), tx({ creditCardSettlement: settlement })));
    await assertFails(setDoc(ref('null-metadata'), tx({ creditCardSettlement: null })));
  });
  it('rejects injecting metadata into an ordinary transaction', async () => {
    await assertSucceeds(setDoc(ref('ordinary'), tx()));
    await assertFails(updateDoc(ref('ordinary'), { creditCardSettlement: settlement }));
  });
  it('owners may read generated rows but cannot modify, strip metadata or delete them', async () => {
    await env.withSecurityRulesDisabled(async context => {
      for (const [id, data] of [['managed', tx({ creditCardSettlement: settlement })], ['__cc__reserved', tx()]] as const) {
        await setDoc(doc(context.firestore(), 'users', uid, 'transactions', id), data);
      }
    });
    for (const id of ['managed', '__cc__reserved']) {
      await assertSucceeds(getDoc(ref(id)));
      await assertFails(updateDoc(ref(id), { amount: 1 }));
      await assertFails(setDoc(ref(id), tx()));
      await assertFails(deleteDoc(ref(id)));
      await assertFails(getDoc(ref(id, 'other')));
      await assertFails(getDoc(ref(id, null)));
    }
    await assertSucceeds(getDocs(collection(dbOf(), 'users', uid, 'transactions')));
  });
  it('preserves ordinary CRUD and refund metadata for the owner', async () => {
    await assertSucceeds(setDoc(ref('ordinary'), tx()));
    await assertSucceeds(updateDoc(ref('ordinary'), { amount: 50 }));
    await assertSucceeds(deleteDoc(ref('ordinary')));
    await assertSucceeds(setDoc(ref('receipt__refund__expense'), tx({ type: 'refund', refundOf: 'expense', refundGroupId: 'receipt' })));
  });
});

describe('refund control and receipt owner/schema boundaries', () => {
  const control = { allocatedCents: 4800, revision: 1 };
  const receipt = { expenseIds: ['expense'], rowIds: ['receipt__refund__expense'], revision: 1 };
  it('owner can create, read, update and remove both bookkeeping documents', async () => {
    for (const [name, data] of [['refundControls', control], ['refundReceipts', receipt]] as const) {
      const ref = doc(dbOf(), 'users', uid, name, 'expense');
      await assertSucceeds(setDoc(ref, data));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(updateDoc(ref, { revision: 2 }));
      await assertSucceeds(deleteDoc(ref));
    }
  });
  it('other owners and unauthenticated clients cannot read, list, write or delete either collection', async () => {
    for (const [name, data] of [['refundControls', control], ['refundReceipts', receipt]] as const) {
      await assertSucceeds(setDoc(doc(dbOf(), 'users', uid, name, 'expense'), data));
      for (const actor of ['other', null]) {
        const db = dbOf(actor), ref = doc(db, 'users', uid, name, 'expense');
        await assertFails(getDoc(ref));
        await assertFails(getDocs(collection(db, 'users', uid, name)));
        await assertFails(setDoc(ref, data));
        await assertFails(deleteDoc(ref));
      }
    }
  });
  it('rejects malformed allocation values, revisions and extra control fields', async () => {
    for (const patch of [{ allocatedCents: -1 }, { allocatedCents: 0.5 }, { allocatedCents: '4800' }, { allocatedCents: 100000000001 }, { revision: 0 }, { revision: 1.1 }, { unknown: true }]) {
      await assertFails(setDoc(doc(dbOf(), 'users', uid, 'refundControls', 'expense'), { ...control, ...patch }));
    }
  });
  it('rejects malformed receipt membership, oversized collections and revisions', async () => {
    for (const patch of [{ expenseIds: 'expense' }, { expenseIds: Array(101).fill('expense') }, { rowIds: {} }, { rowIds: Array(102).fill('row') }, { revision: 0 }, { revision: '1' }, { unknown: true }]) {
      await assertFails(setDoc(doc(dbOf(), 'users', uid, 'refundReceipts', 'receipt'), { ...receipt, ...patch }));
    }
  });
});
