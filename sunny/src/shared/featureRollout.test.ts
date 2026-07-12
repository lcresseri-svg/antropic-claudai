import { describe, it, expect } from 'vitest';
import {
  isFeatureEnabled, rolloutBucket, fnv1a, FEATURE_ROLLOUT,
  FeatureFlag, RolloutStage,
} from './featureRollout';
import { ADMIN_UIDS } from './featureFlags';

const ADMIN = ADMIN_UIDS[0];
const FLAGS = Object.keys(FEATURE_ROLLOUT) as FeatureFlag[];

describe('featureRollout', () => {
  it('every flag is admin-only at the current stage', () => {
    for (const flag of FLAGS) {
      expect(FEATURE_ROLLOUT[flag].stage).toBe('admin');
    }
  });

  it('admin sees every gated feature; normal users see none (admin stage)', () => {
    for (const flag of FLAGS) {
      expect(isFeatureEnabled(flag, { uid: ADMIN })).toBe(true);
      expect(isFeatureEnabled(flag, { uid: 'normal-user-uid' })).toBe(false);
    }
  });

  it('signed-out users never see gated features', () => {
    for (const flag of FLAGS) {
      expect(isFeatureEnabled(flag, null)).toBe(false);
      expect(isFeatureEnabled(flag, { uid: null })).toBe(false);
      expect(isFeatureEnabled(flag, undefined)).toBe(false);
    }
  });

  it('fnv1a is stable (fixed vectors)', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('wealth_v2:user-1')).toBe(fnv1a('wealth_v2:user-1'));
  });

  it('rolloutBucket is deterministic, in [0,100), and flag-independent', () => {
    const b1 = rolloutBucket('wealth_v2', 'user-1');
    expect(b1).toBe(rolloutBucket('wealth_v2', 'user-1'));
    expect(b1).toBeGreaterThanOrEqual(0);
    expect(b1).toBeLessThan(100);
    // Different flags bucket the same user independently (not all equal).
    const buckets = FLAGS.map(f => rolloutBucket(f, 'user-1'));
    expect(new Set(buckets).size).toBeGreaterThan(1);
  });

  it('percentage stage admits exactly the users below the threshold', () => {
    const stage: RolloutStage = { stage: 'percentage', percent: 30 };
    const original = FEATURE_ROLLOUT.wealth_v2;
    FEATURE_ROLLOUT.wealth_v2 = stage;
    try {
      for (let i = 0; i < 50; i++) {
        const uid = `user-${i}`;
        expect(isFeatureEnabled('wealth_v2', { uid })).toBe(rolloutBucket('wealth_v2', uid) < 30);
      }
      // 0% admits nobody (but still the admin); 100% admits everyone.
      FEATURE_ROLLOUT.wealth_v2 = { stage: 'percentage', percent: 0 };
      expect(isFeatureEnabled('wealth_v2', { uid: 'user-1' })).toBe(false);
      expect(isFeatureEnabled('wealth_v2', { uid: ADMIN })).toBe(true);
      FEATURE_ROLLOUT.wealth_v2 = { stage: 'percentage', percent: 100 };
      expect(isFeatureEnabled('wealth_v2', { uid: 'user-1' })).toBe(true);
    } finally {
      FEATURE_ROLLOUT.wealth_v2 = original;
    }
  });

  it('allowlist stage admits listed uids plus the admin', () => {
    const original = FEATURE_ROLLOUT.commitments;
    FEATURE_ROLLOUT.commitments = { stage: 'allowlist', uids: ['friend-1'] };
    try {
      expect(isFeatureEnabled('commitments', { uid: 'friend-1' })).toBe(true);
      expect(isFeatureEnabled('commitments', { uid: 'stranger' })).toBe(false);
      expect(isFeatureEnabled('commitments', { uid: ADMIN })).toBe(true);
    } finally {
      FEATURE_ROLLOUT.commitments = original;
    }
  });

  it('all stage admits every signed-in user', () => {
    const original = FEATURE_ROLLOUT.decision_coach;
    FEATURE_ROLLOUT.decision_coach = { stage: 'all' };
    try {
      expect(isFeatureEnabled('decision_coach', { uid: 'anyone' })).toBe(true);
      expect(isFeatureEnabled('decision_coach', null)).toBe(false);
    } finally {
      FEATURE_ROLLOUT.decision_coach = original;
    }
  });
});
