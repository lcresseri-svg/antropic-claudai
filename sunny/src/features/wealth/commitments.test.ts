import { describe, it, expect } from 'vitest';
import { Transaction } from '../../types';
import { buildCommitments } from './commitments';

const TODAY = '2026-07-10';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-07-01', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

const fixture: Transaction[] = [
  // Abbonamento mensile (template + un'occorrenza pagata).
  tx({ id: 'netflix', seriesId: 'netflix', date: '2026-08-01', description: 'Netflix', amount: 12,
    recurring: { freq: 'monthly' }, seriesMeta: { kind: 'subscription' } }),
  tx({ date: '2026-07-01', seriesId: 'netflix', description: 'Netflix', amount: 12,
    seriesMeta: { kind: 'subscription' } }),
  // Abbonamento annuale.
  tx({ id: 'prime', seriesId: 'prime', date: '2027-03-01', description: 'Prime', amount: 60,
    recurring: { freq: 'yearly' }, seriesMeta: { kind: 'subscription' } }),
  // Rate: 24 rate da 100, 2 pagate.
  tx({ id: 'tv', seriesId: 'tv', date: '2026-08-05', description: 'TV a rate', amount: 100,
    recurring: { freq: 'monthly', until: '2028-05-05' },
    seriesMeta: { kind: 'installment', installment: { totalAmount: 2400, totalInstallments: 24, firstDate: '2026-06-05' } } }),
  tx({ date: '2026-06-05', seriesId: 'tv', description: 'TV a rate', amount: 100,
    seriesMeta: { kind: 'installment', installment: { totalAmount: 2400, totalInstallments: 24, firstDate: '2026-06-05' } } }),
  tx({ date: '2026-07-05', seriesId: 'tv', description: 'TV a rate', amount: 100,
    seriesMeta: { kind: 'installment', installment: { totalAmount: 2400, totalInstallments: 24, firstDate: '2026-06-05' } } }),
  // Ricorrente semplice (affitto).
  tx({ id: 'rent', seriesId: 'rent', date: '2026-08-01', description: 'Affitto', amount: 700,
    recurring: { freq: 'monthly' } }),
  // Serie CONCLUSA: non deve comparire.
  tx({ id: 'old', seriesId: 'old', date: '2026-07-15', description: 'Vecchia rata', amount: 50,
    recurring: { freq: 'monthly', until: '2026-06-30' } }),
  // Ricorrente di tipo income: esclusa dai costi fissi.
  tx({ id: 'sal', seriesId: 'sal', date: '2026-08-01', description: 'Stipendio', amount: 2000,
    type: 'income', recurring: { freq: 'monthly' } }),
];

describe('buildCommitments', () => {
  const c = buildCommitments(fixture, TODAY);

  it('groups by kind without duplicating series', () => {
    expect(c.subscriptions.map(s => s.description).sort()).toEqual(['Netflix', 'Prime']);
    expect(c.installments.map(s => s.description)).toEqual(['TV a rate']);
    expect(c.recurring.map(s => s.description)).toEqual(['Affitto']);
  });

  it('computes monthly equivalents (yearly → /12) and total fixed cost', () => {
    const prime = c.subscriptions.find(s => s.description === 'Prime')!;
    expect(prime.monthlyEquivalent).toBe(5);
    // 12 + 5 + 100 + 700 = 817
    expect(c.fixedMonthlyCost).toBe(817);
  });

  it('reports installment residuals and expected end', () => {
    const rate = c.installments[0];
    expect(rate.remainingInstallments).toBe(22); // 24 − 2 pagate
    expect(rate.remainingAmount).toBe(2200);
    // 05/08 + 21 mesi = 05/05/2028
    expect(rate.expectedEnd).toBe('2028-05-05');
  });

  it('excludes ended series and income series', () => {
    const all = [...c.subscriptions, ...c.installments, ...c.recurring];
    expect(all.some(s => s.description === 'Vecchia rata')).toBe(false);
    expect(all.some(s => s.description === 'Stipendio')).toBe(false);
  });

  it('lists upcoming deadlines inside 30 days, ascending', () => {
    const c30 = buildCommitments(fixture, '2026-07-20');
    expect(c30.upcoming.map(u => u.description)).toEqual(['Netflix', 'Affitto', 'TV a rate']);
    expect(c30.upcoming[0].date <= c30.upcoming[1].date).toBe(true);
  });
});
