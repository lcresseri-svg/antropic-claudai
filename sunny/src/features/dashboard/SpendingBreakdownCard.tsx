// "Dove vanno i soldi" — la torta delle uscite del mese con una legenda a
// cinque voci: le quattro categorie più grandi e "Altre N" che raccoglie il
// resto. Sostituisce la CategoryCard sulla home (che elencava fino a sei voci
// senza mai chiudere la coda).

import { Donut } from './Donut';
import { formatCurrency } from '../../utils';
import { useSettings } from '../../shared/providers/settings';

interface Props {
  /** Spese del mese per categoria (ownShare, movimenti realizzati). */
  categoryTotals: Record<string, number>;
  onSeeAll: () => void;
}

/** Voci mostrate in legenda prima di raggruppare il resto in "Altre N". */
const TOP_N = 4;

export function SpendingBreakdownCard({ categoryTotals, onSeeAll }: Props) {
  const { getCat } = useSettings();
  const entries = Object.entries(categoryTotals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return null;

  // La torta resta a grana fine (una fetta per categoria): a collassare è solo
  // la legenda, altrimenti la coda sparirebbe anche dal grafico.
  const segments = entries.map(([id, value]) => {
    const c = getCat(id);
    return { label: c.label, value, color: c.color };
  });

  const rest = segments.slice(TOP_N);
  const legend = [
    ...segments.slice(0, TOP_N),
    ...(rest.length > 0
      ? [{
          label: `Altre ${rest.length}`,
          value: rest.reduce((s, x) => s + x.value, 0),
          color: 'rgb(var(--c-tertiary))',
        }]
      : []),
  ];

  return (
    <section className="glass-card rounded-[22px] shadow-elev-1 p-[18px] animate-rise-in"
      style={{ animationDelay: '0.18s' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="label-caps text-secondary">Dove vanno i soldi</p>
        <button type="button" onClick={onSeeAll} className="text-[12px] font-medium text-gold">
          Tutte ›
        </button>
      </div>
      <div className="flex items-center gap-[18px]">
        <Donut segments={segments} centerLabel="Uscite" size={124} />
        <ul className="flex-1 min-w-0 flex flex-col gap-[11px]">
          {legend.map(s => (
            <li key={s.label} className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ backgroundColor: s.color }} />
              <span className="flex-1 min-w-0 truncate text-[13px] text-secondary">{s.label}</span>
              <span className="balance-num text-[13px] font-semibold text-primary flex-none">
                {formatCurrency(s.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
