/**
 * Centralised feature gate for Forecast Engine V4.
 *
 * Forecast V4 is an admin-only, experimental engine. It must NEVER be exposed
 * to normal users: no toggle, no execution, no diagnostics. Normal users keep
 * using the existing V3/V3.5 engine. This module is the single source of truth
 * for "is V4 allowed for this user?" — UI components must call it instead of
 * hardcoding identity checks.
 *
 * Why a separate module (not src/shared/featureFlags.ts):
 *  - featureFlags.ts deliberately rolled every previously-admin-only feature out
 *    to ALL users (see its header). V4 is the opposite: it must stay gated.
 *  - Keeping V4's gate here avoids accidental "rollout to everyone" edits to the
 *    shared flags file leaking V4 to normal users.
 */

/**
 * Minimal user shape the gate needs. Compatible with Firebase `User`
 * (which has `uid` but no `role`) and with any richer user object that may
 * carry an explicit `role`.
 */
export interface ForecastV4User {
  uid?: string | null;
  role?: string | null;
}

/** Options for remote / environment-driven enablement. */
export interface ForecastV4GateOptions {
  /**
   * A remote/feature-flag value resolved elsewhere (e.g. Remote Config) that
   * force-enables V4 for this specific user. When true, the gate opens
   * regardless of role/uid. Defaults to undefined (no remote override).
   */
  remoteFlagEnabled?: boolean;
}

/**
 * Admin allow-list (Firebase UID). Mirrors the admin UID used elsewhere in the
 * app (firestore.rules `feedback` read rule and shared/featureFlags.ts).
 * Kept here as the authoritative list for V4 access.
 */
export const FORECAST_V4_ADMIN_UIDS: readonly string[] = [
  'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2',
];

/**
 * Returns true only when Forecast V4 is enabled for the given user:
 *   - user.role === "admin", OR
 *   - user.uid is in the admin allow-list, OR
 *   - a remote feature flag enabled for this user (passed via options).
 *
 * Returns false for null/undefined users and for any user not matching the
 * above — those users transparently fall back to the V3/V3.5 engine.
 */
export function isForecastV4EnabledForUser(
  user: ForecastV4User | null | undefined,
  options: ForecastV4GateOptions = {},
): boolean {
  if (options.remoteFlagEnabled) return true;
  if (!user) return false;
  return Boolean(
    user.role === 'admin' ||
    (user.uid != null && FORECAST_V4_ADMIN_UIDS.includes(user.uid)),
  );
}

/**
 * Hard guard for the engine entry point. Throws when V4 is NOT enabled for the
 * caller, so that an accidental non-admin code path can never run the engine.
 * No-op when `user` is undefined (internal callers — backtest, diagnostics —
 * run only after the UI has already passed the gate).
 */
export function assertForecastV4Access(
  user: ForecastV4User | null | undefined,
  options: ForecastV4GateOptions = {},
): void {
  if (user === undefined) return; // internal/trusted call — already gated upstream
  if (!isForecastV4EnabledForUser(user, options)) {
    throw new Error('Forecast V4 is restricted to admin users.');
  }
}
