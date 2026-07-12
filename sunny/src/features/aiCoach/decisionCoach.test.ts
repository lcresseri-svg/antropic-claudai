import { describe, it, expect } from 'vitest';
import { evaluatePurchase, DecisionCoachInput } from './decisionCoach';

const base: DecisionCoachInput = {
  itemName: 'Bici',
  cost: 800,
  liquidity: 5000,
  reserve: 1000,
  monthlySavings: 400,
  upcomingCommitted30d: 300,
  medianMonthlyExpenses: 1200,
  savingsTarget: 300,
  monthlyCutPotential: 150,
};

describe('evaluatePurchase', () => {
  it('produces the three scenarios with coherent residuals', () => {
    const a = evaluatePurchase(base);
    expect(a.scenarios.map(s => s.kind)).toEqual(['acquisto_immediato', 'riduzione_spese', 'rinvio']);
    const now = a.scenarios[0];
    expect(now.residualLiquidity).toBe(3900); // 5000 − 800 − 300
    expect(now.reserveIntact).toBe(true);
    expect(now.autonomyMonthsAfter).toBeCloseTo(3.25, 2);
    expect(now.risk).toBe('basso');
    expect(a.recommended).toBe('acquisto_immediato');
  });

  it('funding paths report months-to-purchase from the pace', () => {
    const a = evaluatePurchase(base);
    const cut = a.scenarios.find(s => s.kind === 'riduzione_spese')!;
    expect(cut.monthsToPurchase).toBe(Math.ceil(800 / 550)); // 2
    const post = a.scenarios.find(s => s.kind === 'rinvio')!;
    expect(post.monthsToPurchase).toBe(2); // ceil(800/400)
  });

  it('flags high risk when the reserve would be broken', () => {
    const a = evaluatePurchase({ ...base, cost: 4000 });
    const now = a.scenarios[0];
    expect(now.residualLiquidity).toBe(700);
    expect(now.reserveIntact).toBe(false);
    expect(now.risk).toBe('alto');
    expect(a.recommended).not.toBe('acquisto_immediato');
  });

  it('declares missing data instead of guessing', () => {
    const a = evaluatePurchase({ ...base, medianMonthlyExpenses: null, monthlySavings: 0, savingsTarget: 0 });
    expect(a.missingData.length).toBe(3);
    const now = a.scenarios[0];
    expect(now.autonomyMonthsAfter).toBeNull();
    const post = a.scenarios.find(s => s.kind === 'rinvio')!;
    expect(post.monthsToPurchase).toBeNull();
    expect(post.risk).toBe('alto');
  });

  it('is deterministic', () => {
    const a = evaluatePurchase(base);
    const b = evaluatePurchase(base);
    expect(a).toEqual(b);
  });

  it('recommends cutting over postponing when it is at least as fast', () => {
    const a = evaluatePurchase({ ...base, cost: 4000, monthlyCutPotential: 400 });
    expect(a.recommended).toBe('riduzione_spese');
  });
});
