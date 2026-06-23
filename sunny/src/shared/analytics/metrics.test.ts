import { describe, it, expect, vi } from 'vitest';

// Mock the Firebase entry point so importing the module doesn't initialise the
// real app (no env, no IndexedDB) — we only test the pure helpers + allowlist.
vi.mock('../../lib/firebase', () => ({ db: {} }));

import { todayKey, pushActiveDay, METRIC_EVENTS, ACTIVE_DAYS_KEEP } from './metrics';

describe('todayKey', () => {
  it('formats local date as YYYY-MM-DD with zero padding', () => {
    expect(todayKey(new Date(2026, 5, 23))).toBe('2026-06-23'); // June (month index 5)
    expect(todayKey(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

describe('pushActiveDay', () => {
  it('appends a new day and keeps the list sorted', () => {
    expect(pushActiveDay(['2026-06-02'], '2026-06-01')).toEqual(['2026-06-01', '2026-06-02']);
  });

  it('dedups an already-present day', () => {
    expect(pushActiveDay(['2026-06-01', '2026-06-02'], '2026-06-01'))
      .toEqual(['2026-06-01', '2026-06-02']);
  });

  it('trims to the last `keep` days, dropping the oldest', () => {
    const days = Array.from({ length: ACTIVE_DAYS_KEEP }, (_, i) =>
      `2026-01-${String(i + 1).padStart(2, '0')}`);
    // 35 days Jan 1..Jan 35 (overflow days are fine as lexical strings here)
    const out = pushActiveDay(days, '2026-02-01');
    expect(out.length).toBe(ACTIVE_DAYS_KEEP);
    expect(out).toContain('2026-02-01');         // new day kept
    expect(out).not.toContain('2026-01-01');     // oldest dropped
  });

  it('handles an empty starting list', () => {
    expect(pushActiveDay([], '2026-06-23')).toEqual(['2026-06-23']);
  });
});

describe('METRIC_EVENTS allowlist', () => {
  it('is exactly the seven approved event names', () => {
    expect([...METRIC_EVENTS].sort()).toEqual(
      ['aicoach_open', 'app_open', 'forecast_view', 'insight_open', 'insights_view', 'notif_open', 'tx_add'],
    );
  });
});
