import { describe, it, expect } from 'vitest';
import { medianMonthlyFlowV4, forecastFlowV4 } from './forecastFlowsV4';
import { Transaction } from '../../../types';

const NOW = new Date(2026, 5, 15); // 15 June 2026

function tx(date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date, description: 'x', amount,
    type: 'income', category: 'stip', account: 'cc', ...extra,
  };
}

describe('medianMonthlyFlowV4', () => {
  it('medians the net monthly flow over complete months before now', () => {
    const txs = [
      tx('2026-03-01', 2000), tx('2026-04-01', 2000), tx('2026-05-01', 2200),
      tx('2026-06-01', 999), // current month → excluded
    ];
    expect(medianMonthlyFlowV4(txs, 'income', NOW)).toBe(2000);
  });

  it('nets investment withdrawals (direction out) against deposits', () => {
    const txs = [
      tx('2026-05-05', 500, { type: 'investment', category: 'etf' }),
      tx('2026-05-20', 200, { type: 'investment', category: 'etf', direction: 'out' }),
    ];
    expect(medianMonthlyFlowV4(txs, 'investment', NOW, 3)).toBe(300); // 500 − 200
  });

  it('returns 0 with no prior-month history', () => {
    expect(medianMonthlyFlowV4([tx('2026-06-01', 1000)], 'income', NOW)).toBe(0);
  });
});

describe('forecastFlowV4', () => {
  it('uses max(committed, historical median)', () => {
    // committed = 1000 + 500 = 1500 < avg 2000 → 2000
    expect(forecastFlowV4({ transactions: [], type: 'income', realizedThisMonth: 1000, upcoming: 500, avg: 2000, now: NOW })).toBe(2000);
    // committed = 2000 + 500 = 2500 > avg 2000 → 2500
    expect(forecastFlowV4({ transactions: [], type: 'income', realizedThisMonth: 2000, upcoming: 500, avg: 2000, now: NOW })).toBe(2500);
  });

  it('ignores negative upcoming and rounds', () => {
    expect(forecastFlowV4({ transactions: [], type: 'income', realizedThisMonth: 1000.4, upcoming: -50, avg: 0, now: NOW })).toBe(1000);
  });

  it('derives the historical median when avg is omitted', () => {
    const txs = [tx('2026-04-01', 1800), tx('2026-05-01', 1800)];
    // realized 0, upcoming 0 → falls back to the median 1800
    expect(forecastFlowV4({ transactions: txs, type: 'income', realizedThisMonth: 0, now: NOW })).toBe(1800);
  });
});
