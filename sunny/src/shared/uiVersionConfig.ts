import { isAdminUser, type UserLike } from './featureFlags';

export type UiVersion = '2.0' | '3.0';
export interface UiVersionConfig {
  everyone: UiVersion;
  pilotAdmin: UiVersion;
  pilotAdminUids: readonly string[];
  forceEveryone: UiVersion | null;
}

/** Change here, then rebuild. Presentation only: never grants feature/data access.
 * Rollback: forceEveryone: '2.0'. Public rollout: forceEveryone: '3.0'. */
export const UI_VERSION_CONFIG: UiVersionConfig = {
  everyone: '2.0',
  pilotAdmin: '2.0',
  pilotAdminUids: ['qPtCOJGRrwOZ2EfjxMHwW6ZISXX2'],
  forceEveryone: null,
};

export function resolveUiVersion(user: UserLike | null | undefined, config = UI_VERSION_CONFIG): UiVersion {
  if (!user?.uid) return '2.0';
  if (config.forceEveryone !== null) return config.forceEveryone;
  if (isAdminUser(user) && config.pilotAdminUids.includes(user.uid)) return config.pilotAdmin;
  return config.everyone;
}
