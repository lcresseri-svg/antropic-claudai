import { ChartData } from '../../shared/components/ChartData';
import { useUiVersion } from '../../shared/providers/UiVersionProvider';
// Responsive SVG line chart for an account's BALANCE over time.
// Unlike CategoryTrendLineChart the value can be negative (e.g. a credit card),
// so the Y domain always includes zero and a faint baseline is drawn at 0 when
// the range crosses it. Theme-aware: the line uses the gold accent token; grid
// and labels use design tokens. No glow / heavy gradients.

import { useId, useState } from 'react';

interface Point { label: string; value: number; }

interface Props {
  presentation?: 'line' | 'bars';
  lastPeriodLabel?: string;
  onSelectPoint?: (index:number)=>void;
  title?: string; metricLabel?: string; points: Point[];
  formatValue: (v: number) => string;
  color?: string;           // line colour; defaults to the gold accent token
  height?: number;          // px, drawing area height
}

const W = 320;
const PAD_X = 10;
const PAD_TOP = 16;
const PAD_BOTTOM = 10;

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const t = 0.16;
    d += ` C ${p1.x + (p2.x - p0.x) * t} ${p1.y + (p2.y - p0.y) * t}, ${p2.x - (p3.x - p1.x) * t} ${p2.y - (p3.y - p1.y) * t}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AccountBalanceLineChart({ points, formatValue, title='Saldo per conto', metricLabel='Saldo', color = 'var(--accent)', height = 112, presentation='line', lastPeriodLabel, onSelectPoint }: Props) {
  const ui3=useUiVersion()==='3.0';
  const bars=ui3&&presentation==='bars';
  const selectable = bars && !!onSelectPoint;
  const [selected, setSelected] = useState<number | null>(null);
  const activeIndex = Math.min(selected ?? points.length - 1, points.length - 1);
  const path=(pts:{x:number;y:number}[])=>ui3?pts.map((p,i)=>`${i?'L':'M'} ${p.x} ${p.y}`).join(' '):smoothPath(pts);
  const gradId = useId();
  const values = points.map(p => p.value);
  const hasData = points.length >= (bars ? 1 : 2);

  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-center text-secondary text-[11px] px-4" style={{ height }}>
        {ui3?'Appena avrai più movimenti, Sunny potrà mostrarti l’andamento.':"Appena avrai più movimenti, Sunny potrà mostrarti l’andamento del saldo."}
      </div>
    );
  }

  // Domain always includes zero so the baseline is meaningful for negatives.
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => PAD_X + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - PAD_X * 2);
  const y = (v: number) => PAD_TOP + (1 - (v - lo) / span) * plotH;

  const coords = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = path(coords);
  const zeroY = y(0);
  const crossesZero = lo < 0 && hi > 0;

  // Area between the curve and the zero baseline (works above and below zero).
  const area = `${line} L ${coords[coords.length - 1].x} ${zeroY} L ${coords[0].x} ${zeroY} Z`;

  const last = coords[coords.length - 1];
  const minIdx = values.indexOf(Math.min(...values));
  const maxIdx = values.indexOf(Math.max(...values));

  const drawing = (
      <svg aria-hidden={selectable ? true : undefined} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="w-full overflow-visible" style={{ height }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.16 }} />
            <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {!bars&&<path d={area} fill={`url(#${gradId})`} />}
        {bars&&values.map((v,i)=><rect data-chart-bar key={i}
          x={PAD_X+(i+.19)*(W-PAD_X*2)/values.length} y={Math.min(y(v),zeroY)} width={(W-PAD_X*2)/values.length*.62}
          height={Math.abs(y(v)-zeroY)} rx="2" fill={color}><title>{points[i].label}: {formatValue(v)}</title></rect>)}
        {selectable && <line x1={PAD_X+(activeIndex+.5)*(W-PAD_X*2)/values.length} x2={PAD_X+(activeIndex+.5)*(W-PAD_X*2)/values.length}
          y1={PAD_TOP} y2={height-PAD_BOTTOM} stroke="var(--text-2)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}


        {/* Zero baseline — only when the range actually crosses zero. */}
        {crossesZero && (
          <line x1={PAD_X} y1={zeroY} x2={W - PAD_X} y2={zeroY}
            vectorEffect="non-scaling-stroke" strokeDasharray="3 3"
            style={{ stroke: 'var(--border-strong)' }} strokeWidth="1" />
        )}

        {!bars&&<path d={line} fill="none" vectorEffect="non-scaling-stroke"
          style={{ stroke: color }} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Min / max / endpoint markers. */}
        {!bars&&coords.map((c, i) => (i === minIdx || i === maxIdx || i === coords.length - 1) && (
          <circle key={i} cx={c.x} cy={c.y} r={2.6} fill={color} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
  );

  return (
    <div>
      {selectable ? <div role="group" aria-label={`${title}. Seleziona un periodo con le frecce, Home o End; Invio apre i movimenti.`}
        tabIndex={0} className="ui-chart-picker"
        onClick={event=>{
          const box=event.currentTarget.getBoundingClientRect();
          const position=((event.clientX-box.left)/box.width*W-PAD_X)/(W-PAD_X*2);
          setSelected(Math.max(0,Math.min(points.length-1,Math.floor(position*points.length))));
        }}
        onKeyDown={event=>{
          let index=activeIndex;
          if(event.key==='ArrowLeft') index--;
          else if(event.key==='ArrowRight') index++;
          else if(event.key==='Home') index=0;
          else if(event.key==='End') index=points.length-1;
          else if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectPoint?.(activeIndex);return;}
          else return;
          event.preventDefault();setSelected(Math.max(0,Math.min(points.length-1,index)));
        }}>{drawing}</div> : drawing}
      {selectable && <div className="ui-chart-selection">
        <p role="status" aria-live="polite" aria-atomic="true">{points[activeIndex].label}: <strong className="balance-num">{formatValue(values[activeIndex])}</strong></p>
        <button type="button" onClick={()=>onSelectPoint?.(activeIndex)} aria-label={`Apri movimenti del periodo ${points[activeIndex].label}`}>Apri movimenti ›</button>
      </div>}


      <div className="flex justify-between mt-1.5" style={{ paddingLeft: PAD_X, paddingRight: PAD_X }}>
        {points.map((p, i) => ui3 && points.length>7 && i%Math.ceil(points.length/6)!==0 && i!==points.length-1 ? null : (
          <span key={i} className={`ui-chart-tick text-[9px] text-secondary ${points.length > 7 && i % 2 === 1 ? 'hidden sm:inline' : ''}`}>
            {p.label}
          </span>
        ))}
      </div>
      <p className="ui-chart-tick text-[10px] text-secondary/70 text-center mt-1">{metricLabel} {lastPeriodLabel ?? (bars?'nell’ultimo mese':'a fine periodo')}: {formatValue(last ? values[values.length - 1] : 0)}</p>
      <ChartData title={title} columns={['Periodo',metricLabel]} rows={points.map(p=>[p.label,formatValue(p.value)])} scale="Scala ancorata allo zero."/>
    </div>
  );
}
