import { useEffect, useRef, useState } from 'react';
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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHead } from '../../shared/components/PageHead';
import { buildCommitments } from '../wealth/commitments';
import { buildCoachPlan } from './buildCoachPlan';

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
  const [params] = useSearchParams();
  const { categories } = useSettings();
  const { status, result, errorMsg, remaining, analyze, reset } = useAICoach();
  // Last submitted request — feeds the deterministic Decision Coach panel.
  const [lastReq, setLastReq] = useState<AffordabilityRequest | null>(null);

  const decisionCoachEnabled = isFeatureEnabled('decision_coach', user ?? null)
    && transactions != null && liquidity != null;

  // metrics: aicoach_open on mount (fire-and-forget).
  useEffect(() => { if (user) logEvent(user.uid, 'aicoach_open'); }, [user]);

  // La domanda può arrivare già scritta dal Piano (?item=&cost=): in quel caso
  // l'analisi parte da sola, altrimenti si arriverebbe su un form da
  // ricompilare con le stesse due cose appena inserite.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) return;
    const itemName = params.get('item')?.trim();
    const cost = Number(params.get('cost'));
    if (!itemName || !Number.isFinite(cost) || cost <= 0) return;
    askedRef.current = true;
    void submitRef.current({ itemName, cost });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const counterLabel = remaining === 0
    ? 'nessuna analisi rimasta oggi'
    : `${remaining} ${remaining === 1 ? 'analisi rimasta' : 'analisi rimaste'} oggi`;

  // I numeri li calcola il codice PRIMA di chiamare il modello: il modello
  // riceve un piano già fatto e deve solo spiegarlo. È l'unico modo perché
  // quello che dice non possa contraddire la dashboard — e perché non possa
  // inventarsi una cifra.
  const submit = (req: AffordabilityRequest) => {
    setLastReq(req);
    if (!transactions) return analyze(req);

    const todayISO = new Date().toISOString().slice(0, 10);
    const commitments = buildCommitments(transactions, todayISO);
    const plan = buildCoachPlan({
      transactions, categories, todayISO,
      liquidity: liquidity ?? 0,
      savingsTarget,
      fixedMonthlyCost: commitments.fixedMonthlyCost,
      // Le rate che finiscono liberano soldi a una data nota: dirlo evita di
      // consigliare tagli per un buco che si chiude da solo.
      endingInstallments: commitments.installments
        .filter(c => c.expectedEnd)
        .map(c => ({ description: c.description, monthly: c.monthlyEquivalent, endsISO: c.expectedEnd! })),
      cost: req.cost,
      targetDateISO: req.targetDate,
    });
    return analyze({ ...req, plan });
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

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
