// Chiusura del Wrapped: l'obiettivo di risparmio mensile per l'anno prossimo.
//
// È l'unica schermata del Wrapped che SCRIVE qualcosa, e scrive un campo che
// esiste già: `savingsTarget` in `users/{uid}/meta/budget`, attraverso
// `useBudget` — nessuna collection nuova, nessuna scrittura diretta da qui.
//
// I tre importi proposti partono dalla media davvero risparmiata (calcolata in
// yearWrapped), non da un numero tondo scelto da noi: un obiettivo inventato
// viene disatteso al primo mese e poi ignorato per sempre.
import { useState } from 'react';
import { formatEuroRound } from '../../utils';
import { YearWrapped } from './yearWrapped';

interface Props {
  w: YearWrapped;
  onSave: (monthly: number) => void;
  onSkip: () => void;
  onClose: () => void;
}

export function WrappedGoalScreen({ w, onSave, onSkip, onClose }: Props) {
  const [amount, setAmount] = useState(w.goal.suggested);
  const [saved, setSaved] = useState(false);

  const bump = (delta: number) => setAmount(v => Math.max(0, v + delta));

  const confirm = () => {
    onSave(amount);
    setSaved(true);
  };

  return (
    <div className="wrapped-glow-top min-h-full flex flex-col px-5 pt-5 pb-8">
      <div className="flex items-center justify-between">
        <p className="label-caps text-gold">Obiettivo {w.year + 1}</p>
        <CloseButton onClick={onClose} />
      </div>

      <div className="flex-1 flex flex-col justify-center py-8">
        <h1 className="text-[30px] font-bold text-primary leading-[1.15] tracking-[-0.03em]">
          Quanto vuoi mettere da parte ogni mese?
        </h1>
        <p className="text-[14px] text-secondary leading-relaxed mt-3">
          {w.savedMonthlyAvg > 0
            ? <>Nel {w.year} hai risparmiato {formatEuroRound(w.savedMonthlyAvg)} al mese in media. Partiamo da lì, senza esagerare.</>
            : <>Nel {w.year} non è avanzato niente. Si riparte da un numero piccolo, che si possa davvero rispettare.</>}
        </p>

        <div className="glass-card rounded-[20px] p-5 mt-6 flex items-center justify-between"
          style={{ border: '1px solid rgba(var(--c-gold) / 0.22)' }}>
          <StepButton label="Togli 50 euro" onClick={() => bump(-w.goal.step)} glyph="−" />
          <div className="text-center">
            <p className="balance-num text-[38px] font-bold text-gold tracking-[-0.04em] leading-none">
              {formatEuroRound(amount)}
            </p>
            <p className="text-[11.5px] text-tertiary mt-1.5">al mese</p>
          </div>
          <StepButton label="Aggiungi 50 euro" onClick={() => bump(w.goal.step)} glyph="+" gold />
        </div>

        <div className="flex gap-2 mt-3">
          {w.goal.options.map(v => {
            const on = v === amount;
            return (
              <button key={v} type="button" onClick={() => setAmount(v)}
                className={`flex-1 rounded-xl py-2.5 text-[12.5px] transition-colors ${
                  on ? 'font-semibold text-gold' : 'glass-card text-secondary'}`}
                style={on ? {
                  background: 'rgba(var(--c-gold) / 0.10)',
                  border: '1px solid rgba(var(--c-gold) / 0.22)',
                } : undefined}>
                {formatEuroRound(v)}
              </button>
            );
          })}
        </div>

        <p className="text-[12.5px] text-tertiary leading-relaxed mt-4">
          Fa {formatEuroRound(amount * 12)} nel {w.year + 1}. Lo scriviamo nel tuo Piano come obiettivo di
          risparmio mensile: si cambia quando vuoi.
        </p>
      </div>

      {saved ? (
        <div className="text-center">
          <p className="text-[15px] font-semibold text-gold">Obiettivo impostato ✦</p>
          <button type="button" onClick={onClose}
            className="w-full py-3 mt-3 text-[13px] font-medium text-secondary">
            Torna alla home
          </button>
        </div>
      ) : (
        <>
          <button type="button" onClick={confirm}
            className="cta-gold-fill w-full rounded-2xl py-[13px] text-[14px] font-semibold active:opacity-90 transition-opacity">
            Imposta obiettivo
          </button>
          <button type="button" onClick={onSkip}
            className="w-full py-3 mt-1 text-[13px] font-medium text-secondary">
            Non ora
          </button>
        </>
      )}
    </div>
  );
}

function StepButton({ glyph, label, onClick, gold }: {
  glyph: string; label: string; onClick: () => void; gold?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={`w-10 h-10 rounded-full flex-none flex items-center justify-center text-[20px] font-medium ${
        gold ? 'text-gold' : 'text-primary'}`}
      style={{ background: `rgba(var(--c-${gold ? 'gold' : 'primary'}) / ${gold ? 0.14 : 0.06})` }}>
      {glyph}
    </button>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Chiudi"
      className="text-tertiary p-1 -m-1 active:opacity-60 transition-opacity">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.4" strokeLinecap="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
