import './ui31-entry.css';
import { entryStage } from './entryJourney';
import { useUiVersion } from '../../shared/providers/UiVersionProvider';
// Scaffold dell'onboarding.
//
// I pallini dicevano "sei a un certo punto di qualcosa" senza dire di cosa né
// quanto manca. Al loro posto: il NOME del passo, quanti ne restano e una
// barra che si riempie. Il CTA è sticky in fondo su un gradiente, così non
// finisce in mezzo al contenuto quando lo step è lungo.
import { ReactNode, useLayoutEffect, useRef } from 'react';
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
  onBack?: () => void;
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

export function OnboardingLayout({ step, totalSteps, onBack, onSkip, footer, children }: Props) {
  const ui3=useUiVersion()==='3.0';
  const meta = STEP_META[step];
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ui3) return;
    const heading = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('h1, h2') ?? []).find(el => !el.closest('[hidden]'));
    if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [step, ui3]);
  return (
    <div data-liquid-ui={ui3?'true':undefined} className="ui31-onboarding fixed inset-0 flex flex-col overflow-hidden" style={{ background: 'rgb(var(--c-bg))' }}>
      <div className="flex items-center justify-between px-6 pt-safe-top pt-6 flex-shrink-0">
        {onBack?<button type="button" onClick={onBack} className="ui-back" aria-label="Passaggio precedente">‹ Indietro</button>:<ArcLogo size={28} />}
        {onSkip && (
          <button onClick={onSkip}
            className="text-[13px] text-tertiary hover:text-primary transition-colors py-1 px-2 -mr-2">
            Salta configurazione
          </button>
        )}
      </div>

      {/* Avanzamento: dove sei, come si chiama, quanto manca. */}
      {ui3 ? <nav className="ui31-entry-progress" aria-label="Configurazione iniziale">
        <p className="label-caps text-secondary">Sunny · Iniziamo dalle basi</p>
        <ol>{['Origine dei dati', 'Conti e verifica', 'Prima lettura'].map((label,index) => <li key={label} aria-current={entryStage(step) === index ? 'step' : undefined}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>
        <p className="text-sm text-secondary">Un passo alla volta. Piano e obiettivi possono aspettare.</p>
      </nav> : <div className="px-6 pt-5 flex-shrink-0 w-full max-w-[520px] mx-auto">
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
      </div>}

      <div ref={contentRef} className="ui31-entry-content flex-1 flex flex-col items-center justify-center px-6 pt-6 overflow-y-auto">
        <div className="w-full max-w-sm md:max-w-[520px] animate-fade-in">
          {children}
        </div>
      </div>

      {/* Il CTA non scorre via: resta in fondo su una sfumatura che stacca dal
          contenuto senza tagliarlo di netto. */}
      {footer && (
        <div className="ui31-entry-footer flex-shrink-0 px-6 pb-8 pt-6"
          style={{ background: 'linear-gradient(180deg, transparent, rgb(var(--c-bg)) 40%)' }}>
          <div className="w-full max-w-sm md:max-w-[520px] mx-auto">{footer}</div>
        </div>
      )}
    </div>
  );
}
