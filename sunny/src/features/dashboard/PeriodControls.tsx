// Controlli di periodo condivisi dalle tre schermate di analisi (Entrate,
// Saldo per conto, Spese per categoria): pill Mese/3M/6M/12M a sinistra e, a
// destra, un navigatore compatto in card.
//
// Erano tre copie della stessa cosa, con tre geometrie leggermente diverse.
// Restano sticky come prima — il contenitore di scroll è `#app-scroll`, quindi
// `sticky top-0` continua a funzionare.

import { PeriodType, PERIOD_OPTS } from './categoryAnalytics';
import { capitalize } from '../../utils';

interface Props {
  period: PeriodType;
  onPeriodChange: (p: PeriodType) => void;
  /** 0 = periodo corrente; cresce andando indietro nel tempo. */
  offset: number;
  onOffsetChange: (o: number) => void;
  /** Nome del periodo mostrato ("agosto 2026", "giu – ago 2026"…). */
  label: string;
}

export function PeriodControls({ period, onPeriodChange, offset, onOffsetChange, label }: Props) {
  // L'anno in corso è implicito: toglierlo libera i ~45px che servivano a far
  // stare pill e navigatore sulla stessa riga a 390px.
  const shown = label.replace(new RegExp(`\\s*${new Date().getFullYear()}$`), '');
  return (
    <div className="sticky top-0 z-10 -mx-4 px-4 md:-mx-8 md:px-8 pt-1 pb-3 bg-bg border-b border-divider mb-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          {PERIOD_OPTS.map(opt => (
            <button key={opt.value}
              onClick={() => { onPeriodChange(opt.value); onOffsetChange(0); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                period === opt.value ? 'bg-gold/10 text-gold' : 'text-secondary hover:text-primary'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 glass-card rounded-xl px-1 py-1 flex-none">
          <Arrow dir="prev" onClick={() => onOffsetChange(offset + 1)} />
          <button type="button" onClick={() => onOffsetChange(0)} disabled={offset === 0}
            aria-label={offset === 0 ? undefined : 'Torna al periodo corrente'}
            className="text-[12px] font-semibold text-primary whitespace-nowrap px-1 disabled:cursor-default">
            {capitalize(shown)}
          </button>
          {/* Avanti oltre il periodo corrente non ha senso: disabilitata. */}
          <Arrow dir="next" disabled={offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - 1))} />
        </div>
      </div>
    </div>
  );
}

function Arrow({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-label={dir === 'prev' ? 'Periodo precedente' : 'Periodo successivo'}
      className="w-[26px] h-[26px] rounded-lg flex items-center justify-center text-secondary hover:text-primary transition-colors disabled:text-tertiary disabled:hover:text-tertiary">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className={dir === 'prev' ? 'rotate-180' : ''}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}
