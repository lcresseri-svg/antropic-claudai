import { useSettings } from '../../shared/providers/settings';
import { useAICoach } from './useAICoach';
import { AffordabilityForm } from './AffordabilityForm';
import { AffordabilityResultCard } from './AffordabilityResultCard';

export function AICoachScreen() {
  const { categories } = useSettings();
  const { status, result, errorMsg, remaining, analyze, reset } = useAICoach();

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
        <AffordabilityResultCard result={result} categories={categories} onReset={reset} />
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl bg-card border border-divider px-5 py-5">
            <AffordabilityForm
              onSubmit={analyze}
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
