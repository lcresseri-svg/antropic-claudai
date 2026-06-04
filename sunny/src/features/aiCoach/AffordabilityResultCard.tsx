import { AffordabilityResult } from './aiCoachTypes';
import { CategoryDef } from '../../types';

interface Props {
  result: AffordabilityResult;
  categories: CategoryDef[];
  onReset: () => void;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function AffordabilityResultCard({ result, categories, onReset }: Props) {
  const getCat = (id: string) => categories.find(c => c.id === id);

  // Headline tone: green if it fits this month, gold otherwise.
  const fits = result.fitsThisMonth;
  const accent = fits
    ? { color: 'text-[#6FCF97]', bg: 'bg-[#6FCF97]/10', border: 'border-[#6FCF97]/25' }
    : { color: 'text-gold', bg: 'bg-gold/8', border: 'border-gold/25' };

  const headline = fits
    ? 'Te lo puoi togliere già questo mese'
    : result.readyBy
    ? `Raggiungibile verso ${result.readyBy}`
    : result.monthlySaving <= 0
    ? 'Servono dei tagli per accumulare'
    : 'Meglio spalmarlo su più mesi';

  return (
    <div className="space-y-4 animate-fade-in-fast">
      {/* AI narrative — the star of the card */}
      <div className={`rounded-2xl px-4 py-4 border ${accent.bg} ${accent.border}`}>
        <p className={`font-semibold text-sm mb-2 ${accent.color}`}>{headline}</p>
        <p className="text-sm text-primary leading-relaxed whitespace-pre-line">{result.advice}</p>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Risparmio mensile stimato" value={fmt(result.monthlySaving)} />
        {result.monthlyInvestments !== undefined && result.monthlyInvestments > 0 && (
          <Stat label="Investimenti/mese (leva)" value={fmt(result.monthlyInvestments)} accent="text-gold" />
        )}
        {result.upcomingCommitted !== undefined && result.upcomingCommitted > 0 && (
          <Stat label="Già impegnato questo mese" value={fmt(result.upcomingCommitted)} />
        )}
        {result.savingsTarget !== undefined && result.savingsTarget > 0 && (
          <Stat label="Obiettivo di risparmio" value={fmt(result.savingsTarget)} />
        )}
        {fits ? (
          <Stat label="Ti resterebbe questo mese" value={fmt(result.leftoverIfBought)} accent="text-[#6FCF97]" />
        ) : (
          result.monthOvershoot > 0 && (
            <Stat label="Sforamento se compri ora" value={fmt(result.monthOvershoot)} accent="text-[#E08B8B]" />
          )
        )}
        {!fits && result.monthsToAfford !== null && (
          <Stat label="Mesi al ritmo attuale" value={`~${result.monthsToAfford}`} />
        )}
        {!fits && result.monthsToAffordWithCuts !== null && result.monthsToAffordWithCuts !== result.monthsToAfford && (
          <Stat label="Mesi tagliando le spese" value={`~${result.monthsToAffordWithCuts}`} accent="text-gold" />
        )}
        {result.requiredMonthly !== null && (
          <Stat
            label="Per la tua scadenza"
            value={`${fmt(result.requiredMonthly)}/mese`}
            accent={result.targetFeasible ? 'text-[#6FCF97]' : 'text-[#E08B8B]'}
          />
        )}
      </div>

      {/* Suggested cuts */}
      {!fits && result.topCuts.length > 0 && (
        <div className="rounded-2xl bg-card border border-divider px-4 py-3.5">
          <p className="text-xs text-secondary font-medium mb-3">Dove puoi liberare margine</p>
          <div className="space-y-2">
            {result.topCuts.map(cut => {
              const cat = getCat(cut.categoryId);
              const label = cat ? `${cat.icon} ${cat.label}` : cut.label;
              return (
                <div key={cut.categoryId} className="flex items-center justify-between">
                  <span className="text-sm text-primary">{label}</span>
                  <span className="text-sm text-secondary font-medium">{fmt(cut.amount)}/mese</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Remaining calls */}
      <p className="text-xs text-secondary text-center">
        {result.remaining} {result.remaining === 1 ? 'analisi rimasta' : 'analisi rimaste'} oggi
      </p>

      <button
        onClick={onReset}
        className="w-full py-2.5 rounded-xl border border-divider text-sm text-secondary hover:text-primary hover:border-gold/30 transition-colors"
      >
        Nuova analisi
      </button>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-card border border-divider px-3.5 py-3">
      <p className="text-xs text-secondary mb-1">{label}</p>
      <p className={`text-lg font-semibold tracking-[-0.02em] ${accent ?? 'text-primary'}`}>{value}</p>
    </div>
  );
}
