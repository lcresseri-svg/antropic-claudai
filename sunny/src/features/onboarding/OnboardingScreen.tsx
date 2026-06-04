import { useState } from 'react';
import { useSettings } from '../../shared/providers/settings';
import { OnboardingData, OnboardingGoal } from './onboardingTypes';
import { OnboardingLayout } from './OnboardingLayout';
import { WelcomeStep } from './steps/WelcomeStep';
import { GoalsStep } from './steps/GoalsStep';
import { AccountStep } from './steps/AccountStep';
import { DataSourceStep } from './steps/DataSourceStep';
import { SavingsTargetStep } from './steps/SavingsTargetStep';
import { FirstInsightStep } from './steps/FirstInsightStep';

interface Props {
  uid: string;
  onboarding: OnboardingData;
  updateOnboarding: (patch: Partial<OnboardingData>) => void;
  completeOnboarding: () => void;
  skipOnboarding: () => void;
}

const TOTAL_STEPS = 6;

export function OnboardingScreen({
  uid,
  onboarding,
  updateOnboarding,
  completeOnboarding,
  skipOnboarding,
}: Props) {
  const [step, setStep] = useState(onboarding.currentStep ?? 0);
  const [goals, setGoals] = useState<OnboardingGoal[]>(onboarding.goals ?? []);
  const [accountId, setAccountId] = useState<string>('');
  const [dataMode, setDataMode] = useState<'manual' | 'csv' | 'demo' | null>(onboarding.dataMode ?? null);

  const { saveEnableBudget, saveEnableInvestments } = useSettings();

  const advance = (next: number, patch?: Partial<OnboardingData>) => {
    setStep(next);
    updateOnboarding({ currentStep: next, ...patch });
  };

  const handleGoalsNext = (selected: OnboardingGoal[]) => {
    setGoals(selected);
    if (selected.includes('budget') || selected.includes('save_more')) saveEnableBudget(true);
    if (selected.includes('investments')) saveEnableInvestments(true);
    advance(2, { goals: selected });
  };

  const handleAccountNext = (id: string) => {
    setAccountId(id);
    advance(3, { firstAccountCreated: true });
  };

  const handleDataSourceNext = (mode: 'manual' | 'csv' | 'demo', demoIds?: string[]) => {
    setDataMode(mode);
    advance(4, { dataMode: mode, ...(demoIds ? { demoTransactionIds: demoIds } : {}) });
  };

  const handleSavingsNext = (_target: number | null) => {
    advance(5);
  };

  // Steps 1–4 are skippable (step 0 = Welcome has no skip, step 5 = Last has no skip)
  const canSkip = step >= 1 && step <= 4;

  return (
    <OnboardingLayout step={step} totalSteps={TOTAL_STEPS} onSkip={canSkip ? skipOnboarding : undefined}>
      {step === 0 && <WelcomeStep onNext={() => advance(1)} />}
      {step === 1 && (
        <GoalsStep selected={goals} onChange={setGoals} onNext={handleGoalsNext} />
      )}
      {step === 2 && <AccountStep onNext={handleAccountNext} />}
      {step === 3 && (
        <DataSourceStep uid={uid} accountId={accountId} onNext={handleDataSourceNext} />
      )}
      {step === 4 && <SavingsTargetStep uid={uid} onNext={handleSavingsNext} />}
      {step === 5 && (
        <FirstInsightStep dataMode={dataMode} onComplete={completeOnboarding} />
      )}
    </OnboardingLayout>
  );
}
