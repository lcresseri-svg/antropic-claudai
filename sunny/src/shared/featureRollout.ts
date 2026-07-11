/**
 * Central registry for feature flags that are NOT yet generally available.
 *
 * Every new gated feature lives here — no scattered UID checks in components.
 * Each flag carries a rollout STAGE that can be advanced deterministically
 * without touching any consumer:
 *
 *   admin → allowlist → percentage → all
 *
 * - `admin`      only the admin identity (shared/featureFlags.ts ADMIN_UIDS).
 * - `allowlist`  an explicit list of Firebase UIDs (admin always included).
 * - `percentage` a deterministic per-user bucket: hash(flag + uid) % 100.
 *                The same user always gets the same answer for the same flag,
 *                and buckets are independent across flags. Admin always in.
 * - `all`        every signed-in user.
 *
 * VISIBILITY ONLY: these gates hide UI and skip client computation. Anything
 * involving sensitive DATA must be authorized server-side too (Firestore rules
 * or Cloud Functions) — a flipped client flag must never grant data access.
 */
import { isAdminUser } from './featureFlags';

export type FeatureFlag =
  | 'wealth_v2'
  | 'available_cash'
  | 'forecast_unified'
  | 'monthly_plan_v2'
  | 'commitments'
  | 'decision_coach';

export type RolloutStage =
  | { stage: 'admin' }
  | { stage: 'allowlist'; uids: readonly string[] }
  | { stage: 'percentage'; percent: number }
  | { stage: 'all' };

/** Minimal user shape (compatible with firebase/auth User). */
export interface FlagUser { uid?: string | null }

/** Current rollout stage per flag. Advance stages HERE only. */
export const FEATURE_ROLLOUT: Record<FeatureFlag, RolloutStage> = {
  wealth_v2:        { stage: 'admin' },
  available_cash:   { stage: 'admin' },
  forecast_unified: { stage: 'admin' },
  monthly_plan_v2:  { stage: 'admin' },
  commitments:      { stage: 'admin' },
  decision_coach:   { stage: 'admin' },
};

/**
 * FNV-1a 32-bit hash — tiny, dependency-free, stable across sessions and
 * platforms. Used ONLY for deterministic percentage bucketing (not security).
 */
export function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic bucket 0–99 for a (flag, uid) pair. */
export function rolloutBucket(flag: FeatureFlag, uid: string): number {
  return fnv1a(`${flag}:${uid}`) % 100;
}

/** True when `flag` is enabled for `user` under its current rollout stage. */
export function isFeatureEnabled(flag: FeatureFlag, user: FlagUser | null | undefined): boolean {
  const uid = user?.uid;
  if (!uid) return false;
  // The admin sees every gated feature at every stage (they own the rollout).
  if (isAdminUser({ uid })) return true;

  const rollout = FEATURE_ROLLOUT[flag];
  switch (rollout.stage) {
    case 'admin':      return false; // non-admin — already handled above
    case 'allowlist':  return rollout.uids.includes(uid);
    case 'percentage': return rolloutBucket(flag, uid) < rollout.percent;
    case 'all':        return true;
  }
}
