// Hero del Piano: "Resta nel budget".
//
// La domanda del Piano non è "quanto ho pianificato?" ma "quanto posso ancora
// spendere prima di sforare?". Quindi il numero grande è il residuo, l'anello
// dice quanta parte del budget è già andata, e sotto una riga sola avvisa se
// il PROGRAMMATO — quello che uscirà comunque entro fine mese — basta da solo
// a mandare fuori strada il piano.
//
// Il badge di stato del mese non è più una pill accanto al titolo: è diventato
// l'azione "Conferma il piano" qui dentro, dove serve.

import { formatCurrency } from '../../utils';

interface Props {
  /** Somma dei limiti di spesa del mese. */
  planned: number;
  /** Speso finora (quota propria, movimenti realizzati). */
  spent: number;
  /** Già programmato entro fine mese e non ancora speso. */
  scheduled: number;
  /** Ultimo giorno del mese, per la riga del programmato ("entro il 31"). */
  lastDay: number;
  /** Nascosta quando il mese è già confermato. */
  onConfirm?: () => void;
  onEditLimits: () => void;
}

const RING_R = 82;
const RING_C = 2 * Math.PI * RING_R;

export function BudgetHero({ planned, spent, scheduled, lastDay, onConfirm, onEditLimits }: Props) {
  const left = planned - spent;
  const ratio = planned > 0 ? Math.min(1, Math.max(0, spent / planned)) : 0;
  const pct = Math.round(ratio * 100);
  // Lo sforamento che conta è quello a cui si arriva SENZA fare altro: speso +
  // già programmato. È l'unico numero che l'utente può ancora decidere di
  // evitare.
  const overshoot = spent + scheduled - planned;

  return (
    <section className="hero-card rounded-[26px] shadow-elev-2 p-[22px] animate-rise-in">
      <div className="flex items-center gap-[18px]">
        <div className="flex-1 min-w-0">
          <p className="label-caps text-secondary mb-2">Resta nel budget</p>
          <p className={`balance-num text-[38px] leading-none font-bold ${left >= 0 ? 'text-primary' : 'text-red'}`}>
            {formatCurrency(left)}
          </p>
          <p className="mt-2.5 text-[12px] text-secondary leading-relaxed">
            {planned > 0
              ? <>Hai speso {formatCurrency(spent)} sui {formatCurrency(planned)} che ti sei dato.</>
              : <>Nessun limite impostato per questo mese.</>}
          </p>
        </div>

        {planned > 0 && (
          <div className="relative flex-none w-[104px] h-[104px]">
            <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden>
              <circle r={RING_R} cx="100" cy="100" fill="none" strokeWidth="14" stroke="var(--progress-track)" />
              <circle r={RING_R} cx="100" cy="100" fill="none" strokeWidth="14" strokeLinecap="round"
                stroke={left >= 0 ? 'rgb(var(--c-gold))' : 'rgb(var(--c-red))'}
                transform="rotate(-90 100 100)" className="ring-draw"
                style={{
                  '--ring-len': `${RING_C.toFixed(2)}`,
                  '--ring-to': `${(RING_C * (1 - ratio)).toFixed(2)}`,
                } as React.CSSProperties} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="balance-num text-[19px] font-bold text-primary">{pct}%</span>
              <span className="text-[9.5px] text-secondary">speso</span>
            </div>
          </div>
        )}
      </div>

      {scheduled > 0 && (
        <div className="mt-[18px] pt-4 border-t border-divider flex items-start gap-2.5">
          <span className="mt-0.5 w-3 h-3 rounded-[3px] flex-none border border-dashed border-gold/60"
            style={{ background: 'repeating-linear-gradient(45deg, rgba(var(--c-gold) / 0.5) 0 2px, transparent 2px 5px)' }} />
          <p className="text-[12px] text-secondary leading-relaxed">
            {formatCurrency(scheduled)} già programmati entro il {lastDay}:{' '}
            {overshoot > 0
              ? <span className="text-gold font-semibold">sforerai di {formatCurrency(overshoot)}</span>
              : <span className="text-primary font-semibold">resti dentro di {formatCurrency(-overshoot)}</span>}.
          </p>
        </div>
      )}

      <div className="flex gap-2.5 mt-[18px]">
        {onConfirm && (
          <button type="button" onClick={onConfirm}
            className="flex-1 rounded-2xl cta-gold-fill py-3 text-[13.5px] font-semibold active:scale-[0.98] transition-transform">
            Conferma il piano
          </button>
        )}
        <button type="button" onClick={onEditLimits}
          className={`rounded-2xl py-3 text-[13.5px] font-semibold border border-divider-strong text-primary
                      active:scale-[0.98] transition-transform ${onConfirm ? 'px-4' : 'flex-1'}`}>
          Modifica limiti
        </button>
      </div>
    </section>
  );
}
