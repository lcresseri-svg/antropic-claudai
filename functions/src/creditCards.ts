import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { isDeepStrictEqual } from 'node:util';
import { FieldPath } from 'firebase-admin/firestore';
import { db, todayRomeISO, logError } from './shared';
import { buildCreditCardSettlements, isCreditCardSettlement, CREDIT_CARD_SETTLEMENT_PREFIX, CreditCardAccount, CreditCardTransaction } from './domain/creditCards';

const WRITE_LIMIT = 450;
const MAX_PASSES = 20;

/** Settings AND the source query are read inside each transaction.
 * Concurrent edits/triggers/cron retries recompute from committed sources using
 * deterministic document IDs. Large histories progress in bounded chunks.
 */
export async function reconcileCreditCardsForUser(uid: string, todayISO: string = todayRomeISO()): Promise<{ written: number; deleted: number }> {
  const settingsRef = db.doc(`users/${uid}/meta/settings`);
  const transactionsRef = db.collection(`users/${uid}/transactions`);
  const total = { written: 0, deleted: 0 };
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const result = await db.runTransaction(async trx => {
      const settings = await trx.get(settingsRef);
      const rawAccounts = settings.data()?.accounts;
      const accounts: CreditCardAccount[] = Array.isArray(rawAccounts) ? rawAccounts.filter(a => a && typeof a.id === 'string') : [];
      const hasPolicyHistory = accounts.some(a => a.creditCardPolicies?.length);
      // Ordinary users need only the reserved namespace, including cleanup
      // after all card settings were removed. Card histories still require
      // the complete ledger for source periods and carried credits.
      // The bare prefix is itself a reserved Firestore resource ID. Generated
      // IDs append encodeURIComponent(cardId), whose first character is >= '!'.
      const sourceQuery = hasPolicyHistory ? transactionsRef : transactionsRef
        .where(FieldPath.documentId(), '>=', `${CREDIT_CARD_SETTLEMENT_PREFIX}!`)
        .where(FieldPath.documentId(), '<', `${CREDIT_CARD_SETTLEMENT_PREFIX}\uf8ff`);
      const snapshot = await trx.get(sourceQuery);
      const transactions = snapshot.docs.map(d => ({ ...d.data(), id: d.id }) as CreditCardTransaction);
      const desired = new Map(buildCreditCardSettlements(transactions, accounts, todayISO).map(t => [t.id, t]));
      const existing = new Map(transactions.filter(isCreditCardSettlement).map(t => [t.id, t]));
      const deletes = [...existing.keys()].filter(id => !desired.has(id));
      const writes = [...desired.values()].filter(t => !isDeepStrictEqual(existing.get(t.id), t));
      let remaining = WRITE_LIMIT;
      let deleted = 0, written = 0;
      // Delete obsolete rows before creating replacement months.
      for (const id of deletes) {
        if (remaining-- <= 0) break;
        trx.delete(transactionsRef.doc(id)); deleted++;
      }
      for (const row of writes) {
        if (remaining-- <= 0) break;
        trx.set(transactionsRef.doc(row.id), row); written++;
      }
      return { written, deleted, pending: deletes.length + writes.length > WRITE_LIMIT };
    });
    total.written += result.written;
    total.deleted += result.deleted;
    if (!result.pending) return total;
  }
  // Retried trigger/daily sweep finishes exceptionally large histories.
  throw new Error('credit-card reconciliation exceeded its bounded pass limit');
}

/** Generated writes never feed back into source aggregation or trigger loops. */
export const reconcileCreditCardsOnTransactionWrite = onDocumentWritten(
  { document: 'users/{userId}/transactions/{transactionId}', region: 'europe-west1', retry: true },
  async event => {
    const managed = [event.data?.before, event.data?.after].some(s => s?.exists && isCreditCardSettlement({ id: s.id, creditCardSettlement: s.data()?.creditCardSettlement }));
    if (managed) return;
    await reconcileCreditCardsForUser(event.params.userId);
  },
);

export const reconcileCreditCardsOnSettingsWrite = onDocumentWritten(
  { document: 'users/{userId}/meta/settings', region: 'europe-west1', retry: true },
  async event => {
    if (isDeepStrictEqual(event.data?.before.data()?.accounts, event.data?.after.data()?.accounts)) return;
    await reconcileCreditCardsForUser(event.params.userId);
  },
);

/** Daily catch-up is independent of app availability; Rome calendar dates. */
export const processCreditCardSettlements = onSchedule(
  { schedule: '15 0 * * *', timeZone: 'Europe/Rome', memory: '256MiB', region: 'europe-west1', retryCount: 3 },
  async () => {
    const todayISO = todayRomeISO();
    // Includes missing parent user docs with legacy subcollections.
    const users = await db.collection('users').listDocuments();
    let failed = 0;
    for (let offset = 0; offset < users.length; offset += 100) {
      const group = users.slice(offset, offset + 100);
      const settings = await db.getAll(...group.map(ref => ref.collection('meta').doc('settings')));
      for (const snap of settings) {
        const accounts = snap.data()?.accounts;
        if (!Array.isArray(accounts) || !accounts.some(a => Array.isArray(a?.creditCardPolicies) && a.creditCardPolicies.length)) continue;
        const uid = snap.ref.parent.parent!.id;
        try { await reconcileCreditCardsForUser(uid, todayISO); }
        catch (error) { failed++; logError('processCreditCardSettlements', error); }
      }
    }
    if (failed) throw new Error(`credit-card reconciliation failed for ${failed} users`);
  },
);
