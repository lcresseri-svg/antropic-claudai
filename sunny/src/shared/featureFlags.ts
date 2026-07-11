import { User } from 'firebase/auth';

// Per-user feature gating.
//
// ROLLOUT (2026-06-16): every feature that used to be admin-only became visible
// to ALL users. Feature VISIBILITY must never depend on the admin identity
// again. `isAdminUser` stays a real, independent identity check, reserved for
// genuine admin-only DATA access (e.g. reading the `feedback` collection, still
// locked to this UID in firestore.rules) — it must NOT be used to hide UI.
//
// NEW features that are still in the admin-only phase are gated through the
// central registry in `featureRollout.ts` (stage: admin → allowlist →
// percentage → all), not through ad-hoc UID checks.

// Admin allow-list (Firebase UID). Mirrors the `feedback` read rule in
// firestore.rules. Keep this in sync with that rule, not with feature flags.
export const ADMIN_UIDS: readonly string[] = [
  'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2',
];

// Identity check — INDEPENDENT of any feature flag. Use ONLY for admin-only
// data paths and for the `admin` rollout stage, never to hide generally
// available UI.
export function isAdminUser(user: User | null): boolean {
  return !!user && !!user.uid && ADMIN_UIDS.includes(user.uid);
}

// Detailed investments: fund-type classification (pension / bond / equity), TFR
// tracking on pension funds, and the "by fund type" allocation donut.
// ROLLOUT: available to everyone since 1.12.0.
export function canUseDetailedInvestments(_user: User | null): boolean {
  return true;
}
