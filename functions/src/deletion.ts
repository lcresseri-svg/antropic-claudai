import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { db, logError } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// USER CLEANUP
//
// When a user document is deleted (e.g. via account deletion flow),
// delete all their transactions and settings to avoid orphaned data.
// ─────────────────────────────────────────────────────────────────────────────

export const onUserDeleted = onDocumentDeleted(
  // Recursive delete of large datasets can take a while: give it room.
  { document: 'users/{userId}', region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' },
  async (event) => {
    const userId = event.params.userId;

    // 1) Wipe the user document and EVERY subcollection under it in one call:
    //    transactions, meta/* (incl. meta/activity), events/*, budgetHistory/*,
    //    forecastSnapshots/*, derived/*, … recursiveDelete paginates internally
    //    and is safe on large datasets — so metrics activity/events are purged too.
    try {
      await db.recursiveDelete(db.doc(`users/${userId}`));
    } catch (err) {
      logError(`onUserDeleted: recursiveDelete failed for ${userId}`, err);
    }

    // 2) Expense-shortcut tokens are top-level (not under the user) — delete the
    //    ones owned by this user so no orphaned credentials remain.
    try {
      const toks = await db.collection('expenseTokens').where('uid', '==', userId).get();
      for (let i = 0; i < toks.docs.length; i += 400) {
        const batch = db.batch();
        toks.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      logError(`onUserDeleted: expenseTokens cleanup failed for ${userId}`, err);
    }

    // 3) Feedback is a top-level collection carrying the user's uid/email —
    //    purge it for full account deletion (privacy).
    try {
      const fb = await db.collection('feedback').where('userId', '==', userId).get();
      for (let i = 0; i < fb.docs.length; i += 400) {
        const batch = db.batch();
        fb.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      logError(`onUserDeleted: feedback cleanup failed for ${userId}`, err);
    }

    console.log(`onUserDeleted: purged all data for user ${userId}`);
  }
);
