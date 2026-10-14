// "Dove vanno i soldi" — la torta delle uscite del mese con una legenda a
// cinque voci: le quattro categorie più grandi e "Altre N" che raccoglie il
// resto. Sostituisce la CategoryCard sulla home (che elencava fino a sei voci
// senza mai chiudere la coda).

import { useUiVersion } from '../../shared/providers/UiVersionProvider';
import { Donut } from './Donut';
import { formatCurrency } from '../../utils';
import { useSettings } from '../../shared/providers/settings';

interface Props {
  /** Spese del mese per categoria (ownShare, movimenti realizzati). */
  categoryTotals: Record<string, number>;
  onSeeAll: () => void;
  onOpenCategory?: (id:string) => void;
}

/** Voci mostrate in legenda prima di raggruppare il resto in "Altre N". */
const TOP_N = 4;

export function SpendingBreakdownCard({ categoryTotals, onSeeAll, onOpenCategory }: Props) {
  const { getCat } = useSettings();
  const ui3 = useUiVersion() === '3.0';
  const entries = Object.entries(categoryTotals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);
  if (entries.length === 0) return ui3 ? <section className="liquid-spending"><h2>Spese per categoria</h2><p className="liquid-empty">Nessuna spesa questo mese.</p></section> : null;

  // UI2 retains its detailed ring. UI3 groups the tail in both the chart
  // and legend; the complete category list remains available through Tutte.
  const segments = entries.map(([id, value]) => {
    const c = getCat(id);
    return { label: c.label, value, color: c.color };
  });

  const visibleCount = ui3 ? 5 : TOP_N;
  const rest = segments.slice(visibleCount);
  const legend = [
    ...segments.slice(0, visibleCount),
    ...(rest.length > 0
      ? [{
          label: `Altre ${rest.length}`,
          value: rest.reduce((s, x) => s + x.value, 0),
          color: 'rgb(var(--c-tertiary))',
        }]
      : []),
  ];

  if(ui3) {
    const total=entries.reduce((sum,[,value])=>sum+value,0);
    const rows=entries.slice(0,5).map(([id,value])=>({id,value,label:getCat(id).label,icon:getCat(id).icon}));
    const others=entries.slice(5);
    if(others.length)rows.push({id:'',value:others.reduce((sum,[,v])=>sum+v,0),label:`Altre ${others.length}`,icon:'⋯'});
    return <section className="liquid-spending">
      <div className="liquid-section-heading"><h2>Spese per categoria</h2><button onClick={onSeeAll}>Tutte ›</button></div>
      <ul>{rows.map(row=><li key={row.id||'others'}><button className="liquid-spending-row" onClick={()=>row.id&&onOpenCategory?onOpenCategory(row.id):onSeeAll()}>
        <span className="liquid-spending-label"><span aria-hidden="true">{row.icon}</span><span>{row.label}</span><strong className="balance-num">{formatCurrency(row.value)}</strong></span>
        <span className="liquid-spending-meter"><span className="liquid-spending-track" aria-hidden="true"><span style={{width:`${row.value/total*100}%`}}/></span><span>{new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(row.value/total*100)}%</span><span aria-hidden="true">›</span></span>
      </button></li>)}</ul>
    </section>;
  }

  return (
    <section className="glass-card rounded-[22px] shadow-elev-1 p-[18px] animate-rise-in"
      style={{ animationDelay: '0.18s' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="label-caps text-secondary">Dove vanno i soldi</p>
        <button type="button" onClick={onSeeAll} className="text-[12px] font-medium text-gold">
          Tutte ›
        </button>
      </div>
      <div className="liquid-donut-layout flex items-center gap-[18px]">
        <Donut segments={ui3 ? legend : segments} centerLabel="Uscite" size={124} />
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
