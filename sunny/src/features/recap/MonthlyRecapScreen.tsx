import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, formatDateFull } from '../../utils';
import { buildMonthlyRecap, MonthlyRecap, RecapDelta, RecapKpi } from './monthlyRecap';

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

  if (recap.totals.txCount === 0) {
    return (
      <div className="pb-24">
        <BackBar onBack={() => navigate('/budget')} onPrint={() => window.print()} canPrint={false} />
        <div className="glass-card rounded-2xl p-8 text-center text-secondary text-sm">
          Nessun movimento per {recap.label}.
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 space-y-4 recap-root">
      <BackBar onBack={() => navigate('/budget')} onPrint={() => window.print()} canPrint />

      {/* Header */}
      <header className="recap-card">
        <p className="label-caps text-secondary">Riepilogo mensile</p>
        <h1 className="text-3xl font-bold text-primary tracking-[-0.03em] mt-1">{recap.label}</h1>
        <p className="text-xs text-secondary mt-1.5">
          Generato il {formatDateFull(recap.generatedAt)}
          {recap.isPartial && <span className="ml-2 text-gold">· mese in corso (dati parziali)</span>}
        </p>
      </header>

      {/* Verdict */}
      <div className="glass-card rounded-2xl p-5 recap-card border border-gold/15">
        <p className="text-[15px] leading-snug text-primary font-medium">{recap.verdict}</p>
      </div>

      {/* KPI double-delta */}
      <div className="grid grid-cols-2 gap-3 recap-card">
        {recap.kpis.map(k => (
          <div key={k.key} className="glass-card rounded-2xl p-4">
            <p className="label-caps text-secondary">{KPI_LABEL[k.key]}</p>
            <p className="text-[19px] font-semibold text-primary balance-num mt-1">{formatCurrency(k.value)}</p>
            <div className="mt-2 space-y-1">
              <DeltaRow label="vs mese prec." d={k.vsPrev} />
              <DeltaRow label="vs il solito" d={k.vsUsual} />
            </div>
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
        <p className="label-caps text-secondary mb-3">Movimenti di {recap.label} · {recap.movements.length}</p>
        <div className="overflow-x-auto">
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

function BackBar({ onBack, onPrint, canPrint }: { onBack: () => void; onPrint: () => void; canPrint: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 no-print">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-secondary hover:text-primary transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Piano
      </button>
      {canPrint && (
        <button onClick={onPrint}
          className="text-[13px] font-medium px-3.5 py-2 rounded-xl bg-gold/15 text-gold hover:bg-gold/25 transition-colors">
          Esporta / Stampa
        </button>
      )}
    </div>
  );
}

function DeltaRow({ label, d }: { label: string; d: RecapDelta | null }) {
  if (!d) return <p className="text-[11px] text-tertiary">{label}: —</p>;
  const sign = d.abs > 0 ? '+' : d.abs < 0 ? '−' : '';
  const pct = d.pct != null ? ` (${d.abs >= 0 ? '+' : '−'}${Math.abs(Math.round(d.pct * 100))}%)` : '';
  return (
    <p className="text-[11px] text-secondary flex items-center gap-1">
      <span className="text-tertiary">{label}:</span>
      <span className={`font-medium balance-num ${goodClass(d.good)}`}>{sign}{formatCurrency(Math.abs(d.abs))}{pct}</span>
      {d.outOfUsual && <span className="text-gold" title="Fuori dal solito">•</span>}
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
