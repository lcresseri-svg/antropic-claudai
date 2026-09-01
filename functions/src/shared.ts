import * as admin from 'firebase-admin';

admin.initializeApp();

/** Shared Firestore handle (Admin SDK — bypasses security rules). */
export const db = admin.firestore();

export const APP_LINK = 'https://sunny-a2a98.web.app/';

/** Admin identity (Firebase UID). Mirrors firestore.rules and the client's
 *  shared/featureFlags.ts ADMIN_UIDS — keep the three in sync. */
export const ADMIN_UID = 'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2';

/** Max accepted HTTP request body size (bytes). Guards against oversized payloads. */
export const MAX_BODY_BYTES = 100_000;

/** True when the request body exceeds the size guard. */
export function bodyTooLarge(req: { rawBody?: Buffer }): boolean {
  return !!req.rawBody && req.rawBody.length > MAX_BODY_BYTES;
}

/** Log an error WITHOUT leaking financial/personal data: code + message only. */
export function logError(tag: string, err: unknown): void {
  const e = err as { code?: unknown; message?: unknown };
  console.error(`${tag}:`, (e && (e.code ?? e.message)) ?? 'unknown-error');
}

/** fetch() with an abort timeout. Throws on timeout so callers return 503/504. */
export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Gemini external-call timeout. */
export const GEMINI_TIMEOUT_MS = 12_000;

// Origins allowed to call the HTTP endpoints. Replaces the previous `cors: true`
// (which let any site invoke the functions). localhost is kept for local dev.
export const ALLOWED_ORIGINS: (string | RegExp)[] = [
  'https://sunny-a2a98.web.app',
  'https://sunny-a2a98.firebaseapp.com',
  /^http:\/\/localhost:\d+$/,
];

/** Verify the Firebase ID token in the `Authorization: Bearer <token>` header.
 *  Returns the authenticated uid, or null when the token is missing/invalid.
 *  HTTP endpoints must reject (401) when this returns null. */
export async function verifyBearer(authHeader?: string): Promise<string | null> {
  const m = (authHeader ?? '').match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(m[1]);
    return decoded.uid;
  } catch {
    return null;
  }
}

/**
 * App Check verification with a NON-BLOCKING rollout:
 *  - token present + valid   → ok
 *  - token missing / invalid → ok only while enforcement is OFF (default),
 *    logged so adoption can be monitored before flipping the switch.
 * Enforcement is opt-in via the APPCHECK_ENFORCE=true env var, so deploying
 * this code never locks out clients that don't attach a token yet.
 */
export async function verifyAppCheckSoft(req: { header(name: string): string | undefined }, tag: string): Promise<boolean> {
  const enforce = process.env.APPCHECK_ENFORCE === 'true';
  const token = req.header('X-Firebase-AppCheck');
  if (!token) {
    if (enforce) return false;
    console.log(`${tag}: appcheck-missing (not enforced)`);
    return true;
  }
  try {
    await admin.appCheck().verifyToken(token);
    return true;
  } catch {
    console.log(`${tag}: appcheck-invalid${enforce ? '' : ' (not enforced)'}`);
    return !enforce;
  }
}

export const euro = (n: number) => `${Math.round(n)}€`;

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface RecurrenceRule {
  freq: Freq; until?: string; mode?: 'interval' | 'calendar'; interval?: number;
  anchorDate?: string; weekday?: number; dayOfMonth?: number | 'last'; monthOfYear?: number;
}
const isoDate = (y: number, m0: number, day: number) => {
  const last = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m0, Math.min(day, last))).toISOString().slice(0, 10);
};
export function addPeriod(dateStr: string, ruleOrFreq: Freq | RecurrenceRule): string {
  const rule: RecurrenceRule = typeof ruleOrFreq === 'string' ? { freq: ruleOrFreq } : ruleOrFreq;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (rule.mode === 'calendar') {
    if (rule.freq === 'weekly') {
      const cur = new Date(Date.UTC(y, m - 1, d));
      const wanted = Math.min(6, Math.max(0, rule.weekday ?? 1));
      cur.setUTCDate(cur.getUTCDate() + (((wanted - cur.getUTCDay() + 7) % 7) || 7));
      return cur.toISOString().slice(0, 10);
    }
    if (rule.freq === 'monthly') {
      const wanted = rule.dayOfMonth ?? 1;
      for (let offset=0; offset<=1; offset++) {
        const base = new Date(Date.UTC(y, m - 1 + offset, 1));
        const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth()+1, 0)).getUTCDate();
        const candidate = isoDate(base.getUTCFullYear(), base.getUTCMonth(), wanted === 'last' ? last : Math.min(wanted,last));
        if (candidate > dateStr) return candidate;
      }
    }
    if (rule.freq === 'yearly') {
      const month=Math.min(12,Math.max(1,rule.monthOfYear??1)), wanted=rule.dayOfMonth??1;
      for(let yy=y;yy<=y+1;yy++){const last=new Date(Date.UTC(yy,month,0)).getUTCDate();const candidate=isoDate(yy,month-1,wanted==='last'?last:Math.min(wanted,last));if(candidate>dateStr)return candidate;}
    }
  }
  const every=Math.max(1,Math.floor(rule.interval??1)), anchor=rule.anchorDate??dateStr;
  if(rule.freq==='daily'||rule.freq==='weekly'){const dt=new Date(dateStr+'T00:00:00Z');dt.setUTCDate(dt.getUTCDate()+every*(rule.freq==='weekly'?7:1));return dt.toISOString().slice(0,10);}
  const [ay,am,ad]=anchor.split('-').map(Number);
  if(rule.freq==='monthly'){const cur=y*12+m-1,a=ay*12+am-1;let step=Math.max(1,Math.floor((cur-a)/every)+1),target=a+step*every,candidate=isoDate(Math.floor(target/12),target%12,ad);while(candidate<=dateStr){target=a+(++step)*every;candidate=isoDate(Math.floor(target/12),target%12,ad);}return candidate;}
  let step=Math.max(1,Math.floor((y-ay)/every)+1),candidate=isoDate(ay+step*every,am-1,ad);while(candidate<=dateStr)candidate=isoDate(ay+(++step)*every,am-1,ad);return candidate;
}

/** YYYY-MM-DD for "now" in Europe/Rome (fr-CA locale gives ISO format). */
export function todayRomeISO(): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Drop undefined values — Firestore rejects writes containing `undefined`. */
export function dropUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUSH (FCM) — tokens + reminder preferences live in users/{uid}/meta/push:
//   { tokens: { [token]: true }, reminders: { logExpenses, recurring, monthly } }
// We send data-only messages; the service worker renders the notification.
// ─────────────────────────────────────────────────────────────────────────────

export type ReminderKey =
  | 'logExpenses' | 'recurring' | 'monthly' | 'upcomingPayments' | 'inactivityReminder';

/** Send to every token of a user, optionally gated on a reminder preference.
 *  Prunes tokens FCM reports as no longer valid. */
export async function sendToUser(
  userId: string,
  title: string,
  body: string,
  requireReminder?: ReminderKey,
  tag?: string,
  /** Optional in-app path to deep-link to (e.g. "recap/2026-05"). Defaults to the home. */
  path?: string,
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
  // `?notif=1` lets the client log a `notif_open` metric on load (then strips the
  // param). An optional `path` deep-links into the SPA (hosting rewrites **→index).
  const link = path ? `${APP_LINK}${path}?notif=1` : `${APP_LINK}?notif=1`;
  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    webpush: {
      notification: { title, body, tag: tag ?? 'sunny' },
      // FCM's own click handler opens this link — no custom notificationclick
      // handler in the SW (which would conflict with FCM's).
      fcmOptions: { link },
    },
    data: { link },
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
export async function usersWithReminder(key: ReminderKey): Promise<string[]> {
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
