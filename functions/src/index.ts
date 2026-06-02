import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';

admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING TRANSACTIONS
//
// Convention: a Transaction with `recurring` set is a TEMPLATE.
// Its `date` field = date of the NEXT occurrence (always in the future after
// the function runs). Each day at 06:00 the function finds all templates
// where `date <= today`, creates a non-recurring instance for that date,
// and advances the template's date by the configured frequency.
//
// Composite index required (see firestore.indexes.json):
//   collectionGroup: transactions | recurring ASC, date ASC
// ─────────────────────────────────────────────────────────────────────────────

type Freq = 'weekly' | 'monthly' | 'yearly';

function addPeriod(dateStr: string, freq: Freq): string {
  const d = new Date(dateStr + 'T00:00:00Z');
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
      if (recurring.until && recurring.until < today) continue;

      // Extract userId from Firestore path: users/{userId}/transactions/{txId}
      const userId = doc.ref.path.split('/')[1];
      const txsRef = db.collection(`users/${userId}/transactions`);

      // Create a non-recurring instance for the due date
      const { recurring: _r, id: _id, ...instanceData } = tx;
      const newRef = txsRef.doc();
      const batch = db.batch();
      batch.set(newRef, { ...instanceData, id: newRef.id });

      // Advance the template to the next occurrence
      const nextDate = addPeriod(tx.date as string, recurring.freq);
      batch.update(doc.ref, { date: nextDate });

      await batch.commit();
      created++;
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

export const generateDigest = onCall(
  { region: 'europe-west1', cors: true },
  async (req) => {
    const { income, expenses, investments, saved, topInsights } = req.data as {
      income: number;
      expenses: number;
      investments: number;
      saved: number;
      topInsights: string[];
    };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt =
      `Sei l'assistente finanziario dell'app Sunny. ` +
      `Scrivi esattamente 2-3 frasi in italiano sintetico e diretto che riassumono ` +
      `la situazione finanziaria di questo mese. ` +
      `Dati: entrate ${income}€, uscite ${expenses}€, investito ${investments}€, risparmio ${saved}€. ` +
      `Insight principali: ${topInsights.slice(0, 5).join('; ')}. ` +
      `Non usare markdown. Solo testo piano, frasi brevi, tono positivo e concreto.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);
    return { sentences };
  }
);
