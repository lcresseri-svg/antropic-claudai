import { useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { isFeatureEnabled } from '../../shared/featureRollout';
import { useAICoach } from './useAICoach';
import { AffordabilityForm } from './AffordabilityForm';
import { AffordabilityResultCard } from './AffordabilityResultCard';
import { DecisionCoachPanel } from './DecisionCoachPanel';
import { AffordabilityRequest } from './aiCoachTypes';
import { logEvent } from '../../shared/analytics/metrics';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../../shared/components/PageHead';

interface Props {
  user?: User | null;
  /** Needed only by the gated Decision Coach panel. */
  transactions?: Transaction[];
  liquidity?: number;
  savingsTarget?: number;
  /** Scrive l'obiettivo mensile nel Piano dal risultato dell'analisi. */
  onSetSavingsTarget?: (monthly: number) => void;
}

export function AICoachScreen({ user, transactions, liquidity, savingsTarget, onSetSavingsTarget }: Props) {
  const navigate = useNavigate();
  const { categories } = useSettings();
  const { status, result, errorMsg, remaining, analyze, reset } = useAICoach();
  // Last submitted request — feeds the deterministic Decision Coach panel.
  const [lastReq, setLastReq] = useState<AffordabilityRequest | null>(null);

  const decisionCoachEnabled = isFeatureEnabled('decision_coach', user ?? null)
    && transactions != null && liquidity != null;

  // metrics: aicoach_open on mount (fire-and-forget).
  useEffect(() => { if (user) logEvent(user.uid, 'aicoach_open'); }, [user]);

  const counterLabel = remaining === 0
    ? 'nessuna analisi rimasta oggi'
    : `${remaining} ${remaining === 1 ? 'analisi rimasta' : 'analisi rimaste'} oggi`;

  const submit = (req: AffordabilityRequest) => {
    setLastReq(req);
    return analyze(req);
  };

  return (
    <div className="pb-32 md:pb-6">
      <div className="md:hidden mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[17px] font-semibold text-primary tracking-[-0.03em]">AI Coach</h1>
          {remaining !== null && (
            <span className="text-[11.5px] text-tertiary flex-none">{counterLabel}</span>
          )}
        </div>
        <p className="text-[12.5px] text-secondary mt-0.5">Descrivi un acquisto e ti dico se i tuoi numeri lo reggono.</p>
      </div>
      <PageHead title="AI Coach"
        subtitle="Descrivi un acquisto e ti dico se i tuoi numeri lo reggono"
        action={remaining !== null
          ? <span className="text-[12px] text-tertiary">{counterLabel}</span>
          : undefined} />

      {status === 'done' && result ? (
        <div className="flex flex-col wide:flex-row gap-3.5 md:gap-4 wide:items-start">
          <div className="wide:flex-1 wide:min-w-0">
            <AffordabilityResultCard result={result} categories={categories} onReset={reset}
              question={lastReq ? { itemName: lastReq.itemName, cost: lastReq.cost, deadline: lastReq.targetDate } : undefined}
              onEditQuestion={reset}
              onPlanIt={onSetSavingsTarget
                ? monthly => { onSetSavingsTarget(monthly); navigate('/budget'); }
                : undefined} />
          </div>
          {decisionCoachEnabled && lastReq && transactions && liquidity != null && (
            <div className="wide:w-[360px] wide:flex-none">
              <DecisionCoachPanel
                itemName={lastReq.itemName}
                cost={lastReq.cost}
                transactions={transactions}
                liquidity={liquidity}
                savingsTarget={savingsTarget ?? result.savingsTarget ?? 0}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 md:max-w-[560px]">
          <div className="glass-card rounded-[20px] px-5 py-5">
            <AffordabilityForm
              onSubmit={submit}
              loading={status === 'loading'}
            />
          </div>

          {status === 'error' && (
            <div className="rounded-2xl px-4 py-3" style={{ background: 'rgba(var(--c-red) / 0.1)' }}>
              <p className="text-[13px] text-red">{errorMsg}</p>
              {remaining === 0 && (
                <p className="text-[11.5px] text-red/70 mt-1">Il contatore si azzera a mezzanotte UTC.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
