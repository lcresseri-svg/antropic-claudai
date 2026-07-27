/**
 * Integration test of the REAL controvalore-sync layer against the Firestore
 * emulator, with the project's REAL security rules loaded. Reproduces the
 * delete of a source-less investment deposit end-to-end.
 *
 * Run under the emulator (see firestore-tests):
 *   firebase emulators:exec --only firestore --project sunny-test \
 *     "npx vitest run investmentValueSync.emulator"
 *
 * Skipped automatically when the emulator isn't reachable (FIRESTORE_EMULATOR_HOST
 * unset), so the normal unit run stays green.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, collection, getDocs,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth';

const EMU = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_EMU = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const run = EMU ? describe : describe.skip;

// Point the sync module's `db` at the emulator BEFORE it is imported.
const app = initializeApp({ projectId: 'sunny-test', apiKey: 'fake' }, `emu-${Date.now()}`);
const db = getFirestore(app);
const authClient = getAuth(app);
if (EMU) {
  const [host, port] = EMU.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  if (AUTH_EMU) connectAuthEmulator(authClient, `http://${AUTH_EMU}`, { disableWarnings: true });
}
vi.mock('../../lib/firebase', () => ({ db }));

// When the Auth emulator is present we run under REAL security rules as an
// authenticated user (uid = the signed-in user); otherwise an allow-all config.
let UID = 'user-emulator-1';

run('investmentValueSync — delete a source-less investment (emulator + rules)', () => {
  let sync: typeof import('./investmentValueSync');

  beforeAll(async () => {
    if (AUTH_EMU) {
      const cred = await signInAnonymously(authClient);
      UID = cred.user.uid;
    }
    sync = await import('./investmentValueSync');
    // Seed settings with one pension investment category (no currentValue yet).
    await setDoc(doc(db, 'users', UID, 'meta', 'settings'), {
      categories: [
        { id: 'fondo', label: 'Fondo pensione', icon: '🛡️', color: '#8FB0A0', kind: 'investment', fundType: 'pension' },
        { id: 'casa', label: 'Casa', icon: '🏠', color: '#ccc', kind: 'expense' },
      ],
      accounts: [{ id: 'cc', label: 'Conto', icon: '🏦', color: '#888' }],
      theme: 'dark',
    });
  });

  it('creates (stamped) then DELETES a source-less deposit; currentValue reverts, doc gone', async () => {
    // Source-less deposit 300, TFR 200 (account '') — like "TFR / datore".
    await sync.createTransactionsSynced(UID, [{
      type: 'investment', direction: 'in', description: 'Versamento TFR',
      amount: 300, date: '2026-07-01', category: 'fondo', account: '', tfr: 200,
    }]);

    const col = collection(db, 'users', UID, 'transactions');
    const afterCreate = await getDocs(col);
    expect(afterCreate.size).toBe(1);
    const created = afterCreate.docs[0];
    // Managed: full amount applied to currentValue regardless of account/TFR.
    expect(created.data().valueEffect).toMatchObject({ category: 'fondo', delta: 300 });

    const s1 = await getDoc(doc(db, 'users', UID, 'meta', 'settings'));
    const cat1 = (s1.data()!.categories as { id: string; currentValue?: number }[]).find(c => c.id === 'fondo');
    expect(cat1!.currentValue).toBe(300);

    // DELETE — this is the operation the user reports as broken.
    await sync.deleteTransactionsSynced(UID, [created.id]);

    const afterDelete = await getDocs(col);
    expect(afterDelete.size).toBe(0); // the movement is really gone

    const s2 = await getDoc(doc(db, 'users', UID, 'meta', 'settings'));
    const cat2 = (s2.data()!.categories as { id: string; currentValue?: number }[]).find(c => c.id === 'fondo');
    expect(cat2!.currentValue).toBe(0); // effect reverted exactly
  });

  it('deletes a WITH-account deposit + its commission (group) atomically', async () => {
    // Deposit 500 from account with a 5 fee (linked by groupId).
    await sync.createTransactionsSynced(UID, [
      { type: 'investment', direction: 'in', description: 'PAC', amount: 500, date: '2026-07-02', category: 'fondo', account: 'cc', groupId: 'g1' },
      { type: 'expense', description: 'Commissione · PAC', amount: 5, date: '2026-07-02', category: 'casa', account: 'cc', groupId: 'g1' },
    ]);
    const col = collection(db, 'users', UID, 'transactions');
    const docs = (await getDocs(col)).docs;
    const dep = docs.find(d => d.data().type === 'investment')!;
    const fee = docs.find(d => d.data().type === 'expense')!;

    const before = await getDoc(doc(db, 'users', UID, 'meta', 'settings'));
    const cvBefore = (before.data()!.categories as { id: string; currentValue?: number }[]).find(c => c.id === 'fondo')!.currentValue ?? 0;

    await sync.replaceGroupSynced(UID, [dep.id, fee.id], []);

    const after = await getDocs(col);
    expect(after.docs.some(d => d.id === dep.id || d.id === fee.id)).toBe(false);
    const s = await getDoc(doc(db, 'users', UID, 'meta', 'settings'));
    const cvAfter = (s.data()!.categories as { id: string; currentValue?: number }[]).find(c => c.id === 'fondo')!.currentValue ?? 0;
    expect(cvAfter).toBe(cvBefore - 500);
  });

  it('revert writes settings back even with a REALISTIC doc (legacy fields + subscriptionDate)', async () => {
    // Settings shaped like a real long-lived account: legacy ignored field,
    // extra toggles, and an investment category carrying subscriptionDate.
    await setDoc(doc(db, 'users', UID, 'meta', 'settings'), {
      categories: [
        { id: 'fondo', label: 'Fondo pensione', icon: '🛡️', color: '#8FB0A0', kind: 'investment', fundType: 'pension', subscriptionDate: '2020-01-15', currentValue: 0 },
        { id: 'casa', label: 'Casa', icon: '🏠', color: '#ccc', kind: 'expense' },
      ],
      accounts: [{ id: 'cc', label: 'Conto', icon: '🏦', color: '#888' }],
      theme: 'system',
      insightDepth: 'advanced',
      enableInvestments: true,
      includeInvestments: true,
      enableBudget: true,
      aiEnabled: false,
      countInvestmentsInExpenses: true, // LEGACY field, ignored by the app
    });

    await sync.createTransactionsSynced(UID, [{
      type: 'investment', direction: 'in', description: 'Versamento', amount: 250,
      date: '2026-07-03', category: 'fondo', account: '', tfr: 100, statsSpreadMonths: 6,
    }]);
    const col = collection(db, 'users', UID, 'transactions');
    const created = (await getDocs(col)).docs[0];
    const s1 = await getDoc(doc(db, 'users', UID, 'meta', 'settings'));
    expect((s1.data()!.categories as { id: string; currentValue?: number }[]).find(c => c.id === 'fondo')!.currentValue).toBe(250);

    await sync.deleteTransactionsSynced(UID, [created.id]);

    expect((await getDocs(col)).size).toBe(0);
    const s2 = await getDoc(doc(db, 'users', UID, 'meta', 'settings'));
    expect((s2.data()!.categories as { id: string; currentValue?: number }[]).find(c => c.id === 'fondo')!.currentValue).toBe(0);
    // Legacy field survives untouched (no destructive migration).
    expect(s2.data()!.countInvestmentsInExpenses).toBe(true);
  });

  it('MODAL path: replaceGroupSynced deletes a source-less investment (mustSync:true)', async () => {
    // Exactly what the modal produces for an investment delete:
    // handleSave → tx.replaceGroup([id], []) → replaceGroupSynced(uid, [id], [], {mustSync:true}).
    await sync.createTransactionsSynced(UID, [{
      type: 'investment', direction: 'in', description: 'Senza conto', amount: 150,
      date: '2026-07-05', category: 'fondo', account: '',
    }]);
    const col = collection(db, 'users', UID, 'transactions');
    const dep = (await getDocs(col)).docs.find(d => d.data().description === 'Senza conto')!;
    const before = await getDoc(doc(db, 'users', UID, 'meta', 'settings'));
    const cvBefore = (before.data()!.categories as { id: string; currentValue?: number }[]).find(c => c.id === 'fondo')!.currentValue ?? 0;

    await sync.replaceGroupSynced(UID, [dep.id], [], { mustSync: true });

    expect((await getDocs(col)).docs.some(d => d.id === dep.id)).toBe(false);
    const after = await getDoc(doc(db, 'users', UID, 'meta', 'settings'));
    const cvAfter = (after.data()!.categories as { id: string; currentValue?: number }[]).find(c => c.id === 'fondo')!.currentValue ?? 0;
    expect(cvAfter).toBe(cvBefore - 150);
  });

  it('non-investment delete uses the offline-safe batch path (mustSync:false)', async () => {
    await sync.createTransactionsSynced(UID, [{
      type: 'expense', description: 'Spesa', amount: 20, date: '2026-07-04', category: 'casa', account: 'cc',
    }]);
    const col = collection(db, 'users', UID, 'transactions');
    const exp = (await getDocs(col)).docs.find(d => d.data().type === 'expense')!;
    // mustSync:false → plainWrite batch delete, no settings read/revert needed.
    await sync.deleteTransactionsSynced(UID, [exp.id], { mustSync: false });
    expect((await getDocs(col)).docs.some(d => d.id === exp.id)).toBe(false);
  });
});

// Ensure the app is torn down so vitest can exit cleanly.
if (EMU) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__emuTeardown = () => deleteApp(app);
}
