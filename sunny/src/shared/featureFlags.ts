import { User } from 'firebase/auth';

// Per-user feature gating.
//
// ROLLOUT (2026-06-16): every feature that used to be admin-only is now visible
// to ALL users. Feature VISIBILITY must never depend on the admin identity
// again. `isAdminUser` stays a real, independent identity check, reserved for
// genuine admin-only DATA access (e.g. reading the `feedback` collection, still
// locked to this UID in firestore.rules) — it must NOT be used to hide UI.

// Admin allow-list (Firebase UID). Mirrors the `feedback` read rule in
// firestore.rules. Keep this in sync with that rule, not with feature flags.
const ADMIN_UIDS: string[] = [
  'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2',
];

// Identity check — INDEPENDENT of any feature flag (no longer delegates to
// canUseDetailedInvestments). Use ONLY for admin-only data paths, never to gate
// UI visibility.
export function isAdminUser(user: User | null): boolean {
  return !!user && !!user.uid && ADMIN_UIDS.includes(user.uid);
}

// Detailed investments: fund-type classification (pension / bond / equity), TFR
// tracking on pension funds, and the "by fund type" allocation donut.
// ROLLOUT: available to everyone.
// To re-gate in future: restore a UID allow-list, e.g.
//   return !!user && ['qPtCOJGRrwOZ2EfjxMHwW6ZISXX2'].includes(user.uid);
export function canUseDetailedInvestments(_user: User | null): boolean {
  return true;
}

// Push notifications: available to all logged-in users.
export function canUsePush(user: User | null): boolean {
  return !!user;
}

// Forecast Engine V2/V3 (multi-signal model + backtest).
// ROLLOUT: available to everyone — the /forecast-v2 and /forecast-v3 routes no
// longer redirect away.
// To re-gate in future: restore a UID allow-list, e.g.
//   return !!user && ['qPtCOJGRrwOZ2EfjxMHwW6ZISXX2'].includes(user.uid);
export function canUseForecastV2(_user: User | null): boolean {
  return true;
}

// UI v2.0.0 ("financial copilot" redesign).
// ROLLOUT: available to every logged-in user.
// To re-gate in future: restore a UID/email allow-list, e.g.
//   return !!user && ['<uid>'].includes(user.uid);
export function canUseUiV2(user: User | null): boolean {
  return !!user;
}
