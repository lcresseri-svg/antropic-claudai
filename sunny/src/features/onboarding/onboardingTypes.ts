export type OnboardingGoal =
  | 'understand_spending'
  | 'save_more'
  | 'subscriptions'
  | 'budget'
  | 'investments'
  | 'ai_insights';

export interface OnboardingData {
  completed: boolean;
  version: number;
  currentStep: number;
  goals: OnboardingGoal[];
  dataMode: 'manual' | 'csv' | 'demo' | null;
  completedAt?: string;
  skippedAt?: string;
  firstAccountCreated?: boolean;
  demoTransactionIds?: string[];
}

export const ONBOARDING_VERSION = 1;
