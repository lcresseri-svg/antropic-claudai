import { useRef, useState } from 'react';
import type { OnboardingProps } from './OnboardingScreen';
import { OnboardingGoal } from './onboardingTypes';
import { useSettings } from '../../shared/providers/settings';
import { ConfirmationDialog } from '../../shared/components/DiscardConfirmation';
import { ImportModal } from '../transactions/ImportModal';
import { createTransactionsSynced } from '../investments/investmentValueSync';
import { writeDemoData } from './demoData';
import { nextAfterSource } from './entryJourney';
import { OnboardingLayout } from './OnboardingLayout';
import { WelcomeStep } from './steps/WelcomeStep';
import { DataSourceStep } from './steps/DataSourceStep';
import { AccountStep } from './steps/AccountStep';
import { GoalsStep } from './steps/GoalsStep';
import { SavingsTargetStep } from './steps/SavingsTargetStep';
import { FirstInsightStep } from './steps/FirstInsightStep';

export function Ui31OnboardingScreen({uid, onboarding, updateOnboarding, completeOnboarding, skipOnboarding, onImport, transactions, transactionsLoading, transactionsError}: OnboardingProps) {
  const { accounts } = useSettings();
  const [step, setStep] = useState(onboarding.currentStep ?? 0);
  const [mode, setMode] = useState(onboarding.dataMode);
  const [goals, setGoals] = useState<OnboardingGoal[]>(onboarding.goals ?? []);
  const [accountId, setAccountId] = useState(() => onboarding.firstAccountCreated ? accounts.find(a => a.id.startsWith('onb_') && !a.archived)?.id ?? '' : '');
  const activeAccountId = accountId || (onboarding.firstAccountCreated ? accounts.find(a => a.id.startsWith('onb_') && !a.archived)?.id ?? '' : '');
  const [demoIds, setDemoIds] = useState(onboarding.demoTransactionIds);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const writeLock = useRef(false);
  const [error, setError] = useState('');
  const advance = (next: number, patch = {}) => {
    setStep(next);
    updateOnboarding({currentStep:next, ...patch});
  };
  const continueSource = (selected: 'manual'|'csv'|'demo', id = activeAccountId) => {
    setMode(selected);
    const next = nextAfterSource(selected, Boolean(id));
    if (next === 'account') advance(2, {dataMode:selected});
    if (next === 'reading') advance(5, {dataMode:selected});
    if (next === 'import') { updateOnboarding({dataMode:selected}); setImportOpen(true); }
    if (next === 'demo-confirmation') {
      updateOnboarding({dataMode:selected});
      if (demoIds?.length) advance(5); else setConfirmDemo(true);
    }
  };
  const createDemo = async () => {
    if (writeLock.current || !activeAccountId) return;
    writeLock.current = true;
    setBusy(true); setError('');
    try {
      const ids = await writeDemoData(uid, activeAccountId);
      setDemoIds(ids); setConfirmDemo(false);
      advance(5, {dataMode:'demo', demoTransactionIds:ids});
    } catch { setError('I dati di esempio non sono stati aggiunti. Riprova.'); }
    finally { setBusy(false); writeLock.current = false; }
  };
  const previous = step === 2 ? 3 : step === 3 ? 0 : step === 1 || step === 4 ? 5 : 3;
  return <>
    <OnboardingLayout step={step} totalSteps={6} onBack={step > 0 && !busy ? () => advance(previous) : undefined}
      onSkip={step > 0 && step < 5 && !busy ? skipOnboarding : undefined}
      footer={step === 1 ? <button type="button" className="w-full cta-gold-fill rounded-2xl py-4" onClick={() => advance(5, {goals})}>Conserva preferenze e continua</button> : undefined}>
      {step === 0 && <WelcomeStep onNext={() => advance(3)} />}
      {step === 3 && <DataSourceStep uid={uid} accountId={activeAccountId} existingDemoIds={demoIds} deferDemo onNext={selected => continueSource(selected)} />}
      <div hidden={step !== 2}><AccountStep existingAccountId={activeAccountId}
        onDefer={mode === 'demo' ? undefined : () => mode === 'csv' ? setImportOpen(true) : advance(5)}
        onNext={id => { setAccountId(id); updateOnboarding({firstAccountCreated:true}); continueSource(mode ?? 'manual', id); }} /></div>
      {step === 1 && <GoalsStep selected={goals} onChange={setGoals} />}
      <div hidden={step !== 4}><SavingsTargetStep uid={uid} onBusyChange={setBusy} onNext={() => advance(5)} /></div>
      {step === 5 && <FirstInsightStep dataMode={mode} transactions={transactions} loading={transactionsLoading} error={transactionsError} onComplete={completeOnboarding}
        onOptionalGoals={() => advance(1)} onOptionalSavings={() => advance(4)} />}
    </OnboardingLayout>
    <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onImport={async rows => {
      if (onImport) await onImport(rows);
      else await createTransactionsSynced(uid, rows.map(t => ({...t,createdAt:t.createdAt ?? Date.now()})), {syncInvestments:false});
      setImportOpen(false); advance(5, {dataMode:'csv'});
    }} />
    {confirmDemo && <ConfirmationDialog title="Aggiungere dati di esempio?" description={error || 'I movimenti dimostrativi saranno aggiunti al conto scelto. Restano riconoscibili e rimovibili dalle Impostazioni; non rappresentano i tuoi soldi.'}
      confirmLabel="Aggiungi dati di esempio" busy={busy} onCancel={() => { setConfirmDemo(false); setError(''); }} onConfirm={() => void createDemo()} />}
  </>;
}
