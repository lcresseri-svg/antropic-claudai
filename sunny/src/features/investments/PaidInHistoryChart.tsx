import { useMemo, useState } from 'react';
import { ChartData } from '../../shared/components/ChartData';
import { formatCurrency } from '../../utils';
import { paidInChartRange, type PaidInPeriod, type PaidInPoint } from './paidInChartRange';

const periods: { value: PaidInPeriod; label: string }[] = [
  { value: '6m', label: '6 mesi' }, { value: '1y', label: '1 anno' }, { value: 'all', label: 'Tutto' },
];
const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function PaidInHistoryChart({ series, today }: { series: PaidInPoint[]; today: string }) {
  const [period, setPeriod] = useState<PaidInPeriod>('all');
  const points = useMemo(() => paidInChartRange(series, period, today), [series, period, today]);
  const first = points[0];
  const last = points[points.length - 1];
  const sourceStart = series.find(p => p.date <= today)?.date;
  const max = Math.max(1, ...points.map(p => p.value));
  const x = (date: string) => 8 + (time(date) - time(first.date)) / (time(last.date) - time(first.date) || 1) * 584;
  const y = (value: number) => 132 - value / max * 116;
  // Capital changes on movement dates; no interpolated market performance.
  const path = points.map((p, i) => i === 0 ? `M ${x(p.date)} ${y(p.value)}` : `H ${x(p.date)} V ${y(p.value)}`).join(' ');

  return <section aria-label="Storico del capitale versato" className="min-w-0">
    <p className="label-caps text-secondary mb-2">Capitale versato nel tempo</p>
    <div role="group" aria-label="Periodo del capitale versato" className="flex flex-wrap gap-2 mb-3">
      {periods.map(opt => <button key={opt.value} type="button" aria-pressed={period === opt.value} onClick={() => setPeriod(opt.value)}
        className={`min-h-[44px] px-3 rounded-xl text-sm font-semibold ${period === opt.value ? 'bg-gold text-bg' : 'bg-elevated text-secondary'}`}>{opt.label}</button>)}
    </div>
    {sourceStart && <p className="text-xs text-secondary mb-2">Storico disponibile dal {dateLabel(sourceStart)}</p>}
    {points.length > 1 ? <>
      <svg viewBox="0 0 600 144" preserveAspectRatio="none" className="w-full" style={{ height: 144 }} role="img" aria-label={`Capitale versato dal ${dateLabel(first.date)} al ${dateLabel(last.date)}`}>
        <path d={`${path} V 132 H 8 Z`} fill="rgba(var(--c-gold) / 0.12)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between gap-3 text-xs text-secondary"><span>{dateLabel(first.date)}</span><span className="text-right">{dateLabel(last.date)}</span></div>
    </> : <p className="text-sm text-secondary py-4">{first ? `È disponibile un solo giorno di storico: ${dateLabel(first.date)}.` : 'Lo storico non è ancora disponibile: manca una data iniziale o un movimento registrato.'}</p>}
    {last && <p className="text-sm text-secondary mt-3">Versato netto: <span className="text-primary font-semibold balance-num">{formatCurrency(last.value)}</span></p>}
    <ChartData title="Capitale versato" columns={['Data', 'Versato netto']} rows={points.map(p => [dateLabel(p.date), formatCurrency(p.value)])} scale="Scala ancorata allo zero. Saldo a fine giornata; il capitale resta invariato tra due movimenti." />
  </section>;
}
