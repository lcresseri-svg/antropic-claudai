// Per-user "already seen" tracking for in-app release notices. Stored in
// localStorage (per browser/device) to keep Firebase cost at zero — same
// tradeoff as WhatsNewModal / RecapPrompt. The key embeds BOTH the notice id
// and the user id, so each account on a shared device gets its own notice.
// FUTURE (multi-device): move the flag to users/{uid}/meta/settings so it
// follows the user across devices.

/** The notice currently live. Change id + texts in ReleaseNotice.tsx to ship a new one. */
export const RELEASE_NOTICE_ID = 'investments-flow-2026-07';

const key = (userId: string, noticeId: string) => `sunny_seen_notice_${noticeId}_${userId}`;

export function hasSeenReleaseNotice(userId: string, noticeId: string): boolean {
  try { return localStorage.getItem(key(userId, noticeId)) === 'true'; } catch { return true; }
}

export function markReleaseNoticeSeen(userId: string, noticeId: string): void {
  try { localStorage.setItem(key(userId, noticeId), 'true'); } catch { /* ignore */ }
}
