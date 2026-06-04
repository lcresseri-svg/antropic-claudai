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
