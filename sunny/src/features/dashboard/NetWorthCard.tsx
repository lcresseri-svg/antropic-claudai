// Card "Patrimonio netto" della home: il numero, la variazione degli ultimi
// 3 mesi con la sua sparkline, e le due righe di navigazione verso il dettaglio
// (saldo per conto / investimenti per categoria) — i due blocchi che il
// redesign toglie dal fondo della home.

import { formatCurrency } from '../../utils';

interface NavRow {
  icon: string;
  color: string;
  label: string;
  value: number;
  gold?: boolean;
  onClick: () => void;
}

interface Props {
  netWorth: number;
  /** Serie del patrimonio sugli ultimi 3 mesi (almeno 2 punti per la sparkline). */
  series: number[];
  deltaPct: number | null;
  onOpenHistory: () => void;
  rows: NavRow[];
}

export function NetWorthCard({ netWorth, series, deltaPct, onOpenHistory, rows }: Props) {
  const positive = (deltaPct ?? 0) >= 0;

  return (
    <section className="glass-card rounded-[22px] shadow-elev-1 px-[18px] pt-[18px] pb-2 animate-rise-in"
      style={{ animationDelay: '0.06s' }}>
      <button type="button" onClick={onOpenHistory}
        className="w-full text-left flex items-end gap-3.5 group">
        <div className="flex-1 min-w-0">
          <p className="label-caps text-secondary mb-2 flex items-center gap-1">
            Patrimonio netto
            <Chevron className="text-secondary group-hover:text-gold transition-colors" size={11} />
          </p>
          <p className="balance-num text-[30px] leading-none font-bold text-primary truncate">
            {formatCurrency(netWorth)}
          </p>
          {deltaPct !== null && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`text-[11.5px] font-semibold rounded-full px-2 py-[3px] ${
                positive ? 'text-green bg-green/[0.14]' : 'text-red bg-red/[0.14]'}`}>
                {positive ? '+' : '−'}
                {Math.abs(deltaPct).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%
              </span>
              <span className="text-[11.5px] text-secondary">ultimi 3 mesi</span>
            </div>
          )}
        </div>
        <Sparkline values={series} />
      </button>

      <div className="mt-4 border-t border-divider">
        {rows.map((r, i) => (
          <button key={r.label} type="button" onClick={r.onClick}
            className={`w-full flex items-center gap-2 py-[13px] text-left ${
              i < rows.length - 1 ? 'border-b border-divider' : ''}`}>
            <span className="w-7 h-7 rounded-[10px] flex items-center justify-center text-[13px] flex-none"
              style={{ backgroundColor: `${r.color}1F` }}>{r.icon}</span>
            <span className="flex-1 min-w-0 truncate text-[13px] text-primary">{r.label}</span>
            <span className={`balance-num text-[13px] font-semibold flex-none ${r.gold ? 'text-gold' : 'text-primary'}`}>
              {formatCurrency(r.value)}
            </span>
            <Chevron className="text-tertiary" size={13} />
          </button>
        ))}
      </div>
    </section>
  );
}

/** Area + linea + punto finale. Piatta quando la serie non varia. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 120, H = 56, TOP = 6, BOTTOM = 46;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min;
  const x = (i: number) => 2 + (i / (values.length - 1)) * (W - 4);
  const y = (v: number) => (span === 0 ? (TOP + BOTTOM) / 2 : BOTTOM - ((v - min) / span) * (BOTTOM - TOP));

  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(values.length - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`;

  return (
    // 104px e non 124: né a 390px né nella colonna desktop da 352px il numero
    // da 30px starebbe accanto a una sparkline più larga, e il patrimonio non
    // deve mai troncarsi.
    <svg viewBox={`0 0 ${W} ${H}`} className="w-[104px] h-14 flex-none" aria-hidden>
      <path d={area} fill="rgba(var(--c-gold) / 0.12)" />
      <path d={line} fill="none" stroke="rgb(var(--c-gold))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.8" fill="rgb(var(--c-gold))" />
    </svg>
  );
}

function Chevron({ className, size }: { className?: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`flex-none ${className ?? ''}`}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
