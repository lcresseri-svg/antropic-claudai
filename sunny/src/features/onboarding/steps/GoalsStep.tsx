import { OnboardingGoal } from '../onboardingTypes';

interface Props {
  selected: OnboardingGoal[];
  onChange: (goals: OnboardingGoal[]) => void;
  onNext: (goals: OnboardingGoal[]) => void;
}

const GOALS: { id: OnboardingGoal; label: string; icon: string }[] = [
  { id: 'understand_spending', label: 'Capire le spese',        icon: '📊' },
  { id: 'save_more',           label: 'Risparmiare di più',     icon: '💰' },
  { id: 'subscriptions',       label: 'Controllare abbonamenti',icon: '🔁' },
  { id: 'budget',              label: 'Gestire budget',         icon: '📋' },
  { id: 'investments',         label: 'Monitorare investimenti',icon: '📈' },
  { id: 'ai_insights',         label: 'Avere consigli automatici', icon: '✨' },
];

export function GoalsStep({ selected, onChange, onNext }: Props) {
  const toggle = (id: OnboardingGoal) => {
    onChange(
      selected.includes(id)
        ? selected.filter(g => g !== id)
        : [...selected, id],
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-primary tracking-[-0.03em]">Da dove vuoi partire?</h2>
        <p className="text-sm text-secondary">
          Scegli cosa vuoi migliorare. Userò questa scelta per mostrarti insight più utili.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {GOALS.map(goal => {
          const active = selected.includes(goal.id);
          return (
            <button
              key={goal.id}
              onClick={() => toggle(goal.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all active:scale-[0.97] ${
                active
                  ? 'border-gold/50 bg-gold/8'
                  : 'border-divider bg-card hover:bg-card-hover'
              }`}
            >
              <div className="text-xl mb-1.5">{goal.icon}</div>
              <div className={`text-xs font-medium leading-tight ${active ? 'text-primary' : 'text-secondary'}`}>
                {goal.label}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onNext(selected)}
        className="w-full py-4 rounded-2xl bg-gold text-bg font-semibold text-base tracking-[-0.01em] hover:bg-gold/90 transition-colors active:scale-[0.98]"
      >
        Continua
      </button>
    </div>
  );
}
