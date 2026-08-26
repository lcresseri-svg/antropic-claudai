// Obiettivi.
//
// Era una griglia 2×2 di emoji con un'etichetta: si sceglieva senza sapere
// cosa cambiava. Ora ogni riga dice la CONSEGUENZA della scelta — "attiva il
// Piano", "attiva il tab Investimenti" — perché è quella l'informazione che
// serve per decidere, non l'icona.
import { OnboardingGoal } from '../onboardingTypes';

interface Props {
  selected: OnboardingGoal[];
  onChange: (goals: OnboardingGoal[]) => void;
}

const GOALS: { id: OnboardingGoal; label: string; icon: string; effect: string; tint: string }[] = [
  { id: 'understand_spending', label: 'Capire le spese', icon: '📊',
    effect: 'Categorie e ritmo del mese in home', tint: '#8A9270' },
  { id: 'save_more', label: 'Risparmiare di più', icon: '💰',
    effect: 'Attiva il Piano con un obiettivo mensile', tint: '#E6B95C' },
  { id: 'subscriptions', label: 'Controllare abbonamenti', icon: '🔁',
    effect: 'Riconosce le spese che si ripetono', tint: '#88B0C0' },
  { id: 'budget', label: 'Gestire budget', icon: '📋',
    effect: 'Attiva il Piano con limiti per categoria', tint: '#B5A8C8' },
  { id: 'investments', label: 'Monitorare investimenti', icon: '📈',
    effect: 'Attiva il tab Investimenti', tint: '#D4956A' },
  { id: 'ai_insights', label: 'Avere consigli automatici', icon: '✨',
    effect: 'Prossima mossa in home, ogni giorno', tint: '#E08B8B' },
];

export function GoalsStep({ selected, onChange }: Props) {
  const toggle = (id: OnboardingGoal) => {
    onChange(selected.includes(id) ? selected.filter(g => g !== id) : [...selected, id]);
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h2 className="text-[25px] font-bold text-primary tracking-[-0.03em] leading-tight"
          style={{ textWrap: 'pretty' } as React.CSSProperties}>
          Da dove vuoi partire?
        </h2>
        <p className="text-[13.5px] text-secondary leading-[1.55]">
          Scegline quanti vuoi. Ogni scelta accende una parte dell'app: si cambia quando vuoi dalle Impostazioni.
        </p>
      </div>

      <div className="space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0">
        {GOALS.map(goal => {
          const active = selected.includes(goal.id);
          return (
            <button key={goal.id} type="button" onClick={() => toggle(goal.id)}
              aria-pressed={active}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-colors ${
                active ? 'border-[1.5px] border-gold' : 'border border-divider bg-card hover:bg-card-hover'}`}
              style={active ? { background: 'var(--hero-bg)' } : undefined}>
              <span className="w-8 h-8 rounded-[11px] flex items-center justify-center text-base flex-none"
                style={{ background: `${goal.tint}29` }}>{goal.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-primary truncate">{goal.label}</span>
                <span className="block text-[11.5px] text-secondary truncate">{goal.effect}</span>
              </span>
              <span className={`w-5 h-5 rounded-full flex-none flex items-center justify-center ${
                active ? 'bg-gold' : 'border border-[rgb(var(--c-primary)/0.16)]'}`}>
                {active && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--c-bg))"
                    strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
