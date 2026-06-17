import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentDeleted, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { createHash, randomBytes } from 'crypto';

admin.initializeApp();
const db = admin.firestore();

const APP_LINK = 'https://sunny-a2a98.web.app/';

// Origins allowed to call the HTTP endpoints. Replaces the previous `cors: true`
// (which let any site invoke the functions). localhost is kept for local dev.
const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://sunny-a2a98.web.app',
  'https://sunny-a2a98.firebaseapp.com',
  /^http:\/\/localhost:\d+$/,
];

/** Verify the Firebase ID token in the `Authorization: Bearer <token>` header.
 *  Returns the authenticated uid, or null when the token is missing/invalid.
 *  HTTP endpoints must reject (401) when this returns null. */
async function verifyBearer(authHeader?: string): Promise<string | null> {
  const m = (authHeader ?? '').match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

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
  requireReminder?: 'logExpenses' | 'recurring' | 'monthly' | 'upcomingPayments' | 'inactivityReminder',
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
async function usersWithReminder(key: 'logExpenses' | 'recurring' | 'monthly' | 'upcomingPayments' | 'inactivityReminder'): Promise<string[]> {
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
          if (recurring.until && date > recurring.until) {
            // The series reached its end this run: delete the template instead of
            // advancing it past `until` (which would leave an orphan "Programmato").
            batch.delete(doc.ref);
            console.log(`processRecurringTransactions: series ${doc.id} (user ${userId}) ended (until=${recurring.until}); template deleted`);
          } else {
            // Advance the template to its next future occurrence; backfill seriesId.
            batch.update(doc.ref, { date, seriesId });
          }
          await batch.commit();
        } else if (recurring.until && date > recurring.until) {
          // Orphan template already sitting past its end bound (e.g. the user lowered
          // `until` below the next occurrence on a series edit) → clean it up.
          await doc.ref.delete();
          console.log(`processRecurringTransactions: deleted expired orphan template ${doc.id} (user ${userId}, until=${recurring.until})`);
        }
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

// Manual end-to-end test: sends a one-off notification to the caller's tokens.
// HTTP (onRequest) so it can be triggered from the app's settings.
export const sendTestPush = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      // Derive the target user from the verified token — never trust a body uid,
      // otherwise anyone could spam test pushes to any account.
      const uid = await verifyBearer(req.headers.authorization);
      if (!uid) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }

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

// Upcoming payments reminder — 18:00 daily Europe/Rome.
// Checks tomorrow's one-off transactions and recurring templates due tomorrow.
// Deduplicates by description (case-insensitive) and composes a human-readable
// summary so the user can prepare cash or verify the amounts.
export const remindUpcomingPayments = onSchedule(
  { schedule: '0 18 * * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    // fr-CA locale gives YYYY-MM-DD in Rome TZ.
    const todayRome = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const tomorrow = addPeriod(todayRome, 'daily');

    const users = await usersWithReminder('upcomingPayments');
    for (const userId of users) {
      const txsRef = db.collection(`users/${userId}/transactions`);

      // One-off transactions already on Firestore with a future date.
      const oneOffSnap = await txsRef
        .where('date', '==', tomorrow)
        .get();

      // Recurring templates: `date` = next occurrence (kept current by processRecurring).
      const recurringSnap = await txsRef
        .where('recurring', '!=', null)
        .get();

      type TxRow = { desc: string; amount: number };
      const seen = new Set<string>();
      const items: TxRow[] = [];

      const add = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
        const t = d.data() as { type?: string; amount?: number; description?: string; recurring?: unknown };
        if (t.type === 'transfer') return;
        const desc = (t.description ?? '').trim();
        const key = desc.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        items.push({ desc: desc || '—', amount: Number(t.amount) || 0 });
      };

      oneOffSnap.forEach(d => {
        const t = d.data() as { recurring?: unknown };
        if (t.recurring != null) return; // skip templates (handled below)
        add(d);
      });

      recurringSnap.forEach(d => {
        const t = d.data() as { date?: string };
        if (t.date === tomorrow) add(d);
      });

      if (items.length === 0) continue;

      let body: string;
      if (items.length === 1) {
        body = `📅 Domani: ${items[0].desc} ${euro(items[0].amount)}`;
      } else if (items.length === 2) {
        body = `📅 Domani: ${items[0].desc} ${euro(items[0].amount)} e ${items[1].desc} ${euro(items[1].amount)}`;
      } else {
        body = `📅 Domani: ${items[0].desc}, ${items[1].desc} e altri ${items.length - 2} pagamenti`;
      }

      await sendToUser(userId, 'Pagamenti di domani 📅', body, 'upcomingPayments', 'upcoming-payments');
    }
  }
);

// Inactivity reminder — 21:00 daily Europe/Rome.
// Finds the most recent non-projected transaction and nudges when it's 5+ days
// old. Skipped in the first 3 days of the month (user may be starting fresh).
export const remindInactivity = onSchedule(
  { schedule: '0 21 * * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const todayRome = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const dayOfMonth = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome', day: 'numeric',
    }).format(new Date()));
    // Skip the first 3 days — the user may simply be starting fresh for the month.
    if (dayOfMonth <= 3) return;

    const users = await usersWithReminder('inactivityReminder');
    for (const userId of users) {
      // Find the most recent transaction that is not a projection.
      const snap = await db.collection(`users/${userId}/transactions`)
        .where('date', '<=', todayRome)
        .orderBy('date', 'desc')
        .limit(1)
        .get();

      if (snap.empty) continue; // new user with no transactions yet — skip

      const lastDoc = snap.docs[0].data() as { date?: string; projected?: boolean };
      if (lastDoc.projected === true) continue; // projection placeholder — skip

      const lastDate = lastDoc.date ?? '';
      if (!lastDate) continue;

      // Whole-day difference: parse as UTC midnight strings.
      const msPerDay = 86400000;
      const daysSince = Math.floor(
        (new Date(todayRome + 'T00:00:00Z').getTime() - new Date(lastDate + 'T00:00:00Z').getTime()) / msPerDay,
      );

      if (daysSince < 5) continue;

      const title = daysSince >= 7
        ? '🤔 Una settimana senza movimenti'
        : `🤔 Nessun movimento da ${daysSince} giorni`;
      const body = daysSince >= 7
        ? `Non registri spese da ${daysSince} giorni — tutto ok?`
        : 'Hai spese da registrare? Bastano pochi secondi.';

      await sendToUser(userId, title, body, 'inactivityReminder', 'inactivity');
    }
  }
);

// Month-end summary — 19:00 on days 28–31, Europe/Rome.
// Fires only on the actual last day of the month; the other late-month
// invocations exit immediately after the guard check. Uses the same `monthly`
// reminder key as `sendMonthlySummary` — one preference covers both.
export const remindMonthEnd = onSchedule(
  { schedule: '0 19 28-31 * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const todayRome = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    // If tomorrow is the 1st, today is the last day of the month.
    const tomorrowDay = Number(addPeriod(todayRome, 'daily').slice(8, 10));
    if (tomorrowDay !== 1) return;

    const ym = todayRome.slice(0, 7); // YYYY-MM

    const users = await usersWithReminder('monthly');
    for (const userId of users) {
      const snap = await db.collection(`users/${userId}/transactions`)
        .where('date', '>=', `${ym}-01`)
        .where('date', '<=', todayRome)
        .get();

      let income = 0, expenses = 0, investments = 0;
      snap.forEach(d => {
        const t = d.data() as { type?: string; amount?: number; shared?: number };
        const amount = Number(t.amount) || 0;
        if (t.type === 'income') income += amount;
        else if (t.type === 'expense') expenses += amount - (Number(t.shared) || 0);
        else if (t.type === 'investment') investments += amount;
      });
      if (income === 0 && expenses === 0 && investments === 0) continue;

      await sendToUser(
        userId,
        '🗓️ Oggi chiude il mese — com\'è andata?',
        `Finora: entrate ${euro(income)} · uscite ${euro(expenses)} · investito ${euro(investments)}. Apri Sunny per il quadro completo.`,
        'monthly',
        'month-end',
      );
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// ENCOURAGING INSIGHT — every ~48h at 11:00 Europe/Rome (a slot no other
// reminder uses). Sends ONE positive insight, chosen at random, from a pool the
// client pre-computes at users/{uid}/derived/encouraging:
//   { items: [{ title, detail, minDepth }], updatedAt, lastSentTitle?, lastSentAt? }
// Only users who opted in (meta/push.reminders.encouragement === true) and have
// at least one FCM token receive it. This preference defaults OFF.
//
// "Random" = the chosen insight is random, NOT the time of day. Per-user random
// send times would need per-user scheduling, which is out of scope.
//
// Cron caveat: cron can't express a true rolling 48h. `*/2` on day-of-month
// resets at month boundaries (e.g. the 31st → the 2nd), so the real gap is
// 24–48h around month ends. Accepted approximation.
// ─────────────────────────────────────────────────────────────────────────────

const INSIGHT_DEPTH_ORDER = ['minimal', 'medium', 'advanced'];

export const sendEncouragingInsight = onSchedule(
  { schedule: '0 11 */2 * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const metaSnap = await db.collectionGroup('meta').get();
    for (const d of metaSnap.docs) {
      if (d.id !== 'push') continue;
      const data = d.data() ?? {};
      const tokens = (data.tokens ?? {}) as Record<string, boolean>;
      if (Object.keys(tokens).length === 0) continue;
      const reminders = (data.reminders ?? {}) as Record<string, boolean>;
      if (reminders.encouragement !== true) continue; // opt-in only; default OFF
      const userId = d.ref.parent.parent?.id;
      if (!userId) continue;

      // Per-user analysis depth (default 'medium', matching the app default).
      const settingsSnap = await db.doc(`users/${userId}/meta/settings`).get();
      const depth = ((settingsSnap.data()?.insightDepth) as string | undefined) ?? 'medium';
      const depthIdx = Math.max(0, INSIGHT_DEPTH_ORDER.indexOf(depth));

      // Client-precomputed pool of positive insights for this user.
      const poolRef = db.doc(`users/${userId}/derived/encouraging`);
      const pool = (await poolRef.get()).data();
      if (!pool) continue;
      const items = ((pool.items ?? []) as Array<{ title?: string; detail?: string; minDepth?: string }>)
        .filter(it => it.title && INSIGHT_DEPTH_ORDER.indexOf(it.minDepth ?? 'advanced') <= depthIdx);
      if (items.length === 0) continue; // no fake fallback — just skip this user

      // Avoid repeating the last sent insight when an alternative exists.
      const lastSentTitle = (pool.lastSentTitle as string | undefined) ?? '';
      const pickable = items.filter(it => it.title !== lastSentTitle);
      const choices = pickable.length > 0 ? pickable : items;
      const chosen = choices[Math.floor(Math.random() * choices.length)];
      const title = chosen.title as string;
      const body = chosen.detail && (title.length + chosen.detail.length + 3) <= 120
        ? `${title} — ${chosen.detail}`
        : title;

      // Opt-in already enforced above, so no requireReminder gate here.
      await sendToUser(userId, 'Sunny', body, undefined, 'encouragement');
      await poolRef.set(
        { lastSentTitle: title, lastSentAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
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
// AI COACH — "Posso permettermi…?"
//
// Checks affordability of a purchase given the user's financial situation.
// Rate-limited to MAX_AI_CALLS_PER_DAY per user per UTC day (no token waste).
// Rate limit state lives in users/{uid}/meta/aiCoach:
//   { dailyCount: number; lastResetDay: string }  (YYYY-MM-DD UTC)
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_UID = 'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2';
const MAX_AI_CALLS_PER_DAY = 20;

export const generateAffordabilityAdvice = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }

      const uid = await verifyBearer(req.headers.authorization);
      if (!uid) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
      if (uid !== ADMIN_UID) { res.status(403).json({ ok: false, error: 'forbidden' }); return; }

      // ── Rate limit check (before any Firestore or Gemini reads) ──────────
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
      const rateLimitRef = db.doc(`users/${uid}/meta/aiCoach`);
      const rateLimitSnap = await rateLimitRef.get();
      const rl = (rateLimitSnap.data() ?? {}) as { dailyCount?: number; lastResetDay?: string };
      const currentCount = (rl.lastResetDay === today) ? (rl.dailyCount ?? 0) : 0;
      if (currentCount >= MAX_AI_CALLS_PER_DAY) {
        res.status(429).json({ ok: false, error: 'rate-limit', remaining: 0 });
        return;
      }

      // Load settings for category labels. NOTE: the AI Coach is intentionally
      // INDEPENDENT of the `aiEnabled` flag (that one only gates the monthly
      // Gemini digest). The Coach is its own opt-in feature, gated client-side
      // by `aiCoachWidgetEnabled` + admin, so we do not block on aiEnabled here.
      const settingsSnap = await db.doc(`users/${uid}/meta/settings`).get();
      const settings = (settingsSnap.data() ?? {}) as { aiEnabled?: boolean; categories?: { id: string; label: string }[] };

      // ── Parse request body ────────────────────────────────────────────────
      const { itemName, cost, targetDate, priority } = (req.body ?? {}) as {
        itemName: string;
        cost: number;
        targetDate?: string;
        priority?: 'low' | 'medium' | 'high';
      };
      if (!itemName || !cost || cost <= 0) {
        res.status(400).json({ ok: false, error: 'invalid-request' });
        return;
      }

      // Category id → label map (for naming categories in the advice).
      const catDefs = settings.categories ?? [];
      const catLabel = (id: string) => catDefs.find(c => c.id === id)?.label ?? id;

      // ── Read transactions (last 90 days through the future) + budget ──────
      // No upper bound: the query also returns future-dated planned one-offs and
      // recurring templates (their `date` is the next, future occurrence).
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const [txSnap, budgetSnap] = await Promise.all([
        db.collection(`users/${uid}/transactions`).where('date', '>=', cutoffStr).get(),
        db.doc(`users/${uid}/meta/budget`).get(),
      ]);

      type TxDoc = {
        type?: string; amount?: number; shared?: number; category?: string;
        date?: string; seriesId?: string; recurring?: { freq?: Freq; until?: string };
      };
      const txs = txSnap.docs.map(d => d.data() as TxDoc);
      const budget = (budgetSnap.data() ?? {}) as {
        savingsTarget?: number;
        categoryBudgets?: Record<string, number>;
        incomeBudgets?: Record<string, number>;
        investmentBudgets?: Record<string, number>;
      };
      const ownShareOf = (t: TxDoc) => (Number(t.amount) || 0) - (Number(t.shared) || 0);

      const nowDate = new Date();
      const todayISO = nowDate.toISOString().slice(0, 10);
      const monthStart = todayISO.slice(0, 7); // YYYY-MM
      const lastDay = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
      const monthEnd = `${monthStart}-${String(lastDay).padStart(2, '0')}`;

      // Current month, split into REALIZED (date <= today) and UPCOMING (date > today).
      let incomeRealized = 0, expRealized = 0, investRealized = 0;
      let upcomingPlannedExp = 0;       // future-dated one-off expenses this month
      let upcomingPlannedInvest = 0;    // future-dated one-off investments this month
      const catSpend: Record<string, number> = {};   // realized variable spend by category
      for (const t of txs) {
        if (t.date?.slice(0, 7) !== monthStart) continue;
        const isFuture = (t.date ?? '') > todayISO;
        const isRecurringTemplate = !!t.recurring;
        const own = ownShareOf(t);
        if (t.type === 'income') {
          if (!isFuture && !isRecurringTemplate) incomeRealized += Number(t.amount) || 0;
        } else if (t.type === 'expense') {
          if (isRecurringTemplate) continue; // handled via the recurring projection below
          if (isFuture) { upcomingPlannedExp += own; }
          else {
            expRealized += own;
            if (!t.seriesId && t.category) catSpend[t.category] = (catSpend[t.category] ?? 0) + own;
          }
        } else if (t.type === 'investment') {
          if (isRecurringTemplate) continue;
          if (isFuture) upcomingPlannedInvest += Number(t.amount) || 0;
          else investRealized += Number(t.amount) || 0;
        }
      }

      // Upcoming RECURRING occurrences (expense & investment) still due this month.
      let upcomingRecurringExp = 0, upcomingRecurringInvest = 0;
      for (const t of txs) {
        const rule = t.recurring;
        if (!rule?.freq) continue;
        if (rule.until && rule.until < todayISO) continue;
        let d = t.date ?? todayISO;
        let guard = 500;
        while (d <= todayISO && --guard > 0) d = addPeriod(d, rule.freq);
        let cap = 40;
        while (d <= monthEnd && (!rule.until || d <= rule.until) && --cap > 0) {
          if (t.type === 'expense') upcomingRecurringExp += ownShareOf(t);
          else if (t.type === 'investment') upcomingRecurringInvest += Number(t.amount) || 0;
          d = addPeriod(d, rule.freq);
        }
      }

      // Recent (prior months) averages: variable expense, income, investment.
      const recentVarExp: Record<string, number> = {};
      const recentIncome: Record<string, number> = {};
      const recentInvest: Record<string, number> = {};
      for (const t of txs) {
        const mo = t.date?.slice(0, 7);
        if (!mo || mo === monthStart) continue;
        if ((t.date ?? '') > todayISO) continue; // ignore future when averaging history
        if (t.type === 'expense' && !t.seriesId && !t.recurring) {
          recentVarExp[mo] = (recentVarExp[mo] ?? 0) + ownShareOf(t);
        } else if (t.type === 'income' && !t.recurring) {
          recentIncome[mo] = (recentIncome[mo] ?? 0) + (Number(t.amount) || 0);
        } else if (t.type === 'investment' && !t.recurring) {
          recentInvest[mo] = (recentInvest[mo] ?? 0) + (Number(t.amount) || 0);
        }
      }
      const avg = (o: Record<string, number>) => {
        const v = Object.values(o); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
      };
      const avgVarExp = avg(recentVarExp);
      const avgInc = avg(recentIncome);
      const avgInvest = avg(recentInvest);

      const prog = Math.min(1, nowDate.getDate() / lastDay);
      const variableRemaining = Math.max(0, 1 - prog) * (avgVarExp > 0 ? avgVarExp : (prog > 0 ? expRealized / prog : 0));

      const projectedInc = Math.round(Math.max(incomeRealized, avgInc));
      const projectedExp = Math.round(expRealized + variableRemaining + upcomingRecurringExp + upcomingPlannedExp);
      const projectedInvest = Math.round(Math.max(investRealized, avgInvest) + upcomingRecurringInvest + upcomingPlannedInvest);

      // Savings = income − expenses − investments (investments are money set aside,
      // so they reduce free cash; they're also a lever the user can pause).
      const projectedMonthlySaving = projectedInc - projectedExp - projectedInvest;

      // Budget context.
      const savingsTarget = Math.max(0, Number(budget.savingsTarget) || 0);
      const plannedExpBudget = Object.values(budget.categoryBudgets ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
      const upcomingCommitted = Math.round(upcomingRecurringExp + upcomingPlannedExp);

      // ── Affordability over time (no "already saved" input) ────────────────
      // We never ask how much the user already has. We reason purely on the
      // saving pace: how many MONTHS of normal saving it takes to cover the
      // cost, and how that shortens if a slice of variable spending is trimmed.
      const safeSaving = Math.max(0, projectedMonthlySaving);

      // Top variable spending categories — candidates to trim.
      const topCuts = Object.entries(catSpend)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id, v]) => ({ categoryId: id, label: catLabel(id), amount: Math.round(v) }));

      // Realistic accelerated pace: assume ~30% can be shaved off the top
      // variable categories and redirected to the goal.
      const monthlyCutPotential = Math.round(topCuts.reduce((s, c) => s + c.amount * 0.3, 0));
      const acceleratedSaving = safeSaving + monthlyCutPotential;

      const monthsToAfford = safeSaving > 0 ? Math.ceil(cost / safeSaving) : null;
      const monthsToAffordWithCuts = acceleratedSaving > 0 ? Math.ceil(cost / acceleratedSaving) : null;

      // Small-purchase threshold: if a single month's saving covers the cost,
      // it fits THIS month without pushing the budget into the red. Otherwise
      // `monthOvershoot` is how much buying it all now would overshoot by.
      const fitsThisMonth = safeSaving > 0 && cost <= safeSaving;
      const monthOvershoot = safeSaving > 0 ? Math.max(0, Math.round(cost - safeSaving)) : Math.round(cost);
      const leftoverIfBought = fitsThisMonth ? Math.round(safeSaving - cost) : 0;

      // Project the calendar month you'd reach the goal (Italian month name).
      const MONTHS_IT = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
        'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
      const targetMonthName = (months: number | null): string | null => {
        if (months === null) return null;
        const d = new Date(nowDate.getFullYear(), nowDate.getMonth() + months, 1);
        return `${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
      };
      const readyByWithCuts = targetMonthName(monthsToAffordWithCuts);
      const readyByPace = targetMonthName(monthsToAfford);

      // Optional deadline: feasibility judged against the accelerated pace.
      let daysLeft: number | null = null;
      let requiredMonthly: number | null = null;
      let targetFeasible: boolean | null = null;
      if (targetDate) {
        const target = new Date(targetDate);
        daysLeft = Math.max(1, Math.ceil((target.getTime() - Date.now()) / 86400000));
        const monthsAvailable = daysLeft / 30.4;
        requiredMonthly = Math.round(cost / monthsAvailable);
        targetFeasible = requiredMonthly <= acceleratedSaving;
      }

      // ── Call Gemini for the Italian narrative ─────────────────────────────
      if (!apiKey) {
        console.error('generateAffordabilityAdvice: GEMINI_API_KEY missing');
        res.status(503).json({ ok: false, error: 'unavailable' });
        return;
      }

      // Build a compact, factual brief that CROSS-REFERENCES the whole picture:
      // income, expenses, investments, budget targets and already-committed
      // (recurring + planned) outflows. Let the model phrase it freely.
      const facts: string[] = [];
      facts.push(`Acquisto richiesto: "${itemName}", costo ${Math.round(cost)}€.`);
      facts.push(`Quadro mensile stimato — entrate ~${projectedInc}€, uscite ~${projectedExp}€, investimenti ~${projectedInvest}€, quindi risparmio netto ~${projectedMonthlySaving}€.`);
      if (projectedInvest > 0) {
        facts.push(`Degli investimenti, ~${projectedInvest}€/mese: sono una leva: l'utente potrebbe ridurli o sospenderli temporaneamente per liberare liquidità verso questo acquisto.`);
      }
      if (upcomingCommitted > 0) {
        facts.push(`Da qui a fine mese ci sono già spese impegnate per ~${upcomingCommitted}€ (ricorrenti ~${Math.round(upcomingRecurringExp)}€ + previste/programmate ~${Math.round(upcomingPlannedExp)}€): tienine conto, riducono il margine residuo del mese.`);
      }
      if (savingsTarget > 0) {
        const vsTarget = projectedMonthlySaving - savingsTarget;
        facts.push(`Obiettivo di risparmio mensile impostato: ${savingsTarget}€. Al ritmo attuale ${vsTarget >= 0 ? `lo supera di ~${vsTarget}€` : `manca di ~${Math.abs(vsTarget)}€`}. Se l'acquisto erode il risparmio sotto l'obiettivo, segnalalo.`);
      }
      if (plannedExpBudget > 0) {
        facts.push(`Budget di spesa pianificato dall'utente: ~${Math.round(plannedExpBudget)}€/mese complessivi sulle categorie.`);
      }
      if (safeSaving <= 0) {
        facts.push(`Attenzione: a ritmo attuale il mese non genera risparmio (~${projectedMonthlySaving}€): senza tagli o senza sospendere gli investimenti non si accumula nulla.`);
      }
      if (fitsThisMonth) {
        facts.push(`SPESA PICCOLA: una mensilità di risparmio la copre. Comprandola subito chiuderesti il mese con ~${leftoverIfBought}€ da parte. Fattibile entro il mese senza andare in rosso.`);
      } else if (safeSaving > 0) {
        facts.push(`SPESA IMPORTANTE: comprandola tutta ora sforeresti di ~${monthOvershoot}€. Meglio diluire su più mesi.`);
        if (monthsToAfford !== null) facts.push(`A ritmo attuale servono ~${monthsToAfford} mesi (pronto verso ${readyByPace}).`);
      }
      if (topCuts.length > 0) {
        const cutsStr = topCuts.map(c => `${c.label} (~${c.amount}€/mese)`).join(', ');
        facts.push(`Categorie variabili più alte del mese (dove tagliare): ${cutsStr}.`);
      }
      if (!fitsThisMonth && monthsToAffordWithCuts !== null && monthsToAffordWithCuts !== monthsToAfford) {
        facts.push(`Tagliando ~30% su quelle categorie (~${monthlyCutPotential}€/mese in più) i mesi scendono a ~${monthsToAffordWithCuts} (pronto verso ${readyByWithCuts}).`);
      }
      if (targetDate && requiredMonthly !== null) {
        facts.push(`Scadenza voluta: entro ${daysLeft} giorni → servirebbero ${requiredMonthly}€/mese, ${targetFeasible ? 'raggiungibile con qualche taglio o pausa investimenti' : 'difficile senza tagli importanti o senza allungare i tempi'}.`);
      }

      const prompt =
        `Sei il coach finanziario dell'app Sunny: amichevole, schietto e concreto. ` +
        `L'utente vuole sapere se può permettersi un acquisto. NON chiedere mai quanto ha già da parte.\n\n` +
        `Incrocia TUTTO il quadro: entrate, uscite, investimenti, obiettivo di risparmio, budget e ` +
        `spese già impegnate (ricorrenti e previste). Le leve per liberare liquidità sono due: ` +
        `ridurre le spese variabili E/O sospendere temporaneamente gli investimenti — valuta quale ha più senso.\n\n` +
        `Regola sul periodo:\n` +
        `- Se la spesa è PICCOLA (una mensilità di risparmio la copre senza mandarlo in rosso), ` +
        `dillo: si può fare già questo mese, e accenna a quanto gli resterebbe.\n` +
        `- Se la spesa è IMPORTANTE (lo farebbe sforare), NON forzare il rientro nel mese: ragiona su più ` +
        `mesi, di' per quanti mesi accantonare, cosa ridurre (o se vale la pena rallentare gli investimenti), ` +
        `e stima il periodo (es. "verso ottobre") in cui ci arriva.\n\n` +
        `Dati (usali, non elencarli meccanicamente):\n- ${facts.join('\n- ')}\n\n` +
        `Scrivi in italiano, 2-4 frasi, tono colloquiale e vario (cambia ogni volta apertura, ritmo e ` +
        `struttura). Cita per nome 1-2 categorie o leve concrete. Niente markdown, niente elenchi puntati, ` +
        `niente formule fisse. Dai una risposta che suoni umana e su misura.`;

      const gemResp = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            // High temperature + topP for genuinely varied, non-templated replies.
            generationConfig: { temperature: 1.15, topP: 0.95, maxOutputTokens: 400 },
          }),
        },
      );
      if (!gemResp.ok) {
        const body = await gemResp.text();
        console.error('Gemini REST non-2xx:', gemResp.status, body.slice(0, 300));
        res.status(502).json({ ok: false, error: 'unavailable' });
        return;
      }
      const gemData = (await gemResp.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const advice = (gemData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();

      // ── Update rate limit counter ─────────────────────────────────────────
      const newCount = currentCount + 1;
      await rateLimitRef.set({ dailyCount: newCount, lastResetDay: today }, { merge: true });

      res.json({
        ok: true,
        monthlySaving: Math.round(projectedMonthlySaving),
        monthlyIncome: projectedInc,
        monthlyExpenses: projectedExp,
        monthlyInvestments: projectedInvest,
        upcomingCommitted,
        savingsTarget,
        fitsThisMonth,
        monthOvershoot: fitsThisMonth ? 0 : monthOvershoot,
        leftoverIfBought,
        monthsToAfford,
        monthsToAffordWithCuts,
        readyBy: readyByWithCuts ?? readyByPace,
        requiredMonthly,
        targetFeasible,
        daysLeft,
        topCuts,
        advice,
        remaining: MAX_AI_CALLS_PER_DAY - newCount,
      });
    } catch (err) {
      console.error('generateAffordabilityAdvice failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
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
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    try {
      if (req.method !== 'POST') { res.status(405).json({ error: 'method not allowed' }); return; }

      // Require a valid signed-in user: prevents anonymous abuse of the endpoint
      // (and of the paid Gemini quota).
      const uid = await verifyBearer(req.headers.authorization);
      if (!uid) { res.status(401).json({ error: 'unauthorized' }); return; }

      const { income, expenses, investments, saved, topInsights } = (req.body ?? {}) as {
        income: number; expenses: number; investments: number; saved: number; topInsights: string[];
      };

      if (!apiKey) { console.error('generateDigest: GEMINI_API_KEY missing'); res.status(503).json({ error: 'unavailable' }); return; }

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
        console.error('Gemini REST non-2xx:', gemResp.status, body.slice(0, 300));
        res.status(502).json({ error: 'unavailable' });
        return;
      }

      const data = (await gemResp.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
      if (!text) { console.error('generateDigest: empty Gemini response'); res.status(502).json({ error: 'unavailable' }); return; }

      const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 3);
      res.json({ sentences });
    } catch (err) {
      console.error('generateDigest failed:', err);
      res.status(500).json({ error: 'unavailable' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACK — notify the admin when a user submits feedback.
// Each new document in the top-level `feedback` collection triggers a push to
// the admin's devices (reuses the existing FCM helper; no new infrastructure).
// ─────────────────────────────────────────────────────────────────────────────

export const onFeedbackCreated = onDocumentCreated(
  { document: 'feedback/{fid}', region: 'europe-west1' },
  async (event) => {
    const d = event.data?.data() ?? {};
    const type = (d.type as string | undefined) ?? 'other';
    const text = ((d.text as string | null | undefined) ?? '').slice(0, 90);
    const titles: Record<string, string> = {
      bug: '🐞 Feedback: problema',
      idea: '💡 Feedback: idea',
      confusion: '😕 Feedback: confusione',
      other: '💬 Nuovo feedback',
    };
    const title = titles[type] ?? '💬 Nuovo feedback';
    const body = text || 'Hai ricevuto un nuovo feedback.';
    try {
      await sendToUser(ADMIN_UID, title, body, undefined, 'feedback');
    } catch (err) {
      console.error('onFeedbackCreated: notify failed:', err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE SHORTCUT API (admin-gated, token-authenticated)
//
// Lets an iOS Shortcut add an EXPENSE headlessly, authenticated with a minted
// bearer token (NOT a Firebase session). In THIS phase everything is admin-only:
// only the admin can mint a token (issueExpenseToken) and only the admin sees the
// management UI; the runtime endpoints (getExpenseOptions / addExpense) trust the
// token, which only the admin can obtain.
//
// STYLE NOTE — onRequest, not onCall: this whole file authenticates HTTP
// endpoints with a Bearer header on purpose. The callable (onCall) protocol was
// returning "internal" before the handler ran in this project (see generateDigest
// above), so we never use it. Admin-management endpoints verify a Firebase ID
// token (verifyBearer) + admin uid; the runtime endpoints verify a minted token.
//
// Tokens live in the top-level `expenseTokens` collection with doc id =
// sha256(token), so the plaintext token is NEVER stored. Client access is denied
// in firestore.rules — only the Admin SDK (these functions) can read/write them.
// ─────────────────────────────────────────────────────────────────────────────

const EXPENSE_SCOPE = 'expenses:write';
// Per-token safety cap: max authenticated requests in a rolling hour → 429. One
// shortcut run spends 2 (getExpenseOptions + addExpense), so ~15 adds/hour.
const MAX_EXPENSE_REQS_PER_HOUR = 30;

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

/** YYYY-MM-DD for "now" in Europe/Rome (same trick as the reminder helpers). */
function todayRomeISO(): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Drop undefined values — Firestore rejects writes containing `undefined`. */
function dropUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

interface ExpenseTokenDoc {
  uid: string;
  scope: string;
  revoked: boolean;
  createdAt?: FirebaseFirestore.Timestamp;
  lastUsedAt?: FirebaseFirestore.Timestamp | null;
  label?: string;
  rateWindowStart?: number; // ms epoch — start of the current rate-limit window
  rateCount?: number;       // requests counted in the current window
}

type ExpenseAuth =
  | { ok: true; uid: string; tokenHash: string }
  | { ok: false; status: number; error: string };

/** Shared Bearer middleware for the RUNTIME endpoints. Verifies a minted
 *  shortcut token (exists, not revoked, scope === expenses:write), enforces a
 *  rolling hourly rate limit, and stamps lastUsedAt. Returns the owning uid. */
async function authExpenseToken(authHeader?: string): Promise<ExpenseAuth> {
  const m = (authHeader ?? '').match(/^Bearer (.+)$/);
  if (!m) return { ok: false, status: 401, error: 'unauthorized' };
  const token = m[1].trim();
  if (!token) return { ok: false, status: 401, error: 'unauthorized' };

  const hash = sha256(token);
  const ref = db.doc(`expenseTokens/${hash}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, status: 401, error: 'unauthorized' };

  const data = snap.data() as ExpenseTokenDoc;
  if (data.revoked) return { ok: false, status: 401, error: 'revoked' };
  if (data.scope !== EXPENSE_SCOPE) return { ok: false, status: 403, error: 'forbidden-scope' };

  // Rolling 1h rate-limit window kept on the token doc itself.
  const now = Date.now();
  const inWindow = data.rateWindowStart != null && (now - data.rateWindowStart) < 3_600_000;
  const windowStart = inWindow ? (data.rateWindowStart as number) : now;
  const count = inWindow ? (data.rateCount ?? 0) : 0;
  if (count >= MAX_EXPENSE_REQS_PER_HOUR) return { ok: false, status: 429, error: 'rate-limit' };

  await ref.update({
    lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    rateWindowStart: windowStart,
    rateCount: count + 1,
  });

  return { ok: true, uid: data.uid, tokenHash: hash };
}

type AdminAuth = { ok: true; uid: string } | { ok: false; status: number; error: string };

/** Verify a Firebase ID token AND that it belongs to the admin. */
async function authAdmin(authHeader?: string): Promise<AdminAuth> {
  const uid = await verifyBearer(authHeader);
  if (!uid) return { ok: false, status: 401, error: 'unauthorized' };
  if (uid !== ADMIN_UID) return { ok: false, status: 403, error: 'forbidden' };
  return { ok: true, uid };
}

// ── Admin management endpoints (Firebase ID token + admin uid) ───────────────

/** Mint a new shortcut token. Returns the plaintext token ONCE; only the
 *  sha256 is persisted. Admin-only. */
export const issueExpenseToken = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authAdmin(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      const label = String((req.body?.label as string | undefined) ?? '').trim().slice(0, 60) || 'Shortcut spese';

      const token = randomBytes(32).toString('base64url'); // robust, URL-safe
      const hash = sha256(token);

      await db.doc(`expenseTokens/${hash}`).set({
        uid: auth.uid,
        scope: EXPENSE_SCOPE,
        revoked: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUsedAt: null,
        label,
      });

      // The plaintext token is returned here and NEVER again.
      res.json({ ok: true, token, id: hash, label });
    } catch (err) {
      console.error('issueExpenseToken failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);

/** List the admin's tokens — metadata only, never the token itself. */
export const listExpenseTokens = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authAdmin(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      // Equality-only query → no composite index needed; sort client-side.
      const snap = await db.collection('expenseTokens').where('uid', '==', auth.uid).get();
      const toMs = (t?: FirebaseFirestore.Timestamp | null) => (t ? t.toMillis() : null);
      const tokens = snap.docs
        .map(d => {
          const x = d.data() as ExpenseTokenDoc;
          return {
            id: d.id,
            label: x.label ?? '',
            revoked: !!x.revoked,
            createdAt: toMs(x.createdAt ?? null),
            lastUsedAt: toMs(x.lastUsedAt ?? null),
          };
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

      res.json({ ok: true, tokens });
    } catch (err) {
      console.error('listExpenseTokens failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);

/** Revoke one of the admin's tokens (soft delete: revoked = true). */
export const revokeExpenseToken = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authAdmin(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      const id = String((req.body?.id as string | undefined) ?? '').trim();
      if (!id) { res.status(400).json({ ok: false, error: 'missing-id' }); return; }

      const ref = db.doc(`expenseTokens/${id}`);
      const snap = await ref.get();
      // Don't leak existence of tokens that aren't the caller's.
      if (!snap.exists || (snap.data() as ExpenseTokenDoc).uid !== auth.uid) {
        res.status(404).json({ ok: false, error: 'not-found' }); return;
      }
      await ref.update({ revoked: true });
      res.json({ ok: true });
    } catch (err) {
      console.error('revokeExpenseToken failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);

// ── Runtime endpoints called by the Shortcut (minted token auth) ─────────────

/** GET: the user's expense categories and accounts (names), so the Shortcut can
 *  present a "Choose from List". Empty lists are returned as `ok:true` + []. */
export const getExpenseOptions = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'GET') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authExpenseToken(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      const settingsSnap = await db.doc(`users/${auth.uid}/meta/settings`).get();
      const settings = (settingsSnap.data() ?? {}) as {
        categories?: { label?: string; kind?: string }[];
        accounts?: { label?: string }[];
      };
      const categories = (settings.categories ?? [])
        .filter(c => c.kind === 'expense' && (c.label ?? '').trim())
        .map(c => (c.label as string).trim());
      const accounts = (settings.accounts ?? [])
        .filter(a => (a.label ?? '').trim())
        .map(a => (a.label as string).trim());

      res.json({ ok: true, categories, accounts });
    } catch (err) {
      console.error('getExpenseOptions failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);

/** POST: create ONE expense for the token's user. type is FORCED to 'expense'. */
export const addExpense = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method-not-allowed' }); return; }
      const auth = await authExpenseToken(req.headers.authorization);
      if (!auth.ok) { res.status(auth.status).json({ ok: false, error: auth.error }); return; }

      const body = (req.body ?? {}) as { amount?: unknown; category?: unknown; account?: unknown; description?: unknown };

      // amount: accept "12,50" or "12.50"; must be finite and > 0; stored positive.
      const amount = Number(String(body.amount ?? '').replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ ok: false, error: 'Importo non valido: inserisci un numero maggiore di zero.' });
        return;
      }
      const amountRounded = Math.round(amount * 100) / 100;

      // Resolve category/account by NAME (label), case-insensitive, against the
      // user's settings. Category is matched among EXPENSE categories only.
      const settingsSnap = await db.doc(`users/${auth.uid}/meta/settings`).get();
      const settings = (settingsSnap.data() ?? {}) as {
        categories?: { id?: string; label?: string; kind?: string; icon?: string }[];
        accounts?: { id?: string; label?: string }[];
      };
      const expenseCats = (settings.categories ?? []).filter(c => c.kind === 'expense' && c.id && c.label);
      const accs = (settings.accounts ?? []).filter(a => a.id && a.label);

      const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
      const cat = expenseCats.find(c => norm(c.label) === norm(body.category));
      if (!cat) {
        res.status(400).json({
          ok: false,
          error: `Categoria "${String(body.category ?? '')}" non trovata.`,
          validCategories: expenseCats.map(c => c.label),
        });
        return;
      }
      const acc = accs.find(a => norm(a.label) === norm(body.account));
      if (!acc) {
        res.status(400).json({
          ok: false,
          error: `Conto "${String(body.account ?? '')}" non trovato.`,
          validAccounts: accs.map(a => a.label),
        });
        return;
      }

      const description = String(body.description ?? '').trim() || (cat.label as string);
      const date = todayRomeISO();

      // EXACTLY the existing Transaction write shape (cf. useTransactions
      // withCreatedAt): auto-id doc, createdAt = ms epoch, type forced to
      // 'expense'. We never set seriesId / recurring / projected / shared /
      // groupId. Undefined fields are stripped.
      const txData = dropUndefined({
        date,
        description,
        amount: amountRounded,
        type: 'expense',
        category: cat.id as string,
        account: acc.id as string,
        createdAt: Date.now(),
      });
      const ref = await db.collection(`users/${auth.uid}/transactions`).add(txData);

      const amountStr = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amountRounded);
      const summary = `−${amountStr} · ${cat.label} · ${acc.label}`;

      // Best-effort native push, coherent with the app: category emoji + amount
      // + real category/account names. Reuses sendToUser (same path as
      // sendTestPush: multicast to every device token + invalid-token cleanup).
      // NEVER fails the request — the expense is already saved. Reuses the
      // category/account already resolved above (no second meta/settings read).
      try {
        const icon = (cat.icon ?? '').trim();
        // Same IT amount formatting as `summary`, but absolute and without the €
        // symbol (the template adds " €") — e.g. "50,00".
        const amountPlain = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amountRounded);
        const pushBody = `${icon ? `${icon} ` : ''}${amountPlain} € in ${cat.label} da ${acc.label}`;
        await sendToUser(auth.uid, 'Spesa aggiunta', pushBody, undefined, 'expense-added');
      } catch (err) {
        console.error('addExpense: push notification failed (ignored):', err);
      }

      res.json({ ok: true, id: ref.id, summary });
    } catch (err) {
      console.error('addExpense failed:', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);
