import { User } from 'firebase/auth';

// Per-user feature gating. Some features are rolled out to a hand-picked
// allow-list (by Firebase UID, preferred, or by email) before going wide.

// Detailed investments: fund-type classification (pension / bond / equity),
// TFR tracking on pension funds, and the "by fund type" allocation donut.
const DETAILED_INVEST_UIDS: string[] = [
  // Add your Firebase UID here for the most robust gating, e.g. 'AbC123...'.
];
const DETAILED_INVEST_EMAILS: string[] = [
  'l.cresseri@technemetrologia.it',
];

export function canUseDetailedInvestments(user: User | null): boolean {
  if (!user) return false;
  if (user.uid && DETAILED_INVEST_UIDS.includes(user.uid)) return true;
  if (user.email && DETAILED_INVEST_EMAILS.includes(user.email.toLowerCase())) return true;
  return false;
}
