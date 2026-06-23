// Self-hosted product metrics (DAU/WAU/MAU + engagement) on Firestore.
//
// Sunny deliberately does NOT use GA4 — `@firebase/analytics` is never
// initialised. Instead we keep our own pseudonymous, per-UID signals, separate
// from operational data, and aggregate them server-side (Cloud Function) into
// admin-only `metrics/{day}` docs.
//
// Two write paths, both fire-and-forget (never block render, never surface an
// error to the UI):
//   - presence  → users/{uid}/meta/activity { lastActiveAt, activeDays[] }
//   - behaviour → users/{uid}/events/{autoId} { name, ts }   (name+ts ONLY)
//
// HARD RULE: no financial data ever reaches an event or the activity doc — only
// an allow-listed event `name` and a timestamp. The allowlist below is mirrored
// by the Firestore rules and the rollup function; keep the three in sync.

import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

/** The ONLY event names ever written. Mirrored in firestore.rules + rollup fn. */
export const METRIC_EVENTS = [
  'app_open',
  'insights_view',
  'insight_open',
  'notif_open',
  'tx_add',
  'forecast_view',
  'aicoach_open',
] as const;

export type MetricEvent = (typeof METRIC_EVENTS)[number];

const EVENT_ALLOWLIST: ReadonlySet<string> = new Set(METRIC_EVENTS);

/** Rolling window of recent active days kept on the user doc (MAU=30 + margin). */
export const ACTIVE_DAYS_KEEP = 35;

/** sessionStorage flag so presence is recorded at most once per browser session. */
const ACTIVITY_SESSION_KEY = 'sunny_activity_done';

// ── Pure helpers (unit-tested) ───────────────────────────────────────────────

/** Local-time day key `YYYY-MM-DD` for the given instant. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Append a day to the active-days list: dedup, sort ascending, keep last `keep`. */
export function pushActiveDay(days: string[], dayKey: string, keep: number = ACTIVE_DAYS_KEEP): string[] {
  const next = new Set(days);
  next.add(dayKey);
  return [...next].sort().slice(-keep);
}

// ── Firestore writers (fire-and-forget) ──────────────────────────────────────

/**
 * Record the user's presence for DAU/WAU/MAU. Debounced to once per browser
 * session via sessionStorage. Reads the current activity doc to dedup/trim the
 * activeDays window, then merges. Any failure is swallowed.
 */
export async function recordActivity(uid: string, now: Date = new Date()): Promise<void> {
  if (!uid) return;
  try {
    if (sessionStorage.getItem(ACTIVITY_SESSION_KEY)) return;
    sessionStorage.setItem(ACTIVITY_SESSION_KEY, '1');
  } catch {
    /* sessionStorage unavailable — App still calls this once per session */
  }
  try {
    const ref = doc(db, 'users', uid, 'meta', 'activity');
    const snap = await getDoc(ref);
    const prev = (snap.exists() ? snap.data() : {}) as { activeDays?: unknown };
    const days = Array.isArray(prev.activeDays)
      ? prev.activeDays.filter((d): d is string => typeof d === 'string')
      : [];
    await setDoc(
      ref,
      { lastActiveAt: now.getTime(), activeDays: pushActiveDay(days, todayKey(now)) },
      { merge: true },
    );
  } catch {
    /* fire-and-forget: metrics must never affect the app */
  }
}

/**
 * Log a behavioural event. Client-side allowlist guard (belt-and-suspenders for
 * the typed signature). Writes only { name, ts } — never any financial data.
 */
export async function logEvent(uid: string, name: MetricEvent): Promise<void> {
  if (!uid || !EVENT_ALLOWLIST.has(name)) return;
  try {
    await addDoc(collection(db, 'users', uid, 'events'), { name, ts: Date.now() });
  } catch {
    /* fire-and-forget */
  }
}
