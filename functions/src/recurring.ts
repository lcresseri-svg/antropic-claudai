import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, sendToUser, addPeriod, Freq } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING TRANSACTIONS
//
// Convention: a Transaction with `recurring` set is a TEMPLATE.
// Its `date` field = date of the NEXT occurrence (always in the future after
// the function runs). Each day the function finds all templates where
// `date <= today` and materializes EVERY due occurrence (catch-up loop),
// stamping each instance with the template's `seriesId` so the client can
// later edit/manage the whole series. The template's date is then advanced to
// its next future occurrence.
//
// Composite index required (see firestore.indexes.json):
//   collectionGroup: transactions | recurring ASC, date ASC
// ─────────────────────────────────────────────────────────────────────────────

export const processRecurringTransactions = onSchedule(
  { schedule: '0 0 * * *', timeZone: 'Europe/Rome', memory: '256MiB', region: 'europe-west1' },
  async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Read ONLY recurring templates (documents that have a `recurring` field).
    // We intentionally do NOT filter by date here — that would force Firestore to
    // scan every historical transaction just to find the handful of templates.
    // Instead we let the `while (date <= today)` loop below skip future templates.
    // The existing collectionGroup index on `recurring, date` covers this query.
    const snapshot = await db.collectionGroup('transactions')
      .where('recurring', '!=', null)
      .orderBy('recurring')
      .get();

    let created = 0;
    const createdByUser: Record<string, number> = {};

    for (const doc of snapshot.docs) {
      const tx = doc.data() as Record<string, unknown>;
      const recurring = tx.recurring as { freq: Freq; until?: string } | undefined;
      if (!recurring) continue;

      // Extract userId from Firestore path: users/{userId}/transactions/{txId}
      const userId = doc.ref.path.split('/')[1];

      try {
        const txsRef = db.collection(`users/${userId}/transactions`);

        // Stable series id linking this template to every instance it spawns.
        // Backfill from the template's own doc id for legacy templates.
        const seriesId = (tx.seriesId as string | undefined) ?? doc.id;

        // Instance copy: drop the recurring rule and the stored id; keep seriesId
        // AND groupId. A SHARED series repeats whole — the storno transfer is its
        // own template advancing in lockstep — so month N's expense and storno
        // instances share groupId + date. The client only groups SAME-DATE
        // siblings at edit time, so months can't cross-contaminate.
        const { recurring: _r, id: _id, ...instanceData } = tx;
        const batch = db.batch();

        // CATCH-UP: materialize EVERY missed occurrence (date <= today) in one run,
        // not just the next one, so a template that fell behind (or whose `until`
        // already passed) still produces all its due instances. Guard caps runaway.
        let date = tx.date as string;
        let guard = 400;
        let advanced = false;
        while (date <= today && (!recurring.until || date <= recurring.until) && guard-- > 0) {
          const newRef = txsRef.doc();
          // Override date: each catch-up instance lands on its own occurrence date,
          // not the template's original (first) date carried in instanceData.
          batch.set(newRef, { ...instanceData, id: newRef.id, seriesId, date });
          date = addPeriod(date, recurring.freq);
          advanced = true;
          created++;
          createdByUser[userId] = (createdByUser[userId] ?? 0) + 1;
        }

        if (advanced) {
          // Always advance the template to its next date — even past `until`, in
          // which case it becomes an EXPIRED template (kept in Firestore, hidden
          // from the client's lists/totals, still resolvable as a series).
          // NON-DESTRUCTIVE: we never delete templates here.
          batch.update(doc.ref, { date, seriesId });
          await batch.commit();
        }
        // An orphan template already past `until` is left in place (expired/hidden);
        // it is intentionally NOT deleted.
      } catch (err) {
        console.error(`processRecurringTransactions: failed for template ${doc.id} (user ${userId}):`, err);
      }
    }

    // Notify each user about what was auto-recorded today.
    for (const [userId, count] of Object.entries(createdByUser)) {
      await sendToUser(
        userId,
        'Voci ricorrenti registrate 🔁',
        count === 1
          ? 'Ho registrato 1 voce ricorrente programmata per oggi.'
          : `Ho registrato ${count} voci ricorrenti programmate per oggi.`,
        'recurring',
        'recurring',
      );
    }

    console.log(`processRecurringTransactions: created ${created} instances for ${today}`);
  }
);
