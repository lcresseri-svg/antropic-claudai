export type FeedbackType = 'bug' | 'idea' | 'confusion' | 'other';

export interface UserFeedback {
  userId: string;
  userEmail: string | null;
  type: FeedbackType;
  text: string | null;
  appVersion: string;
  createdAt: number;
}

export const FEEDBACK_OPTIONS: { type: FeedbackType; icon: string; label: string }[] = [
  { type: 'bug',       icon: '🐞', label: 'Un problema' },
  { type: 'idea',      icon: '💡', label: 'Un\'idea' },
  { type: 'confusion', icon: '😕', label: 'Qualcosa di confuso' },
  { type: 'other',     icon: '💬', label: 'Altro' },
];
