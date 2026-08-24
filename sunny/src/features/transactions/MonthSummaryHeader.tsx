// Intestazione di mese della lista Movimenti: nome del mese, quanti movimenti,
// il netto, e una barra a segmenti che dice in un colpo d'occhio com'è fatto
// quel mese — entrate, uscite, investito.
//
// I tre segmenti usano la stessa scomposizione del flusso unificato della home
// (`aggregateFlow`), quindi i numeri qui e quelli in cima alla home non possono
// divergere: le previsioni non contano, il TFR resta fuori dalla cassa.

import { Transaction } from '../../types';
import { aggregateFlow } from '../../shared/financialFlow';
import { formatCurrency, formatMonthLong, capitalize } from '../../utils';

interface Props {
  /** `YYYY-MM`. */
  ym: string;
  /** Righe REALIZZATE del mese. Devono essere le stesse su cui la lista ha
   *  calcolato `net`: se qui entrassero anche i previsti, la barra e il netto
   *  racconterebbero due mesi diversi. */
  realized: Transaction[];
  realizedCount: number;
  upcomingCount: number;
  /** Netto del mese (solo righe realizzate) — già calcolato dalla lista. */
  net: number;
}

/** Larghezza minima di un segmento, così una voce piccola resta visibile. */
const MIN_SEGMENT_PCT = 3;

export function MonthSummaryHeader({ ym, realized, realizedCount, upcomingCount, net }: Props) {
  const flow = aggregateFlow(realized);
  const invested = flow.investedFromAccounts + flow.externalContributions + flow.tfrExcluded;

  const segments = [
    { label: 'entrate', value: flow.cashIn, color: 'rgb(var(--c-green))' },
    { label: 'uscite', value: flow.expenses, color: 'rgb(var(--c-red))' },
    { label: 'investiti', value: invested, color: 'rgb(var(--c-gold))' },
  ].filter(s => s.value > 0);

  const total = segments.reduce((s, x) => s + x.value, 0);

  return (
    <div className="px-1 pt-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-primary tracking-[-0.02em]">
            {capitalize(formatMonthLong(ym).replace(/ \d{4}$/, ''))}
          </p>
          <p className="text-[11.5px] text-secondary mt-0.5">
            {realizedCount} {realizedCount === 1 ? 'movimento' : 'movimenti'}
            {upcomingCount > 0 && ` · ${upcomingCount} programmat${upcomingCount === 1 ? 'o' : 'i'}`}
          </p>
        </div>
        <p className={`balance-num text-[18px] font-bold flex-none ${net >= 0 ? 'text-green' : 'text-red'}`}>
          {formatCurrency(net, { sign: true })}
        </p>
      </div>

      {total > 0 && (
        <>
          <div className="flex gap-0.5 mt-3 h-2 rounded-full overflow-hidden">
            {segments.map(s => (
              <div key={s.label} className="h-full first:rounded-l-full last:rounded-r-full bar-grow"
                style={{
                  width: `${Math.max(MIN_SEGMENT_PCT, (s.value / total) * 100)}%`,
                  backgroundColor: s.color,
                }} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1 mt-2 text-[11px] text-secondary">
            {segments.map(s => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="balance-num">{Math.round(s.value).toLocaleString('it-IT')}</span> {s.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
