import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentDeleted, onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';

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
