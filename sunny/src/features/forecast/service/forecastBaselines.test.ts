import { describe, it, expect } from 'vitest';
import { Transaction } from '../../../types';
import { runBaselineBacktest, baselinePredict, monthlyExpenseTotals } from './forecastBaselines';

const NOW = new Date('2026-07-10T12:00:00Z');

const tx = (date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date, description: 'x', amount,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

// 13 mesi di storico con totale noto per mese.
const fixture: Transaction[] = [];
const totals: Record<string, number> = {
  '2025-06': 900, '2025-07': 1000, '2025-08': 950, '2025-09': 1020,
  '2025-10': 980, '2025-11': 1100, '2025-12': 1500, '2026-01': 800,
  '2026-02': 900, '2026-03': 1000, '2026-04': 950, '2026-05': 1050,
  '2026-06': 990,
};
for (const [month, total] of Object.entries(totals)) {
  fixture.push(tx(`${month}-10`, total - 100));
  fixture.push(tx(`${month}-20`, 60, { shared: 0 }));
  fixture.push(tx(`${month}-22`, 60, { shared: 20 })); // own 40
}
fixture.push(tx('2026-07-05', 300)); // mese corrente: escluso dal backtest

describe('monthlyExpenseTotals', () => {
  it('aggregates own share per month', () => {
    const t = monthlyExpenseTotals(fixture, '2026-07-10');
    expect(t.get('2026-06')).toBe(990);
    expect(t.get('2026-07')).toBe(300);
  });
});

describe('baselinePredict', () => {
  const t = monthlyExpenseTotals(fixture, '2026-07-10');
  it('median3 uses the three previous months only', () => {
    // Predice 2026-06 da mar/apr/mag: mediana(1000, 950, 1050) = 1000.
    expect(baselinePredict('median3', '2026-06', t)).toBe(1000);
  });
  it('last_month and same_month_last_year', () => {
    expect(baselinePredict('last_month', '2026-06', t)).toBe(1050);
    expect(baselinePredict('same_month_last_year', '2026-06', t)).toBe(900);
    expect(baselinePredict('same_month_last_year', '2025-08', t)).toBeNull();
  });
});

describe('runBaselineBacktest', () => {
  it('evaluates up to 12 closed months with all four baselines', () => {
    const r = runBaselineBacktest(fixture, { now: NOW });
    expect(r.months).toHaveLength(12); // 13 chiusi → cap a 12
    expect(r.months).not.toContain('2026-07');
    expect(r.baselines.map(b => b.model)).toEqual([
      'Mediana ultimi 3 mesi', 'Media robusta (6 mesi)', 'Ultimo mese', 'Stesso mese anno precedente',
    ]);
    for (const b of r.baselines) {
      if (b.samples > 0) {
        expect(b.mae).not.toBeNull();
        expect(b.mdae).not.toBeNull();
        expect(b.bias).not.toBeNull();
      }
    }
  });

  it('computes engine metrics and interval coverage when estimates provided', () => {
    const t = monthlyExpenseTotals(fixture, '2026-07-10');
    const months = [...t.keys()].filter(k => k < '2026-07').slice(-12);
    const estimates = months.map(month => ({
      month,
      predicted: (t.get(month) ?? 0) + 50,      // sempre +50 → bias 50
      low: (t.get(month) ?? 0) - 100,
      high: (t.get(month) ?? 0) + 100,          // intervallo copre sempre
    }));
    const r = runBaselineBacktest(fixture, { now: NOW, engineEstimates: estimates });
    expect(r.engine).not.toBeNull();
    expect(r.engine!.bias).toBeCloseTo(50, 1);
    expect(r.engine!.mae).toBeCloseTo(50, 1);
    expect(r.engine!.coverage).toBe(1);
    expect(r.engine!.relErrMedian).toBeGreaterThan(0);
  });

  it('handles sparse history gracefully (null metrics, no crash)', () => {
    const sparse = [tx('2026-06-10', 500)];
    const r = runBaselineBacktest(sparse, { now: NOW });
    expect(r.months).toEqual(['2026-06']);
    const sameMonth = r.baselines.find(b => b.model === 'Stesso mese anno precedente')!;
    expect(sameMonth.samples).toBe(0);
    expect(sameMonth.mae).toBeNull();
  });
});
