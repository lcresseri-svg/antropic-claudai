// Come è fatto il tuo mese — schermata deterministica, nessuna chiamata al
// modello.
//
// È la risposta alla domanda che veniva prima di "posso permettermelo": di
// tutto quello che spendo, quanto è già deciso e quanto posso ancora
// decidere. I numeri e la classificazione vengono da `savingsEngine`, che li
// deduce dai DATI — ogni quanto torna una spesa, in quante transazioni, se
// oscilla — e non dal nome della categoria. Per questo ogni riga porta con sé
// il motivo: "non tagliabile" senza spiegazione è solo un'opinione.
import { SavingsContext, CategoryLoad, CategoryNature, MIN_CUT_SHARE } from './savingsEngine';
import { formatEuroRound } from '../../utils';

interface Props {
  ctx: SavingsContext;
}

const NATURE_LABEL: Record<CategoryNature, string> = {
  fixed: 'Fissa',
  periodic: 'Periodica',
  variable: 'Variabile',
  oneOff: 'Una tantum',
};

const NATURE_STYLE: Record<CategoryNature, string> = {
  fixed: 'bg-[color-mix(in_srgb,var(--accent-blue)_16%,transparent)] text-[var(--accent-blue)]',
  periodic: 'bg-gold/[0.14] text-gold',
  variable: 'bg-green/[0.14] text-green',
  oneOff: 'bg-secondary/10 text-secondary',
};

/** Quanto pesa al mese, con la lettura giusta per la sua natura. */
function weight(c: CategoryLoad): number {
  return c.nature === 'periodic' ? Math.max(c.monthlyAvg, c.monthlyReserve) : c.typicalMonthly;
}

function Bar({ ctx }: Props) {
  const b = ctx.breakdown;
  const total = b.fixedMonthly + b.periodicMonthly + b.variableMonthly;
  if (total <= 0) return null;
  const seg = (v: number, color: string, label: string) => (
    v > 0 ? <span key={label} title={label} className={color} style={{ width: `${(v / total) * 100}%` }} /> : null
  );
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-elevated mt-3" aria-hidden="true">
      {seg(b.fixedMonthly, 'bg-[var(--accent-blue)]', 'fisse')}
      {seg(b.periodicMonthly, 'bg-gold', 'periodiche')}
      {seg(b.variableMonthly, 'bg-green', 'variabili')}
    </div>
  );
}

export function SpendingProfileCard({ ctx }: Props) {
  const b = ctx.breakdown;
  const shown = ctx.categories.filter(c => weight(c) >= 1).slice(0, 8);
  if (shown.length === 0) return null;

  const legend: { label: string; value: number; dot: string; hint: string }[] = [
    { label: 'Fisse', value: b.fixedMonthly, dot: 'bg-[var(--accent-blue)]', hint: 'tornano ogni mese, non si tagliano' },
    { label: 'Da accantonare', value: b.periodicMonthly, dot: 'bg-gold', hint: 'tornano a intervalli più lunghi' },
    { label: 'Variabili', value: b.variableMonthly, dot: 'bg-green', hint: 'qui si può decidere' },
  ];

  return (
    <section className="glass-card rounded-[20px] px-5 py-5" aria-label="Come è fatto il tuo mese">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-primary">Come è fatto il tuo mese</h2>
        <span className="text-[11px] text-tertiary flex-none">
          {ctx.monthsOfHistory} {ctx.monthsOfHistory === 1 ? 'mese' : 'mesi'} di storico
        </span>
      </div>
      <p className="text-[12.5px] text-secondary leading-relaxed mt-1">
        Calcolato dai tuoi movimenti: quanto è già deciso e quanto puoi ancora decidere.
      </p>

      <Bar ctx={ctx} />

      <ul className="mt-3 space-y-1.5">
        {legend.filter(l => l.value > 0).map(l => (
          <li key={l.label} className="flex items-baseline gap-2 text-[12.5px]">
            <span className={`w-2 h-2 rounded-full flex-none translate-y-[1px] ${l.dot}`} />
            <span className="text-primary font-medium">{l.label}</span>
            <span className="text-tertiary text-[11.5px] truncate">{l.hint}</span>
            <span className="ml-auto balance-num text-primary flex-none">{formatEuroRound(l.value)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3.5 pt-3.5 border-t border-divider">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-primary font-medium">Margine su cui puoi agire</p>
          <p className="balance-num text-[15px] text-gold flex-none">{formatEuroRound(b.reducibleMonthly)}<span className="text-[11.5px] text-tertiary"> /mese</span></p>
        </div>
        <p className="text-[11.5px] text-tertiary leading-relaxed mt-0.5">
          È il massimo realistico: per ogni categoria variabile, quanto hai già speso in meno
          almeno una volta, entro il 30%. Non una promessa, un mese che hai davvero fatto.
        </p>
      </div>

      <ul className="mt-3.5 space-y-2">
        {shown.map(c => (
          <li key={c.id} className="flex items-start gap-2.5">
            <span className="w-[26px] h-[26px] rounded-[9px] flex items-center justify-center text-[13px] flex-none"
              style={{ background: `${c.color}22` }}>{c.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="text-[13px] text-primary truncate">{c.label}</p>
                <span className={`text-[9.5px] font-semibold uppercase tracking-[0.06em] px-1.5 py-[1px] rounded-md flex-none ${NATURE_STYLE[c.nature]}`}>
                  {NATURE_LABEL[c.nature]}
                </span>
                <span className="ml-auto balance-num text-[13px] text-primary flex-none">
                  {formatEuroRound(weight(c))}
                </span>
              </div>
              <p className="text-[11.5px] text-tertiary leading-snug mt-0.5">
                {c.cuttable > 0
                  // Il mese più basso si cita solo se è DAVVERO più basso: su
                  // una spesa stabile "il tuo mese più basso è stato 450 €"
                  // accanto a un tipico di 450 € non dice niente.
                  ? (c.provenReduction > 0
                    ? `Fino a ${formatEuroRound(c.cuttable)} in meno: un mese da ${formatEuroRound(c.lowestMonth)} l'hai già fatto.`
                    : `Fino a ${formatEuroRound(c.cuttable)} in meno: spesa stabile, è un ritocco del ${Math.round(MIN_CUT_SHARE * 100)}%.`)
                  : c.fixedReason || 'Troppo piccola per farci un piano.'}
                {c.trend === 'up' && c.nature === 'variable' && ` In crescita del ${Math.round(c.trendPct * 100)}%.`}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {ctx.runwayMonths !== null && (
        <p className="text-[11.5px] text-tertiary leading-relaxed mt-3.5 pt-3.5 border-t border-divider">
          La liquidità libera ti copre <span className="text-secondary">
            {ctx.runwayMonths.toLocaleString('it-IT')} {ctx.runwayMonths === 1 ? 'mese' : 'mesi'}</span> di spese
          {ctx.periodicAdjustment > 0 && `, e il ritmo di risparmio è già al netto di ${formatEuroRound(ctx.periodicAdjustment)} al mese messi da parte per le spese periodiche`}.
        </p>
      )}
    </section>
  );
}
