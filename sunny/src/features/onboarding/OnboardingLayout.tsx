import { ReactNode } from 'react';
import { ArcLogo } from '../../App';

interface Props {
  step: number;
  totalSteps: number;
  onSkip?: () => void;
  children: ReactNode;
}

export function OnboardingLayout({ step, totalSteps, onSkip, children }: Props) {
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: 'rgb(var(--c-bg))' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-safe-top pt-6 flex-shrink-0">
        <ArcLogo size={28} />
        {onSkip && (
          <button
            onClick={onSkip}
            className="text-sm text-secondary hover:text-primary transition-colors py-1 px-2 -mr-2"
          >
            Salta
          </button>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 justify-center py-5 flex-shrink-0">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width:           i === step ? 24 : 6,
              height:          6,
              backgroundColor: i === step
                ? 'rgb(var(--c-gold))'
                : i < step
                  ? 'rgb(var(--c-gold) / 0.45)'
                  : 'rgb(var(--c-primary) / 0.12)',
            }}
          />
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 overflow-y-auto">
        <div className="w-full max-w-sm animate-fade-in">
          {children}
        </div>
      </div>
    </div>
  );
}
