import { describe, expect, it } from 'vitest';
import { resolveUiVersion, type UiVersionConfig } from './uiVersionConfig';

const pilot = { uid: 'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2' };
const config: UiVersionConfig = {
  everyone: '2.0', pilotAdmin: '3.0', pilotAdminUids: [pilot.uid], forceEveryone: null,
};

describe('UI version visibility, independent of feature authorization', () => {
  it('gives only the listed admin the pilot interface', () => {
    expect(resolveUiVersion(pilot, config)).toBe('3.0');
    expect(resolveUiVersion({ uid: 'ordinary' }, config)).toBe('2.0');
  });
  it('does not give the pilot interface to an admin omitted from the pilot', () => {
    expect(resolveUiVersion(pilot, { ...config, pilotAdminUids: ['other'] })).toBe('2.0');
  });
  it('requires admin identity even if a normal UID is accidentally included', () => {
    expect(resolveUiVersion({ uid: 'ordinary' }, { ...config, pilotAdminUids: ['ordinary'] })).toBe('2.0');
  });
  it.each([null, undefined, {}, { uid: null }, { uid: '' }])('keeps unidentified/boot sessions on UI2: %j', user => {
    expect(resolveUiVersion(user, { ...config, forceEveryone: '3.0' })).toBe('2.0');
  });
  it('supports an authenticated global rollout without modifying the pilot', () => {
    expect(resolveUiVersion({ uid: 'ordinary' }, { ...config, forceEveryone: '3.0' })).toBe('3.0');
  });
  it('global rollback takes precedence over the pilot', () => {
    expect(resolveUiVersion(pilot, { ...config, forceEveryone: '2.0' })).toBe('2.0');
  });
  it('supports retiring the pilot and advancing everyone from the same config', () => {
    expect(resolveUiVersion(pilot, { ...config, pilotAdmin: '2.0' })).toBe('2.0');
    expect(resolveUiVersion({ uid: 'ordinary' }, { ...config, everyone: '3.0' })).toBe('3.0');
  });
});
