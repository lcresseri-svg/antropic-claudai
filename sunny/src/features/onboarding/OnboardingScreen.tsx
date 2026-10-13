import { ImportModal } from '../transactions/ImportModal';
import { createTransactionsSynced } from '../investments/investmentValueSync';
import { Transaction } from '../../types';
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
  onImport?: (rows:Omit<Transaction,'id'>[])=>Promise<void>;
  uid: string;
  onboarding: OnboardingData;
  updateOnboarding: (patch: Partial<OnboardingData>) => void;
  completeOnboarding: () => void;
  skipOnboarding: () => void;
}

const TOTAL_STEPS = 6;

export function OnboardingScreen({
  uid, onImport,
  onboarding,
  updateOnboarding,
  completeOnboarding,
  skipOnboarding,
}: Props) {
  const [busy,setBusy]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
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
    if(mode==='csv'){setImportOpen(true);return;}
    setDataMode(mode);
    advance(4, { dataMode: mode, ...(demoIds ? { demoTransactionIds: demoIds } : {}) });
  };

  const handleSavingsNext = (_target: number | null) => {
    advance(5);
  };

  // Steps 1–4 are skippable (step 0 = Welcome has no skip, step 5 = Last has no skip)
  const canSkip = step >= 1 && step <= 4;

  return (
    <><OnboardingLayout onBack={step>0&&!busy?()=>advance(step-1):undefined} step={step} totalSteps={TOTAL_STEPS} onSkip={canSkip&&!busy ? skipOnboarding : undefined}
      footer={step === 1 ? (
        <button type="button" onClick={() => handleGoalsNext(goals)}
          className="w-full py-4 rounded-2xl cta-gold-fill font-semibold text-[15px] active:scale-[0.98] transition-transform">
          {goals.length === 0
            ? 'Continua senza scegliere'
            : `Continua con ${goals.length} ${goals.length === 1 ? 'obiettivo' : 'obiettivi'}`}
        </button>
      ) : undefined}>
      {step === 0 && <WelcomeStep onNext={() => advance(1)} />}
      {step === 1 && <GoalsStep selected={goals} onChange={setGoals} />}
      <div hidden={step!==2}><AccountStep onNext={handleAccountNext} /></div>
      <div hidden={step!==3}><DataSourceStep existingDemoIds={onboarding.demoTransactionIds} uid={uid} accountId={accountId} onNext={handleDataSourceNext} /></div>
      <div hidden={step!==4}><SavingsTargetStep onBusyChange={setBusy} uid={uid} onNext={handleSavingsNext} /></div>
      {step === 5 && (
        <FirstInsightStep dataMode={dataMode} onComplete={completeOnboarding} />
      )}
    </OnboardingLayout><ImportModal open={importOpen} onClose={()=>setImportOpen(false)} onImport={async rows=>{
      if(onImport)await onImport(rows);else await createTransactionsSynced(uid,rows.map(t=>({...t,createdAt:t.createdAt??Date.now()})),{syncInvestments:false});
      setDataMode('csv');advance(4,{dataMode:'csv'});
    }}/></>
  );
}
