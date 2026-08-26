import { AffordabilityResult } from './aiCoachTypes';
import { CategoryDef } from '../../types';

interface Props {
  result: AffordabilityResult;
  categories: CategoryDef[];
  onReset: () => void;
  /** Presente quando il Piano è attivo: scrive l'obiettivo e ci porta. */
  onPlanIt?: (monthly: number) => void;
  /** La domanda che ha generato questo risultato, per il riepilogo in cima. */
  question?: { itemName: string; cost: number; deadline?: string };
  /** Riapre il form precompilato invece di ripartire da zero. */
  onEditQuestion?: () => void;
}

function fmt(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function AffordabilityResultCard({ result, categories, onReset, onPlanIt, question, onEditQuestion }: Props) {
  const getCat = (id: string) => categories.find(c => c.id === id);

  // Headline tone: green if it fits this month, gold otherwise.
  const fits = result.fitsThisMonth;
  const accent = fits
    ? { color: 'text-[#6FCF97]', bg: 'bg-[#6FCF97]/10', border: 'border-[#6FCF97]/25' }
    : { color: 'text-gold', bg: 'bg-gold/8', border: 'border-gold/25' };

  // Quanto serve al mese: la scadenza se c'è, altrimenti il ritmo che il
  // modello ha stimato per arrivarci.
  const need = result.requiredMonthly
    ?? (question && result.monthsToAfford != null && result.monthsToAfford > 0
      ? question.cost / result.monthsToAfford
      : null);
  const needLabel = result.requiredMonthly != null
    ? 'ti servono, per la tua scadenza'
    : 'ti servono, al ritmo stimato';
  const enough = need == null || result.monthlySaving >= need;
  const maxCut = Math.max(1, ...result.topCuts.map(c => c.amount));

  const contour: { label: string; value: string; tone?: string }[] = [];
  if (!fits && result.monthsToAfford !== null) {
    contour.push({ label: 'Mesi al ritmo attuale', value: `~${result.monthsToAfford}` });
  }
  if (!fits && result.monthsToAffordWithCuts !== null && result.monthsToAffordWithCuts !== result.monthsToAfford) {
    contour.push({ label: 'Tagliando le spese', value: `~${result.monthsToAffordWithCuts}`, tone: 'text-gold' });
  }
  if (result.upcomingCommitted !== undefined && result.upcomingCommitted > 0) {
    contour.push({ label: 'Già impegnato', value: fmt(result.upcomingCommitted) });
  }
  if (fits) {
    contour.push({ label: 'Ti resterebbe', value: fmt(result.leftoverIfBought), tone: 'text-green' });
  } else if (result.monthOvershoot > 0) {
    contour.push({ label: 'Sforamento se compri ora', value: fmt(result.monthOvershoot), tone: 'text-red' });
  }

  const headline = fits
    ? 'Te lo puoi togliere già questo mese'
    : result.readyBy
    ? `Raggiungibile verso ${result.readyBy}`
    : result.monthlySaving <= 0
    ? 'Servono dei tagli per accumulare'
    : 'Meglio spalmarlo su più mesi';

  return (
    <div className="space-y-3.5 animate-fade-in-fast">
      {question && (
        <div className="glass-card rounded-[16px] px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-secondary truncate">
            <span className="text-primary font-medium">{question.itemName}</span>
            {' · '}{fmt(question.cost)}
            {question.deadline && ` · entro ${question.deadline}`}
          </p>
          {onEditQuestion && (
            <button type="button" onClick={onEditQuestion}
              className="text-[12px] font-semibold text-gold flex-none">Modifica</button>
          )}
        </div>
      )}
      {/* Verdetto: la frase e i DUE numeri che la reggono. Prima era una
          griglia di otto statistiche di pari peso, in cui la risposta alla
          domanda ("ce la faccio?") non si distingueva dal contorno. */}
      <div className="accent-card rounded-[24px] shadow-elev-2 p-5">
        <p className="label-caps text-gold mb-2">Verdetto</p>
        <p className={`text-[21px] font-bold leading-[1.25] ${fits ? 'text-green' : 'text-primary'}`}
          style={{ textWrap: 'pretty' } as React.CSSProperties}>
          {headline}
        </p>

        <div className="mt-4 pt-4 border-t border-divider grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <p className="balance-num text-[30px] leading-none font-bold text-primary">
              {need !== null ? fmt(need) : '—'}
              {need !== null && <span className="text-[15px] font-semibold text-secondary">/mese</span>}
            </p>
            <p className="text-[11.5px] text-secondary mt-1.5 leading-snug">{needLabel}</p>
          </div>
          <div className="min-w-0">
            <p className={`balance-num text-[30px] leading-none font-bold ${enough ? 'text-green' : 'text-red'}`}>
              {fmt(result.monthlySaving)}
            </p>
            <p className="text-[11.5px] text-secondary mt-1.5 leading-snug">
              {enough ? 'oggi accantoni: margine sufficiente' : 'oggi accantoni: non basta'}
            </p>
          </div>
        </div>
      </div>

      {/* La narrativa del modello, con sotto i soli tre numeri di contorno */}
      <div className="glass-card rounded-[20px] p-5">
        <p className="text-[14px] text-primary leading-[1.6] whitespace-pre-line">{result.advice}</p>
        {contour.length > 0 && (
          <div className="mt-4 pt-4 border-t border-divider grid grid-cols-3 gap-3">
            {contour.map(c => (
              <div key={c.label} className="min-w-0">
                <p className={`text-[16px] font-semibold balance-num ${c.tone ?? 'text-primary'}`}>{c.value}</p>
                <p className="text-[11px] text-tertiary mt-0.5 leading-snug">{c.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dove liberare margine: le barre dicono quale categoria pesa davvero,
          una colonna di importi no. */}
      {!fits && result.topCuts.length > 0 && (
        <div className="glass-card rounded-[20px] px-4 py-4">
          <p className="label-caps text-secondary mb-3">Dove puoi liberare margine</p>
          <div className="space-y-3">
            {result.topCuts.map((cut, i) => {
              const cat = getCat(cut.categoryId);
              return (
                <div key={cut.categoryId}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13.5px] text-primary truncate">
                      {cat ? `${cat.icon} ${cat.label}` : cut.label}
                    </span>
                    <span className="text-[13px] font-semibold text-primary balance-num flex-none">
                      {fmt(cut.amount)}<span className="text-secondary font-normal">/mese</span>
                    </span>
                  </div>
                  <span className="block h-[5px] rounded-full mt-1.5 origin-left animate-grow-bar"
                    style={{
                      width: `${maxCut > 0 ? (cut.amount / maxCut) * 100 : 0}%`,
                      background: cat?.color ?? 'rgb(var(--c-gold))',
                      animationDelay: `${i * 0.08}s`,
                    }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onReset}
          className="flex-1 py-3 rounded-2xl glass-card text-[13.5px] font-medium text-secondary hover:text-primary transition-colors">
          Nuova analisi
        </button>
        {onPlanIt && need !== null && need > 0 && (
          <button onClick={() => onPlanIt(Math.round(need))}
            className="flex-1 py-3 rounded-2xl bg-primary text-bg text-[13.5px] font-semibold active:scale-[0.98] transition-transform">
            Metti {fmt(need)}/mese nel Piano
          </button>
        )}
      </div>
    </div>
  );
}
