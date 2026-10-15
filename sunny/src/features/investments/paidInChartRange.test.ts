import { describe, expect, it } from 'vitest';
import { paidInChartRange } from './paidInChartRange';
describe('investment chart range', () => {
  it('keeps different days in the same month and the final daily balance', () => {
    expect(paidInChartRange([
      { date: '2026-10-01', value: 100 }, { date: '2026-10-03', value: 150 },
      { date: '2026-10-03', value: 200 }, { date: '2026-10-10', value: 170 },
    ], 'all', '2026-10-15')).toEqual([
      { date: '2026-10-01', value: 100 }, { date: '2026-10-03', value: 200 },
      { date: '2026-10-10', value: 170 }, { date: '2026-10-15', value: 170 },
    ]);
  });
  it('retains opening capital and withdrawals when narrowing the window', () => {
    const series = [{ date: '2024-01-01', value: 1000 }, { date: '2026-07-05', value: 800 }];
    expect(paidInChartRange(series, '6m', '2026-10-15')).toEqual([
      { date: '2026-05-01', value: 1000 }, { date: '2026-07-05', value: 800 }, { date: '2026-10-15', value: 800 },
    ]);
    expect(paidInChartRange(series, '1y', '2026-10-15')[0]).toEqual({ date: '2025-11-01', value: 1000 });
    expect(paidInChartRange(series, 'all', '2026-10-15')[0]).toEqual(series[0]);
  });
  it('never invents earlier history or includes future capital', () => {
    expect(paidInChartRange([{ date: '2026-10-15', value: 200 }, { date: '2026-11-01', value: 500 }], '1y', '2026-10-15')).toEqual([{ date: '2026-10-15', value: 200 }]);
    expect(paidInChartRange([], 'all', '2026-10-15')).toEqual([]);
  });
});
