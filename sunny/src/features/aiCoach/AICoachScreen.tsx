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

interface Props {
  user?: User | null;
  /** Needed only by the gated Decision Coach panel. */
  transactions?: Transaction[];
  liquidity?: number;
  savingsTarget?: number;
}

export function AICoachScreen({ user, transactions, liquidity, savingsTarget }: Props) {
  const { categories } = useSettings();
  const { status, result, errorMsg, remaining, analyze, reset } = useAICoach();
  // Last submitted request — feeds the deterministic Decision Coach panel.
  const [lastReq, setLastReq] = useState<AffordabilityRequest | null>(null);

  const decisionCoachEnabled = isFeatureEnabled('decision_coach', user ?? null)
    && transactions != null && liquidity != null;

  // metrics: aicoach_open on mount (fire-and-forget).
  useEffect(() => { if (user) logEvent(user.uid, 'aicoach_open'); }, [user]);

  const submit = (req: AffordabilityRequest) => {
    setLastReq(req);
    return analyze(req);
  };

  return (
    <div className="pt-4 md:pt-6 max-w-lg">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">AI Coach</h1>
        {remaining !== null && remaining > 0 && (
          <span className="text-xs text-secondary">{remaining} analisi rimaste oggi</span>
        )}
      </div>
      <p className="text-sm text-secondary mb-6">Descrivi un acquisto e ti dico se i tuoi numeri lo reggono.</p>

      {status === 'done' && result ? (
        <div className="space-y-4">
          {decisionCoachEnabled && lastReq && transactions && liquidity != null && (
            <DecisionCoachPanel
              itemName={lastReq.itemName}
              cost={lastReq.cost}
              transactions={transactions}
              liquidity={liquidity}
              savingsTarget={savingsTarget ?? result.savingsTarget ?? 0}
            />
          )}
          <AffordabilityResultCard result={result} categories={categories} onReset={reset} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-card border border-divider px-5 py-5">
            <AffordabilityForm
              onSubmit={submit}
              loading={status === 'loading'}
            />
          </div>

          {status === 'error' && (
            <div className="rounded-xl bg-[#E08B8B]/10 border border-[#E08B8B]/25 px-4 py-3">
              <p className="text-sm text-[#E08B8B]">{errorMsg}</p>
              {remaining === 0 && (
                <p className="text-xs text-[#E08B8B]/70 mt-1">Il contatore si azzera a mezzanotte UTC.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
