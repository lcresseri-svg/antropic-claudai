import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';

admin.initializeApp();
const db = admin.firestore();

const APP_LINK = 'https://sunny-a2a98.web.app/';

// ─────────────────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS (FCM)
//
// Tokens + reminder preferences live in users/{uid}/meta/push:
//   { tokens: { [token]: true }, reminders: { logExpenses, recurring, monthly } }
// We send data-only messages; the service worker renders the notification.
// ─────────────────────────────────────────────────────────────────────────────

const euro = (n: number) => `${Math.round(n)}€`;

/** Send to every token of a user, optionally gated on a reminder preference.
 *  Prunes tokens FCM reports as no longer valid. */
async function sendToUser(
  userId: string,
  title: string,
  body: string,
  requireReminder?: 'logExpenses' | 'recurring' | 'monthly',
  tag?: string,
): Promise<void> {
  const ref = db.doc(`users/${userId}/meta/push`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() ?? {};

  if (requireReminder) {
    const reminders = (data.reminders ?? {}) as Record<string, boolean>;
    if (reminders[requireReminder] === false) return; // default ON when unset
  }

  const tokens = Object.keys((data.tokens ?? {}) as Record<string, boolean>);
  if (tokens.length === 0) return;

  // Send the notification via webpush.notification so the FCM service worker
  // auto-displays it in the background — the reliable path on iOS PWAs, where
  // data-only messages + a custom handler are flaky. Keep `data.link` for the
  // foreground handler / click target.
  // NB: no `icon` — iOS cannot render SVG notification icons (our only icon is
  // an SVG) and silently drops it; without one, iOS falls back to the app icon.
  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    webpush: {
      notification: { title, body, tag: tag ?? 'sunny' },
      fcmOptions: { link: APP_LINK },
    },
    data: { link: APP_LINK },
  });

  const updates: Record<string, unknown> = {};
  resp.responses.forEach((r, i) => {
    const code = r.success ? '' : (r.error?.code ?? '');
    if (code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-argument' ||
        code === 'messaging/invalid-registration-token') {
      updates[`tokens.${tokens[i]}`] = admin.firestore.FieldValue.delete();
    }
  });
  if (Object.keys(updates).length > 0) await ref.update(updates);
}

/** Users who have at least one token and haven't disabled the given reminder. */
async function usersWithReminder(key: 'logExpenses' | 'recurring' | 'monthly'): Promise<string[]> {
  const snap = await db.collectionGroup('meta').get();
  const out: string[] = [];
  for (const d of snap.docs) {
    if (d.id !== 'push') continue;
    const data = d.data() ?? {};
    const tokens = (data.tokens ?? {}) as Record<string, boolean>;
    if (Object.keys(tokens).length === 0) continue;
    const reminders = (data.reminders ?? {}) as Record<string, boolean>;
    if (reminders[key] === false) continue;
    const userId = d.ref.parent.parent?.id;
    if (userId) out.push(userId);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURRING TRANSACTIONS
//
// Convention: a Transaction with `recurring` set is a TEMPLATE.
// Its `date` field = date of the NEXT occurrence (always in the future after
// the function runs). Each day at 09:00 the function finds all templates
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
  { schedule: '0 9 * * *', timeZone: 'Europe/Rome', memory: '256MiB', region: 'europe-west1' },
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
        createdByUser[userId] = (createdByUser[userId] ?? 0) + 1;
      }

      if (advanced) {
        // Advance the template to its next future occurrence; backfill seriesId.
        batch.update(doc.ref, { date, seriesId });
        await batch.commit();
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

// Manual end-to-end test: sends a one-off notification to the caller's tokens.
// HTTP (onRequest) so it can be triggered from the app's settings.
export const sendTestPush = onRequest(
  { region: 'europe-west1', cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const { uid } = (req.body ?? {}) as { uid?: string };
      if (!uid) { res.status(400).json({ ok: false, error: 'missing-uid' }); return; }

      const ref = db.doc(`users/${uid}/meta/push`);
      const snap = await ref.get();
      const tokens = Object.keys((snap.data()?.tokens ?? {}) as Record<string, boolean>);
      if (tokens.length === 0) { res.json({ ok: false, error: 'no-tokens' }); return; }

      await sendToUser(uid, 'Notifica di prova ✅', 'Le notifiche di Sunny funzionano correttamente.', undefined, 'test');
      res.json({ ok: true, tokens: tokens.length });
    } catch (err) {
      console.error('sendTestPush failed:', err);
      res.status(500).json({ ok: false, error: String(err) });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// REMINDERS
// ─────────────────────────────────────────────────────────────────────────────

// "Did you log your expenses?" — at 13:00 and 21:00 Europe/Rome, but only for
// users who haven't recorded any expense yet today.
export const remindLogExpenses = onSchedule(
  { schedule: '0 13,21 * * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const hourRome = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(new Date()),
    );
    const evening = hourRome >= 18;

    const users = await usersWithReminder('logExpenses');
    for (const userId of users) {
      // Always send — the reminder is a nudge to review/confirm the day,
      // regardless of whether something was already logged.
      await sendToUser(
        userId,
        evening ? 'Spese di oggi 🌙' : 'Promemoria spese ☀️',
        evening
          ? 'Hai segnato le spese di oggi? Bastano pochi secondi.'
          : 'Ricordati di registrare le spese di stamattina.',
        'logExpenses',
        'log-expenses',
      );
    }
  }
);

// TEMPORARY: one-off 14:00 test — remove after confirming delivery.
export const testPush14 = onSchedule(
  { schedule: '0 14 * * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const users = await usersWithReminder('logExpenses');
    for (const userId of users) {
      await sendToUser(userId, 'Test 14:00 🔔', 'Le notifiche schedulate funzionano correttamente.', undefined, 'test-14');
    }
  }
);

// Start-of-month summary of the previous month — 09:00 on the 1st.
export const sendMonthlySummary = onSchedule(
  { schedule: '0 9 1 * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const ym = lastMonth.toISOString().slice(0, 7); // YYYY-MM

    const users = await usersWithReminder('monthly');
    for (const userId of users) {
      const snap = await db.collection(`users/${userId}/transactions`)
        .where('date', '>=', `${ym}-01`)
        .where('date', '<=', `${ym}-31`)
        .get();

      let income = 0, expenses = 0, investments = 0, txCount = 0;
      snap.forEach(d => {
        const t = d.data() as { type?: string; amount?: number; shared?: number };
        const amount = Number(t.amount) || 0;
        if (t.type === 'income') income += amount;
        else if (t.type === 'expense') { expenses += amount - (Number(t.shared) || 0); txCount++; }
        else if (t.type === 'investment') { investments += amount; txCount++; }
        else txCount++;
      });
      if (income === 0 && expenses === 0 && investments === 0) continue;

      const saved = income - expenses - investments;
      // Percentages teased relative to income (the natural "how much did I keep?").
      const pct = (n: number) => (income > 0 ? Math.round((n / income) * 100) : 0);
      const savedPct = pct(saved);
      const invPct = pct(investments);
      const expPct = pct(expenses);

      // Lead with the most motivating number: the savings rate.
      const verdict =
        savedPct >= 30 ? 'Mese da fuoriclasse 🔥'
        : savedPct >= 15 ? 'Bel risparmio 💪'
        : savedPct > 0 ? 'In positivo 🙂'
        : 'Mese in rosso 👀';

      await sendToUser(
        userId,
        `Riepilogo del mese 📊 — ${verdict}`,
        `Hai messo da parte ${euro(saved)}, il ${savedPct}% delle entrate.\n` +
        `Entrate ${euro(income)} · Uscite ${euro(expenses)} (${expPct}%) · Investito ${euro(investments)} (${invPct}%) · ${txCount} movimenti.`,
        'monthly',
        'monthly',
      );
    }
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
        `Scrivi esattamente 2-3 frasi in italiano sintetico e diretto che riassumono ` +
        `la situazione finanziaria di questo mese. ` +
        `Dati: entrate ${income}€, uscite ${expenses}€, investito ${investments}€, risparmio ${saved}€. ` +
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
