import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import {
  db, euro, addPeriod, todayRomeISO, sendToUser, usersWithReminder,
  verifyBearer, ALLOWED_ORIGINS,
} from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// REMINDERS & PUSH NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

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

// "Did you log your expenses?" — at 13:00 and 21:00 Europe/Rome.
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

// Start-of-month nudge: the previous month's reflective recap is ready — 10:00
// on the 1st. Deep-links to the in-app /recap/{prevYM} screen (computed client
// side: this function only sends the push, no recap snapshot is persisted).
export const sendMonthlySummary = onSchedule(
  { schedule: '0 10 1 * *', timeZone: 'Europe/Rome', region: 'europe-west1' },
  async () => {
    const now = new Date();
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const ym = lastMonth.toISOString().slice(0, 7); // YYYY-MM
    const mese = new Intl.DateTimeFormat('it-IT', { month: 'long', timeZone: 'Europe/Rome' }).format(lastMonth);
    const meseCap = mese.charAt(0).toUpperCase() + mese.slice(1);

    const users = await usersWithReminder('monthly');
    for (const userId of users) {
      const snap = await db.collection(`users/${userId}/transactions`)
        .where('date', '>=', `${ym}-01`)
        .where('date', '<=', `${ym}-31`)
        .get();

      // Mirror the client's unified flow (shared/financialFlow.ts): TFR is
      // never cash, source-less deposits are external inflows, the withdrawal
      // leg returns capital. "Messi da parte" = flusso netto (cashIn − cashOut).
      let income = 0, cashIn = 0, cashOut = 0, any = false;
      snap.forEach(d => {
        const t = d.data() as { type?: string; amount?: number; shared?: number; direction?: string; account?: string; tfr?: number; recurring?: unknown };
        if (t.recurring) return; // templates are pointers, not flows
        const amount = Number(t.amount) || 0;
        if (!amount) return;
        any = true;
        if (t.type === 'income') { income += amount; cashIn += amount; }
        else if (t.type === 'expense') cashOut += amount - (Number(t.shared) || 0);
        else if (t.type === 'investment') {
          if (t.direction === 'out') { cashIn += amount; return; }
          const tfr = Math.min(Math.max(Number(t.tfr) || 0, 0), amount);
          const nonTfr = amount - tfr;
          if (t.account) cashOut += nonTfr; else cashIn += nonTfr;
        }
      });
      if (!any) continue;

      const saved = cashIn - cashOut;
      const savedPct = income > 0 ? Math.round((saved / income) * 100) : 0;

      await sendToUser(
        userId,
        `📊 Il tuo riepilogo di ${meseCap} è pronto`,
        `Apri Sunny per vedere com'è andata — ${euro(saved)} di flusso netto (${savedPct}%).`,
        'monthly',
        'monthly',
        `recap/${ym}`,
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
    const todayRome = todayRomeISO();
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
    const todayRome = todayRomeISO();
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
    const todayRome = todayRomeISO();
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

      // Real totals, direction-aware (net invested = deposits − withdrawals);
      // recurring templates are pointers, not flows.
      let income = 0, expenses = 0, investments = 0;
      snap.forEach(d => {
        const t = d.data() as { type?: string; amount?: number; shared?: number; direction?: string; recurring?: unknown };
        if (t.recurring) return;
        const amount = Number(t.amount) || 0;
        if (t.type === 'income') income += amount;
        else if (t.type === 'expense') expenses += amount - (Number(t.shared) || 0);
        else if (t.type === 'investment') investments += t.direction === 'out' ? -amount : amount;
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
