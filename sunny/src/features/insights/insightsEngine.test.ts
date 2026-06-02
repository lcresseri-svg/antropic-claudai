import { describe, it, expect } from 'vitest';
import { history, projectExpenses, buildInsights, monthKey } from './insightsEngine';
import { Transaction } from '../../types';

const NOW = new Date('2026-06-15T12:00:00Z'); // mid-month
const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2026-06-01', description: '', amount: 0,
  type: 'expense', category: 'spesa', account: 'conto_corrente', ...over,
});

const cat = (id: string) => ({ icon: '•', label: id });

describe('history', () => {
  it('averages over months that actually have data, not the full window', () => {
    const m1 = monthKey(1, NOW); // 2026-05
    const txs = [
      tx({ type: 'income', amount: 2000, date: `${m1}-10` }),
      tx({ type: 'income', amount: 1000, date: `${m1}-20` }),
    ];
    const h = history(txs, 3, NOW);
    expect(h.months).toBe(1);
    expect(h.avgIncome).toBe(3000); // 3000 / 1 active month, not /3
  });

  it('excludes the current (partial) month from the average', () => {
    const txs = [tx({ type: 'income', amount: 5000, date: '2026-06-05' })];
    expect(history(txs, 3, NOW).avgIncome).toBe(0);
  });

  it('averages income across two active months', () => {
    const txs = [
      tx({ type: 'income', amount: 2000, date: `${monthKey(1, NOW)}-10` }),
      tx({ type: 'income', amount: 2400, date: `${monthKey(2, NOW)}-10` }),
    ];
    expect(history(txs, 3, NOW).avgIncome).toBe(2200);
  });
});

describe('projectExpenses', () => {
  it('scales the run rate to a full month', () => {
    // mid-June: 15/30 elapsed -> ~0.5 progress -> doubles
    expect(projectExpenses(500, NOW)).toBeGreaterThan(900);
    expect(projectExpenses(500, NOW)).toBeLessThan(1100);
  });
});

describe('buildInsights', () => {
  it('returns a forecast and a savings insight when there is income and expenses', () => {
    const txs = [
      tx({ type: 'income', amount: 2000, date: '2026-06-02' }),
      tx({ type: 'expense', amount: 300, date: '2026-06-05' }),
    ];
    const res = buildInsights({
      transactions: txs, monthlyIncome: 2000, monthlyExpenses: 300, monthlyInvestments: 0,
      getCat: cat, now: NOW,
    });
    expect(res.some(i => i.icon === '🔮')).toBe(true);
    expect(res.some(i => i.icon === '✨')).toBe(true);
  });

  it('surfaces an empty-state insight when there is no data', () => {
    const res = buildInsights({
      transactions: [], monthlyIncome: 0, monthlyExpenses: 0, monthlyInvestments: 0,
      getCat: cat, now: NOW,
    });
    expect(res).toHaveLength(1);
    expect(res[0].title).toMatch(/Nessun insight/);
  });
});
