import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RELEASE_NOTICE_ID, hasSeenReleaseNotice, markReleaseNoticeSeen } from './releaseNoticeStorage';

// Minimal localStorage stub for the node test environment.
function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
  return store;
}

describe('releaseNoticeStorage', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('the current notice id is the investments/flows release', () => {
    expect(RELEASE_NOTICE_ID).toBe('investments-flow-2026-07');
  });

  it('shown once per user: unseen → seen after mark, per notice id AND user id', () => {
    stubLocalStorage();
    expect(hasSeenReleaseNotice('u1', RELEASE_NOTICE_ID)).toBe(false);
    markReleaseNoticeSeen('u1', RELEASE_NOTICE_ID);
    expect(hasSeenReleaseNotice('u1', RELEASE_NOTICE_ID)).toBe(true);
    // Another user on the same device still gets the notice.
    expect(hasSeenReleaseNotice('u2', RELEASE_NOTICE_ID)).toBe(false);
    // A future notice id is independent from the current one.
    expect(hasSeenReleaseNotice('u1', 'some-future-notice')).toBe(false);
  });

  it('a NEW release id shows again even after older notices were dismissed', () => {
    stubLocalStorage();
    markReleaseNoticeSeen('u1', 'wealth-series-update-2026-07'); // previous release
    expect(hasSeenReleaseNotice('u1', RELEASE_NOTICE_ID)).toBe(false);
  });

  it('storage unavailable → fails CLOSED (never re-shows in a loop)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
    });
    expect(hasSeenReleaseNotice('u1', RELEASE_NOTICE_ID)).toBe(true);
    expect(() => markReleaseNoticeSeen('u1', RELEASE_NOTICE_ID)).not.toThrow();
  });
});
