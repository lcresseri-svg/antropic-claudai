import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, sendToUser, addPeriod, Freq } from './shared';

const r2 = (n: number) => Math.round(n * 100) / 100;

interface CategoryLike {
  id?: string;
  kind?: string;
  currentValue?: number;
  lastValueUpdate?: string;
  [k: string]: unknown;
}

/**
 * Controvalore sync for CF-materialized instances — mirrors the client's
 * investmentValueCore semantics:
 *   versamento (direction ≠ 'out') → currentValue += amount
 *   prelievo   (direction 'out')   → currentValue −= amount (mai < 0, clamp
 *                                    sequenziale dentro la stessa run)
 * Missing currentValue starts from 0; a fully-clamped no-op never materializes
 * an explicit value; initialBalance/tfrAmount are untouched. Returns the delta
 * ACTUALLY applied — stamped on the instance as `valueEffect` so the client
 * treats it as managed (exact revert on edit/delete, never re-applied).
 */
function applyInstanceValueDelta(
  categories: CategoryLike[],
  instance: Record<string, unknown>,
  todayISO: string,
): { delta: number; changed: boolean } {
  if (instance.type !== 'investment') return { delta: 0, changed: false };
  const amount = Number(instance.amount);
  const categoryId = instance.category as string | undefined;
  if (!categoryId || !Number.isFinite(amount) || amount <= 0) return { delta: 0, changed: false };
  const requested = instance.direction === 'out' ? -amount : amount;

  const cat = categories.find(c => c.id === categoryId);
  if (!cat || cat.kind !== 'investment') return { delta: 0, changed: false };
  const before = typeof cat.currentValue === 'number' ? cat.currentValue : 0;
  const after = r2(Math.max(0, before + requested));
  const applied = r2(after - before);
  if (applied === 0) return { delta: 0, changed: false };
  cat.currentValue = after;
  cat.lastValueUpdate = todayISO;
  return { delta: applied, changed: true };
}

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

        // Instance copy: drop the recurring rule, the stored id and any stray
        // valueEffect stamp (a template is a pointer, never a managed flow);
        // keep seriesId AND groupId. A SHARED series repeats whole — the storno
        // transfer is its own template advancing in lockstep — so month N's
        // expense and storno instances share groupId + date. The client only
        // groups SAME-DATE siblings at edit time, so months can't cross-contaminate.
        const { recurring: _r, id: _id, valueEffect: _ve, ...instanceData } = tx;
        const isInvestment = tx.type === 'investment';
        const settingsRef = db.doc(`users/${userId}/meta/settings`);

        // CATCH-UP inside ONE Firestore transaction: instances, template advance
        // and (for investment series) the controvalore update commit together —
        // atomic and idempotent (a re-run sees the already-advanced template and
        // creates nothing). Guard 400 keeps writes well under the 500 limit.
        const createdHere = await db.runTransaction(async (trx) => {
          const settingsSnap = isInvestment ? await trx.get(settingsRef) : null;
          const categories: CategoryLike[] =
            ((settingsSnap?.data()?.categories as CategoryLike[] | undefined) ?? [])
              .map(c => ({ ...c }));

          let date = tx.date as string;
          let guard = 400;
          let count = 0;
          let valuesChanged = false;
          const now = Date.now();
          while (date <= today && (!recurring.until || date <= recurring.until) && guard-- > 0) {
            const newRef = txsRef.doc();
            // Override date: each catch-up instance lands on its own occurrence
            // date, not the template's original (first) date in instanceData.
            const instance: Record<string, unknown> = { ...instanceData, id: newRef.id, seriesId, date };
            if (isInvestment && settingsSnap?.exists) {
              // Sequentially-clamped controvalore effect, stamped on the
              // instance so the client treats it as managed (exact revert on
              // edit/delete, never applied twice).
              const { delta, changed } = applyInstanceValueDelta(categories, instance, today);
              if (changed) valuesChanged = true;
              instance.valueEffect = { category: instance.category, delta, appliedAt: now };
            }
            trx.set(newRef, instance);
            date = addPeriod(date, recurring.freq);
            count++;
          }

          if (count > 0) {
            // Always advance the template to its next date — even past `until`,
            // in which case it becomes an EXPIRED template (kept in Firestore,
            // hidden from lists/totals, still resolvable as a series).
            // NON-DESTRUCTIVE: we never delete templates here.
            trx.update(doc.ref, { date, seriesId });
            if (valuesChanged) trx.update(settingsRef, { categories });
          }
          return count;
        });

        created += createdHere;
        if (createdHere > 0) {
          createdByUser[userId] = (createdByUser[userId] ?? 0) + createdHere;
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
