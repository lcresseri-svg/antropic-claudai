import { User } from 'firebase/auth';

// Per-user feature gating. Some features are rolled out to a hand-picked
// allow-list (by Firebase UID, preferred, or by email) before going wide.

// Detailed investments: fund-type classification (pension / bond / equity),
// TFR tracking on pension funds, and the "by fund type" allocation donut.
const DETAILED_INVEST_UIDS: string[] = [
  'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2',
];
const DETAILED_INVEST_EMAILS: string[] = [];

export function canUseDetailedInvestments(user: User | null): boolean {
  if (!user) return false;
  if (user.uid && DETAILED_INVEST_UIDS.includes(user.uid)) return true;
  if (user.email && DETAILED_INVEST_EMAILS.includes(user.email.toLowerCase())) return true;
  return false;
}

// Push notifications: available to all logged-in users.
export function canUsePush(user: User | null): boolean {
  return !!user;
}

export function isAdminUser(user: User | null): boolean {
  return canUseDetailedInvestments(user);
}

// Forecast Engine V2 (multi-signal model + backtest): admin-only experimental feature.
// Non-admin users see nothing — the /forecast-v2 route redirects to dashboard.
const FORECAST_V2_UIDS: string[] = [
  'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2',
];
export function canUseForecastV2(user: import('firebase/auth').User | null): boolean {
  if (!user) return false;
  return FORECAST_V2_UIDS.includes(user.uid);
}

// UI v2.0.0 ("financial copilot" redesign): rolled out to the admin allow-list
// only. Everyone else keeps the previous (v1.9.x) interface. Widen this list to
// release the new UI more broadly.
const UI_V2_UIDS: string[] = [
  'qPtCOJGRrwOZ2EfjxMHwW6ZISXX2',
];
const UI_V2_EMAILS: string[] = [];

export function canUseUiV2(user: User | null): boolean {
  if (!user) return false;
  if (user.uid && UI_V2_UIDS.includes(user.uid)) return true;
  if (user.email && UI_V2_EMAILS.includes(user.email.toLowerCase())) return true;
  return false;
}
