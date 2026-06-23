/**
 * Firestore security-rules tests (run against the Firestore emulator).
 *
 *   npm --prefix firestore-tests install
 *   npm --prefix firestore-tests run test:emulator   # needs firebase-tools + Java
 *
 * Validates the hardened ../firestore.rules WITHOUT touching production:
 *  - per-user isolation,
 *  - transaction validation (types/enums/ranges/lengths, non-breaking),
 *  - forecastSnapshots write-once,
 *  - derived/encouraging owner-only + payload,
 *  - feedback create/read,
 *  - expenseTokens fully denied to clients.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const A = 'userA';
const B = 'userB';
const ADMIN = 'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2';

const validTxn = (over: Record<string, unknown> = {}) => ({
  date: '2026-06-15', description: 'Spesa', amount: 12.5,
  type: 'expense', category: 'spesa', account: 'cc', createdAt: Date.now(), ...over,
});

const here = fileURLToPath(new URL('.', import.meta.url));

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'sunny-test',
    firestore: { rules: readFileSync(resolve(here, '../firestore.rules'), 'utf8') },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

const dbOf = (uid: string | null) =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

describe('per-user isolation', () => {
  it('A cannot read or write B transactions', async () => {
    const db = dbOf(A);
    await assertFails(setDoc(doc(db, `users/${B}/transactions/x`), validTxn()));
    await assertFails(getDoc(doc(db, `users/${B}/transactions/x`)));
  });
  it('unauthenticated is denied everywhere', async () => {
    const db = dbOf(null);
    await assertFails(setDoc(doc(db, `users/${A}/transactions/x`), validTxn()));
  });
});

describe('transaction validation', () => {
  it('accepts a valid expense (incl. createdAt number)', async () => {
    await assertSucceeds(setDoc(doc(dbOf(A), `users/${A}/transactions/t1`), validTxn()));
  });
  it('accepts empty account (source-less investment) and valid recurring', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/transactions/t2`),
      validTxn({ type: 'investment', account: '', direction: 'in' })));
    await assertSucceeds(setDoc(doc(db, `users/${A}/transactions/t3`),
      validTxn({ recurring: { freq: 'monthly' } })));
    await assertSucceeds(setDoc(doc(db, `users/${A}/transactions/t4`),
      validTxn({ recurring: { freq: 'yearly', until: '2027-12-31' } })));
  });
  it('rejects amount <= 0 and > 1e9', async () => {
    const db = dbOf(A);
    await assertFails(setDoc(doc(db, `users/${A}/transactions/b1`), validTxn({ amount: 0 })));
    await assertFails(setDoc(doc(db, `users/${A}/transactions/b2`), validTxn({ amount: -5 })));
    await assertFails(setDoc(doc(db, `users/${A}/transactions/b3`), validTxn({ amount: 2000000000 })));
  });
  it('rejects invalid type, malformed date, bad recurring freq, shared>amount', async () => {
    const db = dbOf(A);
    await assertFails(setDoc(doc(db, `users/${A}/transactions/b4`), validTxn({ type: 'nope' })));
    await assertFails(setDoc(doc(db, `users/${A}/transactions/b5`), validTxn({ date: '15/06/2026' })));
    await assertFails(setDoc(doc(db, `users/${A}/transactions/b6`), validTxn({ recurring: { freq: 'fortnightly' } })));
    await assertFails(setDoc(doc(db, `users/${A}/transactions/b7`), validTxn({ shared: 999 })));
  });
});

describe('forecastSnapshots (write-once)', () => {
  it('allows create, denies delete', async () => {
    const db = dbOf(A);
    const ref = doc(db, `users/${A}/forecastSnapshots/2026-06_15`);
    await assertSucceeds(setDoc(ref, { monthKey: '2026-06', snapshotDay: 15, actual: 100, predicted: 110 }));
    await assertFails(deleteDoc(ref));
  });
});

describe('derived/encouraging', () => {
  it('owner can write a valid payload; other derived docs denied', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/derived/encouraging`),
      { items: [{ title: 't', detail: 'd', minDepth: 'medium' }] }));
    await assertFails(setDoc(doc(db, `users/${A}/derived/other`), { items: [] }));
  });
  it('non-owner denied', async () => {
    await assertFails(setDoc(doc(dbOf(B), `users/${A}/derived/encouraging`), { items: [] }));
  });
});

describe('feedback', () => {
  const fb = (over: Record<string, unknown> = {}) => ({
    userId: A, userEmail: null, type: 'idea', text: 'ciao', appVersion: '1.0.0',
    createdAt: Date.now(), createdAtServer: Date.now(), ...over,
  });
  it('create with own uid ok; other uid denied; bad type denied', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, 'feedback/f1'), fb()));
    await assertFails(setDoc(doc(db, 'feedback/f2'), fb({ userId: B })));
    await assertFails(setDoc(doc(db, 'feedback/f3'), fb({ type: 'spam' })));
  });
  it('only admin can read feedback', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'feedback/f4'), fb());
    });
    await assertFails(getDoc(doc(dbOf(A), 'feedback/f4')));
    await assertSucceeds(getDoc(doc(dbOf(ADMIN), 'feedback/f4')));
  });
});

describe('expenseTokens', () => {
  it('client cannot read or write', async () => {
    const db = dbOf(A);
    await assertFails(getDoc(doc(db, 'expenseTokens/abc')));
    await assertFails(setDoc(doc(db, 'expenseTokens/abc'), { uid: A }));
  });
});

describe('metric events', () => {
  const ev = (over: Record<string, unknown> = {}) => ({ name: 'app_open', ts: Date.now(), ...over });

  it('owner can create an allow-listed event and read own events', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/events/e1`), ev()));
    await assertSucceeds(getDoc(doc(db, `users/${A}/events/e1`)));
  });
  it('rejects a name outside the allowlist', async () => {
    await assertFails(setDoc(doc(dbOf(A), `users/${A}/events/e2`), ev({ name: 'evil' })));
  });
  it('rejects an extra field (only name+ts allowed)', async () => {
    await assertFails(setDoc(doc(dbOf(A), `users/${A}/events/e3`), ev({ amount: 100 })));
  });
  it('rejects a non-number ts', async () => {
    await assertFails(setDoc(doc(dbOf(A), `users/${A}/events/e4`), ev({ ts: 'now' })));
  });
  it('another user cannot create or read', async () => {
    const db = dbOf(B);
    await assertFails(setDoc(doc(db, `users/${A}/events/e5`), ev()));
    await assertFails(getDoc(doc(db, `users/${A}/events/e5`)));
  });
  it('update and delete are denied to the owner (purge is Admin SDK)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${A}/events/e6`), ev());
    });
    const db = dbOf(A);
    await assertFails(setDoc(doc(db, `users/${A}/events/e6`), ev({ ts: Date.now() + 1 }))); // update
    await assertFails(deleteDoc(doc(db, `users/${A}/events/e6`)));
  });
});

describe('metrics (daily aggregate)', () => {
  it('client write denied; admin read ok; non-admin read denied', async () => {
    await assertFails(setDoc(doc(dbOf(A), 'metrics/2026-06-23'), { dau: 1 }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'metrics/2026-06-23'), { date: '2026-06-23', dau: 5 });
    });
    await assertFails(getDoc(doc(dbOf(A), 'metrics/2026-06-23')));
    await assertSucceeds(getDoc(doc(dbOf(ADMIN), 'metrics/2026-06-23')));
  });
});
