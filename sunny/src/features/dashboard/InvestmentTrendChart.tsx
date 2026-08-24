// Andamento del capitale investito negli ultimi 12 mesi.
//
// NOTA IMPORTANTE sul perché non ci sono DUE curve. Il design chiedeva
// "controvalore vs versato": il versato lo sappiamo mese per mese (si ricava
// dalle operazioni), il controvalore storico NO — l'app conserva solo il
// valore di OGGI, e le rivalutazioni inserite a mano non lasciano traccia
// datata. Ricostruirlo darebbe una curva che coincide col versato, cioè un
// grafico che mente. Quindi: area piena del versato cumulato, e il
// controvalore di oggi come punto finale con la sua linea di livello
// tratteggiata — lo scarto fra i due È la plusvalenza, e si vede.

import { formatCurrency, formatMonthShort, capitalize } from '../../utils';

export interface InvestmentTrendPoint {
  /** `YYYY-MM`. */
  key: string;
  /** Capitale versato cumulato a fine mese. */
  versato: number;
}

interface Props {
  points: InvestmentTrendPoint[];
  /** Controvalore di oggi; null quando nessuna posizione ne ha uno. */
  controvalore: number | null;
  height?: number;
}

const W = 600;
const PAD_X = 10;
const PAD_TOP = 12;

export function InvestmentTrendChart({ points, controvalore, height = 120 }: Props) {
  if (points.length < 2) return null;

  const values = points.map(p => p.versato);
  // Il dominio segue i dati, non lo zero: con un capitale già accumulato una
  // scala ancorata a zero appiattirebbe dodici mesi in una riga piatta. L'area
  // qui è una forma, non una quantità — il numero sta in legenda.
  const top = Math.max(...values, controvalore ?? -Infinity);
  const lo = Math.min(...values, controvalore ?? Infinity);
  const pad = (top - lo) * 0.15 || Math.max(1, top * 0.05);
  const min = lo - pad;
  const span = top + pad * 0.4 - min || 1;

  const x = (i: number) => PAD_X + (i / (points.length - 1)) * (W - PAD_X * 2);
  const y = (v: number) => PAD_TOP + (1 - (v - min) / span) * (height - PAD_TOP - 2);

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${height} L ${x(0).toFixed(1)} ${height} Z`;
  const lastX = x(points.length - 1);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden>
        <path d={area} fill="rgba(var(--c-gold) / 0.13)" />
        <path d={line} fill="none" stroke="rgb(var(--c-gold))" strokeWidth="2" vectorEffect="non-scaling-stroke"
          strokeLinecap="round" strokeLinejoin="round" />
        {controvalore != null && (
          <line x1={PAD_X} y1={y(controvalore)} x2={W - PAD_X} y2={y(controvalore)}
            stroke="rgb(var(--c-primary) / 0.25)" strokeWidth="1.5" strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {/* Il punto finale sta FUORI dall'svg deformato: con
          preserveAspectRatio="none" un cerchio diventerebbe un'ellisse. */}
      <div className="relative h-0">
        {controvalore != null && (
          <span className="absolute w-2 h-2 rounded-full bg-gold"
            style={{ right: `${(PAD_X / W) * 100}%`, top: `${-(height - y(controvalore))}px`, transform: 'translate(50%, -50%)' }} />
        )}
      </div>

      <div className="flex justify-between mt-1.5 text-[10px] text-tertiary">
        <span>{capitalize(formatMonthShort(points[0].key))}</span>
        <span>{capitalize(formatMonthShort(points[points.length - 1].key))}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-[2px] rounded-full bg-gold" />
          Versato <span className="balance-num text-primary">{formatCurrency(values[values.length - 1])}</span>
        </span>
        {controvalore != null && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-[2px] rounded-full" style={{ background: 'repeating-linear-gradient(90deg, rgb(var(--c-primary) / 0.4) 0 3px, transparent 3px 6px)' }} />
            Controvalore oggi <span className="balance-num text-primary">{formatCurrency(controvalore)}</span>
          </span>
        )}
        <span className="ml-auto text-tertiary">12 mesi</span>
      </div>
    </div>
  );
}
