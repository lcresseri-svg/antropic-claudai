import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';

admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING TRANSACTIONS
//
// Convention: a Transaction with `recurring` set is a TEMPLATE.
// Its `date` field = date of the NEXT occurrence (always in the future after
// the function runs). Each day at 06:00 the function finds all templates
// where `date <= today` and materializes EVERY due occurrence (catch-up loop),
// stamping each instance with the template's `seriesId` so the client can
// later edit/manage the whole series. The template's date is then advanced to
// its next future occurrence.
//
// Composite index required (see firestore.indexes.json):
//   collectionGroup: transactions | recurring ASC, date ASC
// ─────────────────────────────────────────────────────────────────────────────

type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

function addPeriod(dateStr: string, freq: Freq): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (freq === 'daily')   d.setUTCDate(d.getUTCDate() + 1);
  if (freq === 'weekly')  d.setUTCDate(d.getUTCDate() + 7);
  if (freq === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  if (freq === 'yearly')  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export const processRecurringTransactions = onSchedule(
  { schedule: '0 6 * * *', timeZone: 'Europe/Rome', memory: '256MiB', region: 'europe-west1' },
  async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Find all recurring transaction templates that are due (date <= today)
    const snapshot = await db.collectionGroup('transactions')
      .where('date', '<=', today)
      .get();

    let created = 0;

    for (const doc of snapshot.docs) {
      const tx = doc.data() as Record<string, unknown>;
      const recurring = tx.recurring as { freq: Freq; until?: string } | undefined;
      if (!recurring) continue;

      // Extract userId from Firestore path: users/{userId}/transactions/{txId}
      const userId = doc.ref.path.split('/')[1];
      const txsRef = db.collection(`users/${userId}/transactions`);

      // Stable series id linking this template to every instance it spawns.
      // Backfill from the template's own doc id for legacy templates.
      const seriesId = (tx.seriesId as string | undefined) ?? doc.id;

      // Instance copy: drop the recurring rule and the stored id; keep seriesId.
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
      }

      if (advanced) {
        // Advance the template to its next future occurrence; backfill seriesId.
        batch.update(doc.ref, { date, seriesId });
        await batch.commit();
      }
    }

    console.log(`processRecurringTransactions: created ${created} instances for ${today}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// USER CLEANUP
//
// When a user document is deleted (e.g. via account deletion flow),
// delete all their transactions and settings to avoid orphaned data.
// ─────────────────────────────────────────────────────────────────────────────

export const onUserDeleted = onDocumentDeleted(
  { document: 'users/{userId}', region: 'europe-west1' },
  async (event) => {
    const userId = event.params.userId;
    const txsRef = db.collection(`users/${userId}/transactions`);

    // Delete in batches of 400
    let snapshot = await txsRef.limit(400).get();
    while (!snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      snapshot = await txsRef.limit(400).get();
    }

    console.log(`onUserDeleted: cleaned up data for user ${userId}`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// AI DIGEST
//
// Generates a 2-3 sentence Italian financial summary using Google Gemini.
// GEMINI_API_KEY must be set via: firebase functions:secrets:set GEMINI_API_KEY
// ─────────────────────────────────────────────────────────────────────────────

export const generateDigest = onRequest(
  // onRequest (plain HTTP) instead of onCall: the callable protocol was
  // returning "internal" before our handler ran (project-level IAM/App Check
  // issue). A plain HTTP endpoint avoids that layer entirely.
  { region: 'europe-west1', cors: true },
  async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    try {
      if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

      const { income, expenses, investments, saved, topInsights } = (req.body ?? {}) as {
        income: number; expenses: number; investments: number; saved: number; topInsights: string[];
      };

      if (!apiKey) { res.json({ sentences: [`DEBUG: GEMINI_API_KEY assente nell'ambiente`] }); return; }

      const prompt =
       `Sei l'assistente finanziario dell'app Sunny. ` +
      `Scrivi esattamente 2-3 frasi in italiano sintetico e diretto che riassumono la situazione finanziaria del mese. ` +
      `Il mese potrebbe essere ancora in corso: non dire che l'utente è "in perdita", "in negativo" o "sotto" solo perché alcune entrate previste non sono ancora arrivate. ` +
      `Interpreta entrate, uscite e risparmio come dati parziali se il mese non è finito. ` +
      `Se le uscite sono alte rispetto alle entrate registrate, usa un tono prudente e parla di ritmo di spesa da monitorare, non di perdita definitiva. ` +
      `Dati attuali: entrate registrate ${income}€, uscite registrate ${expenses}€, investito ${investments}€, saldo/risparmio registrato ${saved}€. ` +
      `Insight principali: ${(topInsights ?? []).slice(0, 5).join('; ')}. ` +
      `Non usare markdown. Solo testo piano, frasi brevi, tono positivo e concreto.`;

      const gemResp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );

      if (!gemResp.ok) {
        const body = await gemResp.text();
        console.error('Gemini REST non-2xx:', gemResp.status, body);
        res.json({ sentences: [`DEBUG http=${gemResp.status} keyLen=${apiKey.length}`, `body=${body.slice(0, 200)}`] });
        return;
      }

      const data = (await gemResp.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
      if (!text) { res.json({ sentences: [`DEBUG: risposta vuota`, `raw=${JSON.stringify(data).slice(0, 180)}`] }); return; }

      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);
      res.json({ sentences });
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Unknown';
      const msg = err instanceof Error ? err.message : String(err);
      console.error('generateDigest failed:', err);
      res.json({ sentences: [`DEBUG keyLen=${apiKey?.length ?? 0} ${name}`, `err=${msg.slice(0, 200)}`] });
    }
  }
);
