import { describe, it, expect } from 'vitest';
import {
  isForecastV4EnabledForUser, assertForecastV4Access, FORECAST_V4_ADMIN_UIDS,
} from './forecastFeatureGate';

const ADMIN_UID = FORECAST_V4_ADMIN_UIDS[0];

describe('isForecastV4EnabledForUser', () => {
  it('enables V4 for a whitelisted admin uid', () => {
    expect(isForecastV4EnabledForUser({ uid: ADMIN_UID })).toBe(true);
  });

  it('enables V4 for a user with role admin', () => {
    expect(isForecastV4EnabledForUser({ uid: 'someone', role: 'admin' })).toBe(true);
  });

  it('enables V4 when a remote flag is set for the user', () => {
    expect(isForecastV4EnabledForUser({ uid: 'someone' }, { remoteFlagEnabled: true })).toBe(true);
  });

  it('does NOT enable V4 for a normal user (fallback to V3)', () => {
    expect(isForecastV4EnabledForUser({ uid: 'normal-user' })).toBe(false);
    expect(isForecastV4EnabledForUser({ uid: 'normal-user', role: 'user' })).toBe(false);
  });

  it('does NOT enable V4 for null / undefined users', () => {
    expect(isForecastV4EnabledForUser(null)).toBe(false);
    expect(isForecastV4EnabledForUser(undefined)).toBe(false);
  });
});

describe('assertForecastV4Access', () => {
  it('throws for a non-admin user', () => {
    expect(() => assertForecastV4Access({ uid: 'normal-user' })).toThrow(/admin/i);
  });

  it('does not throw for an admin user', () => {
    expect(() => assertForecastV4Access({ uid: ADMIN_UID })).not.toThrow();
  });

  it('does not throw for internal (undefined) callers — already gated upstream', () => {
    expect(() => assertForecastV4Access(undefined)).not.toThrow();
  });

  it('throws for an explicitly null user (a real but anonymous subject)', () => {
    expect(() => assertForecastV4Access(null)).toThrow(/admin/i);
  });
});
