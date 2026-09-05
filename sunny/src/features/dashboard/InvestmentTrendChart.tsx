import { useId, useState } from 'react';
import { capitalize, formatCurrency, formatCompact, formatMonthLong, formatMonthShort } from '../../utils';
import { InvestmentTrendPoint, investmentAxisMax, summarizeInvestmentPeriod } from './investmentTrend';

interface Props { points: InvestmentTrendPoint[]; currentMonth: string }
const W = 600, H = 200, TOP = 10, BOTTOM = 190;

export function InvestmentTrendChart({ points, currentMonth }: Props) {
  const [period, setPeriod] = useState(12);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const id = useId();
  const visible = points.slice(-period);
  if (!visible.length) return <p className="text-sm text-secondary py-6">Nessun dato disponibile.</p>;
  const selectedIndex = visible.findIndex(p => p.key === selectedKey);
  const activeIndex = selectedIndex < 0 ? visible.length - 1 : selectedIndex;
  const active = visible[activeIndex];
  const summary = summarizeInvestmentPeriod(visible);
  const max = investmentAxisMax(visible);
  const x = (i: number) => visible.length === 1 ? W / 2 : i / (visible.length - 1) * W;
  const y = (value: number) => BOTTOM - value / max * (BOTTOM - TOP);
  const line = visible.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.versato)}`).join(' ');
  const area = `${line} L ${x(visible.length - 1)} ${BOTTOM} L ${x(0)} ${BOTTOM} Z`;
  const tickIndices = [...new Set([0, Math.round((visible.length - 1) / 3), Math.round(2 * (visible.length - 1) / 3), visible.length - 1])];
  const monthLabel = (key: string) => `${capitalize(formatMonthShort(key))} ${key.slice(2, 4)}`;
  const selectAt = (clientX: number, element: HTMLDivElement) => {
    const rect = element.getBoundingClientRect();
    const i = Math.max(0, Math.min(visible.length - 1, Math.round((clientX - rect.left) / rect.width * (visible.length - 1))));
    setSelectedKey(visible[i].key);
  };

  return (
    <div className="border-t border-divider pt-5 mt-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-primary">Andamento del capitale versato</h3>
          <p className="text-xs text-secondary mt-1">Versamenti meno capitale rimborsato, non rendimento.</p>
        </div>
        <div className="flex rounded-xl border border-divider p-1 gap-1" role="group" aria-label="Periodo del grafico">
          {[3, 6, 12].map(n => (
            <button key={n} type="button" aria-pressed={period === n}
              onClick={() => { setPeriod(n); setSelectedKey(null); }}
              className={`min-h-9 px-3 rounded-lg text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${period === n ? 'bg-gold/15 text-gold' : 'text-secondary hover:bg-card-hover'}`}>
              {n} mesi
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xl font-bold balance-num text-primary">{formatCurrency(summary.net, { sign: true })}</span>
        <span className="text-xs text-secondary">apporti netti · {monthLabel(visible[0].key)} – {monthLabel(visible[visible.length - 1].key)}</span>
      </div>
      <p className="text-[11px] text-secondary mt-1">Versamenti {formatCurrency(summary.deposits)} · Capitale rimborsato {formatCurrency(summary.returned)}</p>

      <div className="mt-5 flex gap-3">
        <div className="relative w-14 shrink-0 text-[10px] text-secondary balance-num" aria-hidden="true" style={{ height: H }}>
          {[4, 3, 2, 1, 0].map(i => <span key={i} className="absolute right-0 -translate-y-1/2" style={{ top: y(max * i / 4) }}>{formatCompact(max * i / 4)}</span>)}
        </div>
        <div className="min-w-0 flex-1 mx-2">
          <div className="relative cursor-crosshair touch-pan-y rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            style={{ height: H }} role="slider" tabIndex={0}
            aria-label="Mese del grafico: usa le frecce per esplorare" aria-valuemin={1} aria-valuemax={visible.length}
            aria-valuenow={activeIndex + 1} aria-valuetext={`${formatMonthLong(active.key)}: capitale netto ${formatCurrency(active.versato)}`}
            aria-describedby={`${id}-detail`}
            onPointerDown={e => selectAt(e.clientX, e.currentTarget)}
            onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons === 1) selectAt(e.clientX, e.currentTarget); }}
            onKeyDown={e => {
              let next = activeIndex;
              if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next--;
              else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next++;
              else if (e.key === 'Home') next = 0;
              else if (e.key === 'End') next = visible.length - 1;
              else return;
              e.preventDefault();
              setSelectedKey(visible[Math.max(0, Math.min(visible.length - 1, next))].key);
            }}>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
              {[0, 1, 2, 3, 4].map(i => <line key={i} x1={0} x2={W} y1={y(max * i / 4)} y2={y(max * i / 4)} stroke="rgb(var(--c-divider-strong))" strokeDasharray={i ? '3 5' : undefined} vectorEffect="non-scaling-stroke" />)}
              <path d={area} fill="rgb(var(--c-gold) / 0.08)" />
              <path d={line} fill="none" stroke="rgb(var(--c-gold))" strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <line x1={x(activeIndex)} x2={x(activeIndex)} y1={TOP} y2={BOTTOM} stroke="rgb(var(--c-gold) / 0.5)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            </svg>
            {visible.map((p, i) => <span key={p.key} className={`absolute rounded-full bg-gold pointer-events-none ${i === activeIndex ? 'w-3 h-3 ring-4 ring-gold/15' : 'w-1.5 h-1.5'}`}
              style={{ left: `${x(i) / W * 100}%`, top: y(p.versato), transform: 'translate(-50%, -50%)' }} />)}
          </div>
          <div className="relative h-7 text-[10px] text-secondary" aria-hidden="true">
            {tickIndices.map(i => <span key={i} className="absolute top-1 whitespace-nowrap" style={{ left: `${x(i) / W * 100}%`, transform: i === 0 ? 'none' : i === visible.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)' }}>{monthLabel(visible[i].key)}</span>)}
          </div>
        </div>
      </div>

      <div id={`${id}-detail`} className="rounded-2xl border border-gold/20 bg-gold/[0.05] px-4 py-3 mt-2" aria-live="polite" aria-atomic="true">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <p className="text-sm font-semibold text-primary">{capitalize(formatMonthLong(active.key))}{active.key === currentMonth && <span className="text-[10px] text-secondary font-normal ml-2">in corso</span>}</p>
          <span className="text-[10px] text-secondary">Tocca il grafico o usa le frecce</span>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          {[
            { label: active.key === currentMonth ? 'Capitale netto ad oggi' : 'Capitale netto a fine mese', value: active.versato, gold: true },
            { label: 'Versamenti del mese', value: active.deposits, gold: false },
            { label: 'Capitale rimborsato', value: active.returned, gold: false },
          ].map(item => <div key={item.label} className="flex sm:block justify-between items-baseline gap-2">
            <dt className="text-[11px] text-secondary">{item.label}</dt>
            <dd className={`text-sm font-semibold balance-num sm:mt-1 ${item.gold ? 'text-gold' : 'text-primary'}`}>{formatCurrency(item.value)}</dd>
          </div>)}
        </dl>
      </div>
      <p className="text-[11px] text-secondary leading-relaxed mt-3">Il grafico include il capitale iniziale e i movimenti effettivi delle posizioni visibili. Il controvalore storico non è disponibile: questa linea non misura guadagni o perdite.</p>
    </div>
  );
}
