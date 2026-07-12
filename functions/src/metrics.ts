import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { db, ADMIN_UID, ALLOWED_ORIGINS, logError, verifyBearer } from './shared';

// ─────────────────────────────────────────────────────────────────────────────
// SELF-HOSTED PRODUCT METRICS (DAU/WAU/MAU + engagement)
//
// No GA4. The client writes pseudonymous, per-UID signals:
//   users/{uid}/meta/activity { lastActiveAt, activeDays[] }
//   users/{uid}/events/{autoId} { name, ts }     (name+ts ONLY — no financial data)
// This rollup aggregates them, once per day, into the admin-only top-level
// collection metrics/{YYYY-MM-DD}. It also purges events older than 90 days.
//
// The event allowlist below MUST match sunny/src/shared/analytics/metrics.ts and
// the firestore.rules validEvent() allowlist.
// ─────────────────────────────────────────────────────────────────────────────

const METRICS_READER_EVENTS = ['insights_view', 'insight_open', 'notif_open'] as const;
const METRICS_ADOPTION_EVENTS = ['tx_add', 'forecast_view', 'aicoach_open'] as const;
const EVENTS_RETENTION_DAYS = 90;

/** Europe/Rome calendar day (YYYY-MM-DD) for the given instant. */
function romeDayKey(d: Date): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Shift a YYYY-MM-DD day key by n calendar days (UTC arithmetic on the date). */
function shiftDayKey(dayKey: string, n: number): string {
  return new Date(Date.parse(dayKey + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
}

/** The n most recent day keys ending at (and including) targetDay. */
function lastNDayKeys(targetDay: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(shiftDayKey(targetDay, -i));
  return out;
}

/** Offset (ms) of `tz` wall-clock vs UTC at the given instant (handles DST). */
function tzOffsetMs(tz: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(atMs));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second);
  return asUTC - atMs;
}

/** UTC epoch ms at the start (00:00 Europe/Rome) of the given calendar day. */
function romeDayStartMs(dayKey: string): number {
  const [y, mo, d] = dayKey.split('-').map(Number);
  const utcGuess = Date.UTC(y, mo - 1, d);
  // Two-pass correction so DST-transition days resolve exactly.
  const t1 = utcGuess - tzOffsetMs('Europe/Rome', utcGuess);
  return utcGuess - tzOffsetMs('Europe/Rome', t1);
}

interface MetricsDoc {
  date: string;
  dau: number; wau: number; mau: number; stickiness: number;
  newUsers: number; totalUsers: number;
  readers: Record<(typeof METRICS_READER_EVENTS)[number], number>;
  adoption: Record<(typeof METRICS_ADOPTION_EVENTS)[number], number>;
}

/**
 * Compute and persist metrics/{targetDay}. `targetDay` must be a COMPLETE past
 * Europe/Rome day (YYYY-MM-DD). Also purges events older than the retention
 * window. Per-user failures are logged and skipped — never abort the whole run.
 */
async function runMetricsRollup(targetDay: string): Promise<MetricsDoc> {
  const weekSet = new Set(lastNDayKeys(targetDay, 7));
  const monthSet = new Set(lastNDayKeys(targetDay, 30));
  const startMs = romeDayStartMs(targetDay);
  const endMs = romeDayStartMs(shiftDayKey(targetDay, 1));
  const retentionCutoff = startMs - EVENTS_RETENTION_DAYS * 86_400_000;

  let dau = 0, wau = 0, mau = 0;
  const readers = { insights_view: 0, insight_open: 0, notif_open: 0 };
  const adoption = { tx_add: 0, forecast_view: 0, aicoach_open: 0 };

  // listDocuments() returns refs for every user that has data (incl. "missing"
  // docs that only hold subcollections). Beta scale → single pass in memory.
  const userRefs = await db.collection('users').listDocuments();
  for (const ref of userRefs) {
    // Presence → DAU/WAU/MAU from the rolling activeDays window.
    try {
      const act = (await ref.collection('meta').doc('activity').get()).data();
      const days = act?.activeDays;
      if (Array.isArray(days)) {
        const set = new Set(days.filter((x): x is string => typeof x === 'string'));
        if (set.has(targetDay)) dau++;
        if ([...set].some(d => weekSet.has(d))) wau++;
        if ([...set].some(d => monthSet.has(d))) mau++;
      }
    } catch (err) {
      logError('rollupMetrics: activity read', err);
    }

    // Engagement → DISTINCT users per event on the target day.
    try {
      const evSnap = await ref.collection('events')
        .where('ts', '>=', startMs).where('ts', '<', endMs).get();
      const names = new Set<string>();
      for (const d of evSnap.docs) {
        const n = d.get('name');
        if (typeof n === 'string') names.add(n);
      }
      for (const n of METRICS_READER_EVENTS) if (names.has(n)) readers[n]++;
      for (const n of METRICS_ADOPTION_EVENTS) if (names.has(n)) adoption[n]++;
    } catch (err) {
      logError('rollupMetrics: events read', err);
    }

    // Retention → drop this user's events older than the window (batch ≤450).
    try {
      const old = await ref.collection('events').where('ts', '<', retentionCutoff).get();
      for (let i = 0; i < old.docs.length; i += 450) {
        const batch = db.batch();
        old.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      logError('rollupMetrics: events purge', err);
    }
  }

  // New/total users from Auth creationTime. Single page at beta scale.
  // TODO: paginate with listUsers(1000, pageToken) when accounts exceed 1000.
  let totalUsers = 0, newUsers = 0;
  try {
    const list = await admin.auth().listUsers(1000);
    totalUsers = list.users.length;
    for (const u of list.users) {
      const created = u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : NaN;
      if (!Number.isNaN(created) && created >= startMs && created < endMs) newUsers++;
    }
  } catch (err) {
    logError('rollupMetrics: listUsers', err);
  }

  const stickiness = mau > 0 ? Math.round((dau / mau) * 1000) / 1000 : 0;
  const metrics: MetricsDoc = {
    date: targetDay, dau, wau, mau, stickiness, newUsers, totalUsers, readers, adoption,
  };
  await db.collection('metrics').doc(targetDay).set({
    ...metrics, generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return metrics;
}

// Daily at 00:15 Europe/Rome → roll up the previous (complete) day.
export const rollupMetrics = onSchedule(
  { schedule: '15 0 * * *', timeZone: 'Europe/Rome', region: 'europe-west1', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    const target = shiftDayKey(romeDayKey(new Date()), -1);
    const m = await runMetricsRollup(target);
    console.log(`rollupMetrics: wrote metrics/${target} (dau=${m.dau} wau=${m.wau} mau=${m.mau})`);
  },
);

// Admin-only on-demand trigger for verification. Optional ?day=YYYY-MM-DD
// override; defaults to yesterday (Europe/Rome). Same auth model as the other
// admin endpoints (Firebase ID token + admin UID, restricted CORS).
export const testMetricsRollup = onRequest(
  { region: 'europe-west1', cors: ALLOWED_ORIGINS },
  async (req, res) => {
    try {
      const uid = await verifyBearer(req.headers.authorization);
      if (!uid) { res.status(401).json({ ok: false, error: 'unauthorized' }); return; }
      if (uid !== ADMIN_UID) { res.status(403).json({ ok: false, error: 'forbidden' }); return; }
      const dayParam = typeof req.query.day === 'string' ? req.query.day : '';
      const target = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dayParam)
        ? dayParam
        : shiftDayKey(romeDayKey(new Date()), -1);
      const metrics = await runMetricsRollup(target);
      res.status(200).json({ ok: true, day: target, metrics });
    } catch (err) {
      logError('testMetricsRollup', err);
      res.status(500).json({ ok: false, error: 'internal' });
    }
  },
);
