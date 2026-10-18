import { useState, useEffect } from 'react';
import { useMediaQuery } from '../../shared/hooks/useMediaQuery';
import { sampleLineIndexes } from '../../shared/chartSampling';
import { ChartData } from '../../shared/components/ChartData';
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
  fullDates?: boolean;
  periodLabel?: string;
}

const W = 600;
const PAD_X = 10;
const PAD_TOP = 12;

export function InvestmentTrendChart({ points, controvalore, height: legacyHeight = 120, fullDates = false, periodLabel = '12 mesi' }: Props) {

  const desktop = useMediaQuery('(min-width: 1024px)');
  const [selected, setSelected] = useState<string | null>(null);
  const height = fullDates ? desktop ? 224 : 160 : legacyHeight;
  const selectedIndex = points.findIndex(point => point.key === selected);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : points.length - 1;
  useEffect(() => { if (selected !== null && selectedIndex < 0) setSelected(null); }, [selected, selectedIndex]);

  if (!points.length || (!fullDates && points.length < 2)) return null;

  const values = points.map(p => p.versato);
  // Il dominio segue i dati, non lo zero: con un capitale già accumulato una
  // scala ancorata a zero appiattirebbe dodici mesi in una riga piatta. L'area
  // qui è una forma, non una quantità — il numero sta in legenda.
  const top = Math.max(...values, controvalore ?? -Infinity);
  const lo = Math.min(...values, controvalore ?? Infinity);
  const pad = (top - lo) * 0.15 || Math.max(1, top * 0.05);
  const min = lo - pad;
  const span = top + pad * 0.4 - min || 1;

  const x = (i: number) => PAD_X + (points.length === 1 ? .5 : i / (points.length - 1)) * (W - PAD_X * 2);
  const y = (v: number) => PAD_TOP + (1 - (v - min) / span) * (height - PAD_TOP - 2);

  const indexes = fullDates ? sampleLineIndexes(values) : values.map((_, i) => i);
  const line = indexes.map((i, position) => `${position === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(values[i]).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(points.length - 1).toFixed(1)} ${height} L ${x(0).toFixed(1)} ${height} Z`;
  const lastX = x(points.length - 1);

  const drawing = (
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none" aria-hidden>
        {fullDates && <line x1={x(activeIndex)} x2={x(activeIndex)} y1={PAD_TOP} y2={height} stroke="var(--text-2)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
        <path d={area} fill="rgba(var(--c-gold) / 0.13)" />
        {points.length === 1 && <circle cx={x(0)} cy={y(values[0])} r="3" fill="rgb(var(--c-gold))" />}
        <path d={line} fill="none" stroke="rgb(var(--c-gold))" strokeWidth="2" vectorEffect="non-scaling-stroke"
          strokeLinecap="round" strokeLinejoin="round" />
        {controvalore != null && (
          <line x1={PAD_X} y1={y(controvalore)} x2={W - PAD_X} y2={y(controvalore)}
            stroke={`rgb(var(--c-primary) / ${fullDates ? 0.55 : 0.25})`} strokeWidth="1.5" strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke" />
        )}
      </svg>
  );

  return (
    <div>
      {points.length === 1 && <p className="text-sm text-secondary mb-2">È disponibile un solo mese di storico.</p>}
      {fullDates ? <div role="group" tabIndex={0} className="ui-chart-picker" aria-label="Capitale versato. Frecce, Home e End per consultare i mesi."
        onClick={event=>{
          const box=event.currentTarget.getBoundingClientRect();
          const position=((event.clientX-box.left)/box.width*W-PAD_X)/(W-PAD_X*2);
          setSelected(points[Math.max(0,Math.min(points.length-1,Math.round(position*(points.length-1))))].key);
        }}
        onKeyDown={event=>{
          let index=activeIndex;
          if(event.key==='ArrowLeft')index--;else if(event.key==='ArrowRight')index++;
          else if(event.key==='Home')index=0;else if(event.key==='End')index=points.length-1;else return;
          event.preventDefault();setSelected(points[Math.max(0,Math.min(points.length-1,index))].key);
        }}>{drawing}</div> : drawing}


      {/* Il punto finale sta FUORI dall'svg deformato: con
          preserveAspectRatio="none" un cerchio diventerebbe un'ellisse. */}
      <div className="relative h-0">
        {controvalore != null && (
          <span className="absolute w-2 h-2 rounded-full bg-gold"
            style={{ right: `${(PAD_X / W) * 100}%`, top: `${-(height - y(controvalore))}px`, transform: 'translate(50%, -50%)' }} />
        )}
      </div>

      <div className="flex justify-between mt-1.5 text-[10px] text-tertiary">
        <span>{capitalize(formatMonthShort(points[0].key))}{fullDates && ` ${points[0].key.slice(0,4)}`}</span>
        <span>{capitalize(formatMonthShort(points[points.length - 1].key))}{fullDates && ` ${points[points.length - 1].key.slice(0,4)}`}</span>
      </div>

      <div className="liquid-chart-legend flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-[2px] rounded-full bg-gold" />
          Versato <span className="balance-num text-primary">{formatCurrency(values[values.length - 1])}</span>
        </span>
        {controvalore != null && (
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-[2px] rounded-full" style={{ background: 'repeating-linear-gradient(90deg, rgb(var(--c-primary) / 0.4) 0 3px, transparent 3px 6px)' }} />
            {fullDates ? 'Ultimo valore noto' : 'Controvalore oggi'} <span className="balance-num text-primary">{formatCurrency(controvalore)}</span>
          </span>
        )}
        <span className="ml-auto text-tertiary">{periodLabel}</span>
      </div>
      {fullDates && <>
        <p className="text-sm text-secondary mt-3" role="status" aria-live="polite" aria-atomic="true">{capitalize(formatMonthShort(points[activeIndex].key))} {points[activeIndex].key.slice(0,4)} · versato <strong className="text-primary balance-num">{formatCurrency(values[activeIndex])}</strong></p>
        <p className="ui-chart-tick text-secondary mt-1">Scala adattata ai valori, non ancorata allo zero.</p>
      </>}
      <ChartData title="Capitale investito" columns={['Mese','Versato']} rows={points.map(p=>[p.key,formatCurrency(p.versato)])} scale="Scala adattata ai valori, non ancorata allo zero. Il controvalore è l’ultimo dato noto, non una serie storica di mercato."/>
    </div>
  );
}
