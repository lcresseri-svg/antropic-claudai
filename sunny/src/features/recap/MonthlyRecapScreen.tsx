import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency } from '../../utils';
import { PageHead } from '../../shared/components/PageHead';
import { buildMonthlyRecap, MonthlyRecap, RecapDelta, RecapKpi } from './monthlyRecap';
import { RecapExportSheet } from './RecapExportSheet';

const KPI_LABEL: Record<RecapKpi['key'], string> = {
  income: 'Entrate', expense: 'Uscite', invest: 'Investito', saved: 'Risparmio',
};

/** Semantic color: better = green, worse = red, flat = secondary. */
const goodClass = (good: -1 | 0 | 1) => good > 0 ? 'text-green' : good < 0 ? 'text-red' : 'text-secondary';

export function MonthlyRecapScreen({ transactions }: { transactions: Transaction[] }) {
  const { ym = '' } = useParams<{ ym: string }>();
  const navigate = useNavigate();
  const { getCat, getAcc } = useSettings();

  const recap = useMemo(
    () => buildMonthlyRecap({ transactions, getCat, getAcc, month: ym }),
    [transactions, getCat, getAcc, ym],
  );

  const saved = recap.kpis.find(k => k.key === 'saved')?.value ?? null;
  // La tabella completa non è più in pagina: apre chi la vuole. In stampa
  // resta sempre aperta (regola `.recap-movements-collapsed` in index.css).
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  if (recap.totals.txCount === 0) {
    return (
      <div className="pb-24">
        <BackBar onBack={() => navigate('/budget')} onExport={() => setExportOpen(true)} canExport={false} />
        <div className="glass-card rounded-2xl p-8 text-center text-secondary text-sm">
          Nessun movimento per {recap.label}.
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 space-y-4 recap-root">
      <BackBar onBack={() => navigate('/budget')} onExport={() => setExportOpen(true)} canExport />
      <RecapExportSheet open={exportOpen} recap={recap} onClose={() => setExportOpen(false)} />

      {/* Header */}
      <header className="recap-card">
        <p className="label-caps text-secondary">Riepilogo mensile</p>
        <h1 className="text-[29px] font-bold text-primary tracking-[-0.03em] mt-1 leading-none">{recap.label}</h1>
        <p className="text-[11.5px] text-tertiary mt-2">
          {recap.isPartial ? 'Mese in corso · dati parziali' : 'Mese chiuso'}
          {' · '}{recap.movements.length} movimenti
        </p>
      </header>

      {/* Verdict — la frase e, sotto, l'unico numero che si ricorda */}
      <div className="accent-card rounded-[22px] p-5 recap-card">
        <p className="text-[18px] leading-[1.35] text-primary font-semibold"
          style={{ textWrap: 'pretty' } as React.CSSProperties}>{recap.verdict}</p>
        {saved != null && (
          <div className="mt-4 pt-4 border-t border-divider">
            <p className={`balance-num text-[34px] leading-none font-bold ${saved >= 0 ? 'text-primary' : 'text-red'}`}>
              {formatCurrency(saved)}
            </p>
            <p className="text-[12px] text-secondary mt-1.5">
              {saved >= 0 ? 'risparmiati' : 'in meno sui conti'}
            </p>
          </div>
        )}
      </div>

      {/* KPI double-delta */}
      <div className="grid grid-cols-2 gap-3 recap-card">
        {recap.kpis.map(k => (
          <div key={k.key} className="glass-card rounded-2xl p-4">
            <p className="label-caps text-secondary">{KPI_LABEL[k.key]}</p>
            <p className="text-[19px] font-bold text-primary balance-num mt-1">{formatCurrency(k.value)}</p>
            <Comparison d={k.vsUsual?.outOfUsual ? k.vsUsual : (k.vsPrev ?? k.vsUsual)}
              vsUsual={!!k.vsUsual?.outOfUsual} />
          </div>
        ))}
      </div>

      {/* Trajectory */}
      <Trajectory recap={recap} />

      {/* What changed */}
      {recap.drivers.length > 0 && (
        <div className="glass-card rounded-2xl p-5 recap-card">
          <p className="label-caps text-secondary mb-3">Cosa è cambiato</p>
          <ul className="space-y-2.5">
            {recap.drivers.map(d => (
              <li key={d.categoryId} className="flex items-center justify-between gap-3">
                <span className="text-[14px] text-primary truncate">{d.label}</span>
                <span className={`text-[13px] font-semibold balance-num flex-shrink-0 ${goodClass(d.good)}`}>
                  {d.delta > 0 ? '+' : '−'}{formatCurrency(Math.abs(d.delta))} <span className="text-secondary font-normal">vs solito</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sunny narrative */}
      {recap.narrative.length > 0 && (
        <div className="glass-card rounded-2xl p-5 recap-card">
          <p className="label-caps text-secondary mb-2 flex items-center gap-1.5"><span className="text-gold">✦</span> Sunny</p>
          <div className="space-y-1.5">
            {recap.narrative.map((s, i) => (
              <p key={i} className="text-[14px] leading-relaxed text-primary/90">{s}</p>
            ))}
          </div>
        </div>
      )}

      {/* Movements */}
      <div className="glass-card rounded-2xl p-5 recap-card recap-movements">
        <button type="button" onClick={() => setMovementsOpen(o => !o)} aria-expanded={movementsOpen}
          className="w-full flex items-center justify-between gap-3 text-left no-print">
          <span className="text-[13.5px] text-primary">
            Tutti i {recap.movements.length} movimenti di {recap.label.toLowerCase()}
          </span>
          <span className="flex items-center gap-1 text-[12px] font-semibold text-gold flex-none">
            {movementsOpen ? 'Chiudi' : 'Apri'}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${movementsOpen ? 'rotate-180' : ''}`}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </button>
        <div className={`overflow-x-auto ${movementsOpen ? 'mt-3' : 'hidden recap-movements-collapsed'}`}>
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr className="text-secondary text-left">
                <th className="py-1.5 pr-3 font-medium">Data</th>
                <th className="py-1.5 pr-3 font-medium">Tipologia</th>
                <th className="py-1.5 pr-3 font-medium">Categoria</th>
                <th className="py-1.5 pr-3 font-medium">Nota</th>
                <th className="py-1.5 pr-3 font-medium text-right">Importo</th>
                <th className="py-1.5 font-medium">Conto</th>
              </tr>
            </thead>
            <tbody>
              {recap.movements.map(m => (
                <tr key={m.id} className="border-t border-divider">
                  <td className="py-1.5 pr-3 text-secondary whitespace-nowrap balance-num">{m.date.slice(8, 10)}/{m.date.slice(5, 7)}</td>
                  <td className="py-1.5 pr-3 text-primary whitespace-nowrap">{m.typeLabel}</td>
                  <td className="py-1.5 pr-3 text-primary">{m.categoryLabel}</td>
                  <td className="py-1.5 pr-3 text-secondary">{m.note}</td>
                  <td className="py-1.5 pr-3 text-right text-primary whitespace-nowrap balance-num">{formatCurrency(m.amount)}</td>
                  <td className="py-1.5 text-secondary whitespace-nowrap">{m.accountLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BackBar({ onBack, onExport, canExport }: { onBack: () => void; onExport: () => void; canExport: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 no-print">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Piano
      </button>
      {canExport && (
        <button onClick={onExport} className="text-[12.5px] font-medium text-gold">
          Esporta
        </button>
      )}
    </div>
  );
}

/** Soglia sotto la quale uno scostamento è rumore e non merita un colore. */
const SIGNIFICANT_PCT = 0.05;

function Comparison({ d, vsUsual }: { d: RecapDelta | null | undefined; vsUsual: boolean }) {
  if (!d) return <p className="text-[11.5px] text-tertiary mt-1.5">—</p>;
  const ref = vsUsual ? 'vs solito' : 'vs mese scorso';
  const significant = d.pct == null || Math.abs(d.pct) >= SIGNIFICANT_PCT;
  if (!significant) {
    return <p className="text-[11.5px] text-secondary mt-1.5">{vsUsual ? 'in linea col solito' : 'come il mese scorso'}</p>;
  }
  return (
    <p className={`text-[11.5px] mt-1.5 balance-num ${goodClass(d.good)}`}>
      {d.abs >= 0 ? '+' : '−'}{formatCurrency(Math.abs(d.abs))} <span className="text-secondary">{ref}</span>
    </p>
  );
}

/** Savings-rate trajectory: bars over recent months, mean refLine, current highlighted. */
function Trajectory({ recap }: { recap: MonthlyRecap }) {
  const { points, mean, currentIndex } = recap.trajectory;
  const W = 600, H = 120, PAD = 14;
  const rates = points.map(p => p.savingsRate);
  const lo = Math.min(0, ...rates, mean);
  const hi = Math.max(0.01, ...rates, mean);
  const span = hi - lo || 1;
  const yOf = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
  const n = points.length;
  const bw = (W - PAD * 2) / n;
  const zeroY = yOf(0);
  const meanY = yOf(mean);

  return (
    <div className="glass-card rounded-2xl p-5 recap-card">
      <div className="flex items-center justify-between mb-3">
        <p className="label-caps text-secondary">Traiettoria · tasso di risparmio</p>
        <span className="text-[11px] text-secondary flex items-center gap-1.5">
          <span className="w-4 inline-block border-t border-dashed" style={{ borderColor: 'var(--accent-gold)' }} /> media {Math.round(mean * 100)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[110px] md:h-[150px] overflow-visible">
        {/* zero baseline */}
        <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--progress-track)' }} strokeWidth="1" />
        {/* bars */}
        {points.map((p, i) => {
          const x = PAD + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const y = p.savingsRate >= 0 ? yOf(p.savingsRate) : zeroY;
          const h = Math.max(1, Math.abs(yOf(p.savingsRate) - zeroY));
          const current = i === currentIndex;
          return (
            <rect key={p.key} x={x} y={y} width={w} height={h} rx="2"
              fill={current ? 'var(--accent-gold)' : 'rgba(240,190,77,0.28)'} />
          );
        })}
        {/* mean refLine */}
        <line x1={PAD} y1={meanY} x2={W - PAD} y2={meanY} vectorEffect="non-scaling-stroke"
          style={{ stroke: 'var(--accent-gold)' }} strokeWidth="1.2" strokeDasharray="4 3" />
      </svg>
      <div className="flex justify-between mt-1.5" style={{ paddingLeft: PAD, paddingRight: PAD }}>
        {points.map((p, i) => (
          <span key={p.key} className={`text-[9px] ${i === currentIndex ? 'text-gold font-semibold' : 'text-tertiary'} ${i % 2 === 1 ? 'hidden sm:inline' : ''}`}>
            {p.key.slice(5, 7)}/{p.key.slice(2, 4)}
          </span>
        ))}
      </div>
    </div>
  );
}
