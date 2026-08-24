// Card hero della home: "quanto posso spendere?".
//
// Il numero grande NON è la liquidità, è la liquidità LIBERA: quello che resta
// sui conti una volta messi da parte gli impegni già programmati entro fine
// mese (ricorrenze proiettate + uscite future già registrate) e il deposito di
// sicurezza che l'utente ha deciso di non toccare. L'anello dice che quota
// della liquidità è ancora libera.
//
// Unica card con `shadow-elev-2` della schermata: è la regola del redesign.

import { formatCurrency } from '../../utils';

interface Props {
  /** liquidità − impegni entro fine mese − deposito di sicurezza. */
  freeCash: number;
  liquidity: number;
  /** Somma degli impegni già programmati (0 quando non ce ne sono). */
  committed: number;
  /** Deposito di sicurezza impostato dall'utente; 0 = spento. */
  reserve?: number;
  income: number;
  expenses: number;
  invested: number;
  /** Nasconde la colonna "Investito" quando gli investimenti sono disattivati. */
  showInvested?: boolean;
}

const RING_R = 82;
const RING_C = 2 * Math.PI * RING_R;

/** "9.511,51 €" → { head: "9.511", tail: ",51 €" } — i decimali vanno più piccoli. */
function splitAmount(value: number): { head: string; tail: string } {
  const s = formatCurrency(value);
  const i = s.indexOf(',');
  return i < 0 ? { head: s, tail: '' } : { head: s.slice(0, i), tail: s.slice(i) };
}

export function FreeCashHero(p: Props) {
  const { head, tail } = splitAmount(p.freeCash);
  const reserve = p.reserve ?? 0;
  // "Libera" ha senso solo se qualcosa è stato messo da parte: senza impegni e
  // senza deposito il numero È la liquidità, e chiamarlo altrimenti confonde.
  const isFree = p.committed > 0 || reserve > 0;
  // La frase si compone dai soli pezzi che esistono: "1.980 € sono già
  // programmati", "500 € sono il tuo deposito di sicurezza", o entrambi.
  const setAside = [
    p.committed > 0 && `${formatCurrency(p.committed)} sono già programmati`,
    reserve > 0 && `${formatCurrency(reserve)} sono il tuo deposito di sicurezza`,
  ].filter(Boolean).join(' e ');
  // Quota libera sulla liquidità. Con liquidità ≤ 0 non c'è nulla da
  // rappresentare: l'anello resta vuoto invece di mostrare una percentuale finta.
  const ratio = p.liquidity > 0 ? Math.min(1, Math.max(0, p.freeCash / p.liquidity)) : 0;
  const pct = Math.round(ratio * 100);

  return (
    <section className="hero-card rounded-[26px] shadow-elev-2 p-[22px] md:px-7 md:py-[26px] animate-rise-in">
      <div className="flex items-center gap-[18px] md:gap-7">
        <div className="flex-1 min-w-0">
          <p className="label-caps text-secondary mb-2 md:mb-2.5">
            {isFree ? 'Liquidità libera' : 'Liquidità'}
          </p>
          <p className="balance-num font-bold text-primary text-[40px] leading-none md:text-[56px] md:leading-[0.95]">
            {head}
            <span className="text-[20px] md:text-[26px] font-semibold text-secondary">{tail}</span>
          </p>
          {isFree && (
            <p className="mt-2.5 md:mt-3.5 text-[12px] md:text-[12.5px] text-secondary leading-relaxed">
              Su {formatCurrency(p.liquidity)} di liquidità, {setAside}.
            </p>
          )}
        </div>

        <div className="relative flex-none w-[104px] h-[104px] md:w-[132px] md:h-[132px]">
          <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden>
            <circle r={RING_R} cx="100" cy="100" fill="none" strokeWidth="14"
              stroke="var(--progress-track)" />
            <circle r={RING_R} cx="100" cy="100" fill="none" strokeWidth="14" strokeLinecap="round"
              stroke="rgb(var(--c-gold))" transform="rotate(-90 100 100)" className="ring-draw"
              style={{
                '--ring-len': `${RING_C.toFixed(2)}`,
                '--ring-to': `${(RING_C * (1 - ratio)).toFixed(2)}`,
              } as React.CSSProperties} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="balance-num text-[19px] md:text-[22px] font-bold text-primary">{pct}%</span>
            <span className="text-[9.5px] md:text-[10px] text-secondary">libero</span>
          </div>
        </div>

        {/* Desktop: i tre valori del mese in colonna, oltre un divisore verticale. */}
        <div className="hidden md:block w-px self-stretch bg-divider" />
        <MonthStats {...p} className="hidden md:flex flex-col gap-4 flex-none min-w-[130px]" size="lg" />
      </div>

      {/* Mobile: gli stessi tre valori in riga, sotto un divisore. */}
      <MonthStats {...p} className="md:hidden flex gap-2 mt-[18px] pt-4 border-t border-divider" size="sm" />
    </section>
  );
}

function MonthStats({ income, expenses, invested, showInvested = true, className, size }: {
  income: number;
  expenses: number;
  invested: number;
  showInvested?: boolean;
  className: string;
  size: 'sm' | 'lg';
}) {
  const valueCls = size === 'lg' ? 'text-[18px]' : 'text-[15px]';
  const itemCls = size === 'lg' ? '' : 'flex-1 min-w-0';
  const item = (label: string, value: number, color: string) => (
    <div className={itemCls}>
      <p className={`label-caps text-secondary ${size === 'lg' ? 'mb-1.5' : 'mb-1'}`}>{label}</p>
      <p className={`balance-num font-semibold truncate ${valueCls} ${color}`}>{formatCurrency(value)}</p>
    </div>
  );
  return (
    <div className={className}>
      {item('Entrate', income, 'text-green')}
      {item('Uscite', expenses, 'text-primary')}
      {showInvested && item('Investito', invested, 'text-gold')}
    </div>
  );
}
