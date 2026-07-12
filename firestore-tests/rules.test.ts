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
  it('accepts valid seriesMeta (subscription / installment), rejects malformed', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/transactions/s1`),
      validTxn({ recurring: { freq: 'monthly' }, seriesId: 's', seriesMeta: { kind: 'subscription', createdAt: 1 } })));
    await assertSucceeds(setDoc(doc(db, `users/${A}/transactions/s2`),
      validTxn({ recurring: { freq: 'monthly', until: '2027-12-15' }, seriesId: 'r',
        seriesMeta: { kind: 'installment', installment: { totalAmount: 2400, totalInstallments: 24, firstDate: '2026-01-15' } } })));
    // instance without a rule still carries the badge meta
    await assertSucceeds(setDoc(doc(db, `users/${A}/transactions/s3`),
      validTxn({ seriesId: 's', seriesMeta: { kind: 'subscription' } })));
    await assertFails(setDoc(doc(db, `users/${A}/transactions/sb1`),
      validTxn({ seriesMeta: { kind: 'weird' } })));
    await assertFails(setDoc(doc(db, `users/${A}/transactions/sb2`),
      validTxn({ seriesMeta: { kind: 'installment', installment: { totalAmount: -5, totalInstallments: 24, firstDate: '2026-01-15' } } })));
    await assertFails(setDoc(doc(db, `users/${A}/transactions/sb3`),
      validTxn({ seriesMeta: { kind: 'installment', installment: { totalAmount: 100, totalInstallments: 0, firstDate: '2026-01-15' } } })));
  });
});

describe('forecastSnapshots (write-once)', () => {
  it('allows create, denies delete', async () => {
    const db = dbOf(A);
    const ref = doc(db, `users/${A}/forecastSnapshots/2026-06_15`);
    await assertSucceeds(setDoc(ref, { monthKey: '2026-06', snapshotDay: 15, actual: 100, predicted: 110 }));
    await assertFails(deleteDoc(ref));
  });
  it('rejects malformed payloads (bad monthKey / snapshotDay / metrics)', async () => {
    const db = dbOf(A);
    await assertFails(setDoc(doc(db, `users/${A}/forecastSnapshots/x1`),
      { monthKey: 'giugno', snapshotDay: 15, actual: 100, predicted: 110 }));
    await assertFails(setDoc(doc(db, `users/${A}/forecastSnapshots/x2`),
      { monthKey: '2026-06', snapshotDay: 42, actual: 100, predicted: 110 }));
    await assertFails(setDoc(doc(db, `users/${A}/forecastSnapshots/x3`),
      { monthKey: '2026-06', snapshotDay: 15, actual: 'cento', predicted: 110 }));
  });
});

describe('meta/* specific rules', () => {
  it('settings: valid payload ok; bad theme / huge categories rejected', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/meta/settings`),
      { categories: [], accounts: [], theme: 'dark', enableBudget: true }));
    await assertSucceeds(setDoc(doc(db, `users/${A}/meta/settings`),
      { theme: 'system' })); // legacy value stays accepted
    await assertFails(setDoc(doc(db, `users/${A}/meta/settings`), { theme: 'neon' }));
    await assertFails(setDoc(doc(db, `users/${A}/meta/settings`), { enableBudget: 'yes' }));
  });
  it('budget: negative savingsTarget rejected; maps required when present', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/meta/budget`),
      { savingsTarget: 500, categoryBudgets: { spesa: 300 } }));
    await assertFails(setDoc(doc(db, `users/${A}/meta/budget`), { savingsTarget: -1 }));
    await assertFails(setDoc(doc(db, `users/${A}/meta/budget`), { categoryBudgets: 'tutte' }));
  });
  it('aiCoach: client read ok, client write denied (Admin SDK only)', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/${A}/meta/aiCoach`), { dailyCount: 3 });
    });
    const db = dbOf(A);
    await assertSucceeds(getDoc(doc(db, `users/${A}/meta/aiCoach`)));
    await assertFails(setDoc(doc(db, `users/${A}/meta/aiCoach`), { dailyCount: 0 }));
  });
  it('unknown legacy meta doc keeps owner-only access', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/meta/legacyThing`), { anything: true }));
    await assertFails(setDoc(doc(dbOf(B), `users/${A}/meta/legacyThing`), { anything: true }));
  });
});

describe('wealthSnapshots', () => {
  const snap = (over: Record<string, unknown> = {}) => ({
    dateKey: '2026-07-10', version: 1, totalNetWorth: 1000, cash: 400,
    investments: 600, source: 'live', ...over,
  });
  it('owner create + idempotent update ok; delete denied', async () => {
    const db = dbOf(A);
    const ref = doc(db, `users/${A}/wealthSnapshots/2026-07-10`);
    await assertSucceeds(setDoc(ref, snap()));
    await assertSucceeds(setDoc(ref, snap({ cash: 410, totalNetWorth: 1010 })));
    await assertFails(deleteDoc(ref));
  });
  it('rejects id/dateKey mismatch, bad source, non-numeric values', async () => {
    const db = dbOf(A);
    await assertFails(setDoc(doc(db, `users/${A}/wealthSnapshots/2026-07-10`), snap({ dateKey: '2026-07-09' })));
    await assertFails(setDoc(doc(db, `users/${A}/wealthSnapshots/2026-07-10`), snap({ source: 'guess' })));
    await assertFails(setDoc(doc(db, `users/${A}/wealthSnapshots/2026-07-10`), snap({ cash: 'molti' })));
    await assertFails(setDoc(doc(db, `users/${A}/wealthSnapshots/not-a-date`), snap({ dateKey: 'not-a-date' })));
  });
  it('non-owner denied', async () => {
    await assertFails(setDoc(doc(dbOf(B), `users/${A}/wealthSnapshots/2026-07-10`), snap()));
    await assertFails(getDoc(doc(dbOf(B), `users/${A}/wealthSnapshots/2026-07-10`)));
  });
});

describe('monthlyPlans', () => {
  const plan = (over: Record<string, unknown> = {}) => ({
    month: '2026-07', version: 1, expectedIncome: 2400, savingsTarget: 500,
    categoryBudgets: { spesa: 300 }, plannedEvents: [], status: 'draft',
    source: 'manual', ...over,
  });
  it('owner write ok; id/month mismatch and bad enums rejected', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/monthlyPlans/2026-07`), plan()));
    await assertFails(setDoc(doc(db, `users/${A}/monthlyPlans/2026-08`), plan()));
    await assertFails(setDoc(doc(db, `users/${A}/monthlyPlans/2026-07`), plan({ status: 'maybe' })));
    await assertFails(setDoc(doc(db, `users/${A}/monthlyPlans/2026-07`), plan({ expectedIncome: -1 })));
  });
  it('non-owner denied', async () => {
    await assertFails(setDoc(doc(dbOf(B), `users/${A}/monthlyPlans/2026-07`), plan()));
  });
});

describe('derived/monthlyAggregates', () => {
  it('owner can write a versioned doc; malformed and non-owner denied', async () => {
    const db = dbOf(A);
    await assertSucceeds(setDoc(doc(db, `users/${A}/derived/monthlyAggregates`),
      { version: 1, lastMonth: '2026-06', months: [], generatedAt: Date.now() }));
    await assertFails(setDoc(doc(db, `users/${A}/derived/monthlyAggregates`),
      { version: 'uno', months: [] }));
    await assertFails(setDoc(doc(dbOf(B), `users/${A}/derived/monthlyAggregates`),
      { version: 1, months: [] }));
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
