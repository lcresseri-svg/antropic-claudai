// "Categorie da tenere d'occhio" — solo quelle a rischio, una card ciascuna.
//
// La lista completa dei budget per categoria diceva la stessa cosa per tutte:
// una barra e una percentuale. Ma le categorie sotto controllo non chiedono
// nulla; quelle a rischio sì. Qui restano in evidenza solo le seconde, con la
// riga di stato scritta a parole ("Con il programmato supera di 689 €"), e
// tutte le altre collassano in una riga sola.
//
// Il criterio di rischio è uno solo, dichiarato in `riskOf`: si è a rischio se
// il budget è già superato, se lo si supererà col solo programmato, o se la
// previsione di fine mese lo supera.

import { CategoryDef } from '../../types';
import { formatCurrency } from '../../utils';

export interface WatchRow {
  cat: CategoryDef;
  /** Speso finora (quota propria). */
  spent: number;
  /** Limite del mese; 0 = nessun limite. */
  planned: number;
  /** Già programmato e non ancora speso. */
  scheduled: number;
  /** Previsione di fine mese del motore forecast. */
  projected: number;
}

type Risk = 'over' | 'scheduled-over' | 'forecast-over' | null;

/** Perché una categoria è a rischio — o null se non lo è. */
export function riskOf(r: WatchRow): Risk {
  if (r.planned <= 0) return null;
  if (r.spent > r.planned) return 'over';
  if (r.spent + r.scheduled > r.planned) return 'scheduled-over';
  if (r.projected > r.planned) return 'forecast-over';
  return null;
}

/** La riga di stato, scritta a parole: dice cosa succede, non una percentuale. */
function statusLine(r: WatchRow, risk: Risk): string {
  switch (risk) {
    case 'over':
      return `Hai superato il limite di ${formatCurrency(r.spent - r.planned)}`;
    case 'scheduled-over':
      return `Con il programmato supera di ${formatCurrency(r.spent + r.scheduled - r.planned)}`;
    case 'forecast-over':
      return `Previsto a fine mese ${formatCurrency(r.projected)}`;
    default:
      return `${formatCurrency(r.planned - r.spent)} ancora disponibili`;
  }
}

interface Props {
  rows: WatchRow[];
  onOpenCategory: (id: string) => void;
  /** Apre l'editor dei limiti su tutte le categorie. */
  onOpenAll: () => void;
}

export function WatchlistCategories({ rows, onOpenCategory, onOpenAll }: Props) {
  const withRisk = rows.map(r => ({ r, risk: riskOf(r) }));
  const atRisk = withRisk.filter(x => x.risk !== null);
  const safe = withRisk.filter(x => x.risk === null);

  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <p className="label-caps text-secondary px-1">
        {atRisk.length > 0 ? "Categorie da tenere d'occhio" : 'Categorie sotto controllo'}
      </p>

      {atRisk.map(({ r, risk }) => (
        <CategoryCard key={r.cat.id} row={r} risk={risk} onClick={() => onOpenCategory(r.cat.id)} />
      ))}

      {atRisk.length === 0 && safe.length > 0 && (
        <CategoryCard key={safe[0].r.cat.id} row={safe[0].r} risk={null}
          onClick={() => onOpenCategory(safe[0].r.cat.id)} />
      )}

      {safe.length > (atRisk.length === 0 ? 1 : 0) && (
        <button type="button" onClick={onOpenAll}
          className="w-full glass-card rounded-[18px] px-4 py-3 flex items-center justify-between gap-3 text-left">
          <span className="text-[13px] text-secondary">
            {(() => {
              const n = safe.length - (atRisk.length === 0 ? 1 : 0);
              return `Altre ${n} categorie, tutte sotto il limite`;
            })()}
          </span>
          <span className="text-[12px] font-semibold text-gold flex-none">Apri ›</span>
        </button>
      )}
    </section>
  );
}

function CategoryCard({ row, risk, onClick }: { row: WatchRow; risk: Risk; onClick: () => void }) {
  const { cat, spent, planned, scheduled } = row;
  const max = Math.max(planned, spent + scheduled, 1);
  const spentPct = Math.min(100, (spent / max) * 100);
  const schedPct = Math.min(100 - spentPct, (scheduled / max) * 100);
  const barColor = risk === 'over' ? 'rgb(var(--c-red))'
    : risk ? 'rgb(var(--c-gold))'
    : cat.color;

  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left glass-card rounded-[18px] shadow-elev-1 p-4 active:scale-[0.99] transition-transform ${
        risk ? 'border border-gold/35' : ''}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-none"
          style={{ backgroundColor: cat.color + '26' }}>{cat.icon}</span>
        <span className="flex-1 min-w-0 truncate text-[14.5px] text-primary">{cat.label}</span>
        <span className="balance-num text-[15px] font-bold text-primary flex-none">
          {formatCurrency(spent)}
          {planned > 0 && <span className="text-[12px] font-medium text-secondary"> / {formatCurrency(planned)}</span>}
        </span>
      </div>

      <p className={`mt-2 text-[12px] ${risk === 'over' ? 'text-red' : risk ? 'text-gold' : 'text-secondary'}`}>
        {statusLine(row, risk)}
      </p>

      <div className="mt-2.5 h-[9px] rounded-full overflow-hidden flex progress-track">
        <div className="h-full bar-grow" style={{ width: `${spentPct}%`, backgroundColor: barColor }} />
        {schedPct > 0 && (
          <div className="h-full bar-grow" style={{
            width: `${schedPct}%`,
            backgroundColor: barColor,
            opacity: 0.45,
            backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.35) 0 2px, transparent 2px 5px)',
          }} />
        )}
      </div>
    </button>
  );
}
