// Scaffold dell'onboarding.
//
// I pallini dicevano "sei a un certo punto di qualcosa" senza dire di cosa né
// quanto manca. Al loro posto: il NOME del passo, quanti ne restano e una
// barra che si riempie. Il CTA è sticky in fondo su un gradiente, così non
// finisce in mezzo al contenuto quando lo step è lungo.
import { ReactNode } from 'react';
import { ArcLogo } from '../../shared/components/ArcLogo';

/** Nome di ogni passo, nell'ordine in cui si presentano. Vive qui accanto al
 *  layout perché è il layout a doverlo dire — gli step non si conoscono fra
 *  loro. */
export const STEP_META = [
  { key: 'welcome', label: 'Benvenuto' },
  { key: 'goals',   label: 'Obiettivi' },
  { key: 'account', label: 'Conto' },
  { key: 'data',    label: 'Dati' },
  { key: 'savings', label: 'Risparmio' },
  { key: 'insight', label: 'Pronto' },
] as const;

interface Props {
  step: number;
  totalSteps: number;
  onSkip?: () => void;
  /** Il CTA del passo: sta qui perché è sticky sul fondo, non nel contenuto. */
  footer?: ReactNode;
  children: ReactNode;
}

/** Quanto manca, detto in modo che si capisca senza contare. */
function remainingLabel(step: number, total: number): string {
  const left = total - step - 1;
  if (left <= 0) return 'ultimo passo';
  if (left === 1) return 'manca un passo';
  if (step === 0) return '~2 min in tutto';
  if (left === 2) return 'ultimi due passi';
  return `mancano ${left} passi`;
}

export function OnboardingLayout({ step, totalSteps, onSkip, footer, children }: Props) {
  const meta = STEP_META[step];
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: 'rgb(var(--c-bg))' }}>
      <div className="flex items-center justify-between px-6 pt-safe-top pt-6 flex-shrink-0">
        <ArcLogo size={28} />
        {onSkip && (
          <button onClick={onSkip}
            className="text-[13px] text-tertiary hover:text-primary transition-colors py-1 px-2 -mr-2">
            Salta
          </button>
        )}
      </div>

      {/* Avanzamento: dove sei, come si chiama, quanto manca. */}
      <div className="px-6 pt-5 flex-shrink-0 w-full max-w-[520px] mx-auto">
        <div className="flex items-baseline justify-between gap-3">
          <p className="label-caps text-secondary truncate">
            Passo {step + 1} di {totalSteps}{meta && ` · ${meta.label}`}
          </p>
          <p className="text-[11px] text-tertiary flex-none">{remainingLabel(step, totalSteps)}</p>
        </div>
        <div className="mt-2 h-1 rounded-full overflow-hidden progress-track">
          <div className="h-full rounded-full bg-gold origin-left animate-grow-bar"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-6 overflow-y-auto">
        <div className="w-full max-w-sm md:max-w-[520px] animate-fade-in">
          {children}
        </div>
      </div>

      {/* Il CTA non scorre via: resta in fondo su una sfumatura che stacca dal
          contenuto senza tagliarlo di netto. */}
      {footer && (
        <div className="flex-shrink-0 px-6 pb-8 pt-6"
          style={{ background: 'linear-gradient(180deg, transparent, rgb(var(--c-bg)) 40%)' }}>
          <div className="w-full max-w-sm md:max-w-[520px] mx-auto">{footer}</div>
        </div>
      )}
    </div>
  );
}
