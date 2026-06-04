import { AffordabilityResult } from './aiCoachTypes';
import { CategoryDef } from '../../types';

interface Props {
  result: AffordabilityResult;
  categories: CategoryDef[];
  onReset: () => void;
}

const verdictConfig = {
  yes: { label: 'Sì, puoi permettertelo', color: 'text-[#6FCF97]', bg: 'bg-[#6FCF97]/10', border: 'border-[#6FCF97]/25', icon: '✓' },
  maybe: { label: 'Forse, con qualche aggiustamento', color: 'text-gold', bg: 'bg-gold/8', border: 'border-gold/25', icon: '~' },
  no: { label: 'Non ancora, ma ci puoi arrivare', color: 'text-[#E08B8B]', bg: 'bg-[#E08B8B]/10', border: 'border-[#E08B8B]/25', icon: '✕' },
};

function fmt(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function AffordabilityResultCard({ result, categories, onReset }: Props) {
  const vc = verdictConfig[result.verdict];
  const getCat = (id: string) => categories.find(c => c.id === id);

  return (
    <div className="space-y-4 animate-fade-in-fast">
      {/* Verdict banner */}
      <div className={`rounded-2xl px-4 py-4 border ${vc.bg} ${vc.border}`}>
        <div className="flex items-center gap-3 mb-2">
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${vc.bg} ${vc.color} border ${vc.border}`}>
            {vc.icon}
          </span>
          <p className={`font-semibold text-sm ${vc.color}`}>{vc.label}</p>
        </div>
        <p className="text-sm text-primary leading-relaxed">{result.advice}</p>
      </div>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Risparmio mensile previsto" value={fmt(result.projectedMonthlySaving)} />
        {result.requiredMonthly !== null && (
          <Stat label="Necessario al mese" value={fmt(result.requiredMonthly)} />
        )}
        {result.gap !== null && result.gap > 0 && (
          <Stat label="Gap mensile" value={fmt(result.gap)} accent="text-[#E08B8B]" />
        )}
        {result.daysLeft !== null && (
          <Stat label="Giorni rimasti" value={String(Math.round(result.daysLeft))} />
        )}
      </div>

      {/* Suggested cuts */}
      {result.topCuts.length > 0 && (
        <div className="rounded-2xl bg-card border border-divider px-4 py-3.5">
          <p className="text-xs text-secondary font-medium mb-3">Categorie con più margine di taglio</p>
          <div className="space-y-2">
            {result.topCuts.map(cut => {
              const cat = getCat(cut.categoryId);
              return (
                <div key={cut.categoryId} className="flex items-center justify-between">
                  <span className="text-sm text-primary">
                    {cat ? `${cat.icon} ${cat.label}` : cut.categoryId}
                  </span>
                  <span className="text-sm text-secondary font-medium">{fmt(cut.amount)}</span>
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
