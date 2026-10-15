export type PaidInPeriod = '6m' | '1y' | 'all';
export interface PaidInPoint { date: string; value: number }

/** Real daily history, carrying existing capital into the selected window. */
export function paidInChartRange(series: PaidInPoint[], period: PaidInPeriod, today: string): PaidInPoint[] {
  const daily = new Map<string, number>();
  for (const p of series) if (p.date <= today) daily.set(p.date, p.value);
  const points = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  if (!points.length) return [];
  let start = points[0].date;
  if (period !== 'all') {
    const end = new Date(`${today}T00:00:00Z`);
    const boundary = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - (period === '6m' ? 5 : 11), 1)).toISOString().slice(0, 10);
    if (boundary > start) start = boundary;
  }
  const before = points.filter(p => p.date <= start);
  const balance = before[before.length - 1]?.value;
  const result = points.filter(p => p.date >= start);
  if (balance != null && result[0]?.date !== start) result.unshift({ date: start, value: balance });
  const last = result[result.length - 1];
  if (last && last.date < today) result.push({ date: today, value: last.value });
  return result;
}
