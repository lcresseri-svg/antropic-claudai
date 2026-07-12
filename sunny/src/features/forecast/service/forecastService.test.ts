import { describe, it, expect } from 'vitest';
import { Transaction, CategoryDef } from '../../../types';
import { computeUnifiedForecast, UNIFIED_FORECAST_VERSION } from './forecastService';

const NOW = new Date('2026-07-10T12:00:00Z');

const categories: CategoryDef[] = [
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#fff', kind: 'expense' },
  { id: 'casa', label: 'Casa', icon: '🏠', color: '#fff', kind: 'expense' },
];

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-07-01', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

// Sei mesi di storico ~regolare + mese corrente in corso.
const fixture: Transaction[] = [];
for (let m = 1; m <= 6; m++) {
  const mm = String(m).padStart(2, '0');
  fixture.push(tx({ date: `2026-${mm}-05`, amount: 400, category: 'spesa', description: 'Spesa mensile' }));
  fixture.push(tx({ date: `2026-${mm}-02`, amount: 700, category: 'casa', description: 'Affitto', seriesId: 'rent' }));
}
fixture.push(tx({ id: 'rent', seriesId: 'rent', date: '2026-08-02', description: 'Affitto', amount: 700, category: 'casa', recurring: { freq: 'monthly' } }));
fixture.push(tx({ date: '2026-07-02', amount: 700, category: 'casa', description: 'Affitto', seriesId: 'rent' }));
fixture.push(tx({ date: '2026-07-06', amount: 180, category: 'spesa', description: 'Spesa' }));
// Pianificata futura nel mese corrente.
fixture.push(tx({ date: '2026-07-25', amount: 120, category: 'spesa', description: 'Regalo pianificato' }));

const input = {
  transactions: fixture,
  expenseCategories: categories,
  monthlyIncome: 2000,
  monthlyInvestments: 0,
  now: NOW,
};

describe('computeUnifiedForecast', () => {
  it('v3: breakdown components always sum to the central estimate', () => {
    const u = computeUnifiedForecast('v3', input);
    expect(u.version).toBe(UNIFIED_FORECAST_VERSION);
    expect(u.engine).toBe('v3');
    expect(u.targetMonth).toBe('2026-07');
    const b = u.breakdown;
    const sum = b.recorded + b.scheduled + b.recurring + b.variable + b.exceptional + b.budgetSignal + b.residual;
    expect(sum).toBeCloseTo(u.central, 1);
    // Il registrato include ciò che è già speso questo mese (700 + 180).
    expect(b.recorded).toBeCloseTo(880, 0);
    expect(u.low).toBeLessThanOrEqual(u.central + 0.01);
    expect(u.high).toBeGreaterThanOrEqual(u.central - 0.01);
  });

  it('v3: exposes drivers, confidence and data quality', () => {
    const u = computeUnifiedForecast('v3', input);
    expect(u.drivers.length).toBeGreaterThan(0);
    expect(u.drivers[0].label).toBeTruthy();
    expect(['low', 'medium', 'high']).toContain(u.confidence);
    expect(u.dataQuality.monthsOfHistory).toBe(7);
  });

  it('v4: components map onto the unified breakdown without double counting', () => {
    const u = computeUnifiedForecast('v4', input);
    expect(u.engine).toBe('v4');
    const b = u.breakdown;
    const sum = b.recorded + b.scheduled + b.recurring + b.variable + b.exceptional + b.budgetSignal + b.residual;
    expect(sum).toBeCloseTo(u.central, 1);
    expect(b.recorded).toBeCloseTo(880, 0);
    // V4 non emette intervallo: mai inventato.
    expect(u.low).toBe(u.central);
    expect(u.high).toBe(u.central);
  });

  it('v4: current-month budget is a visible signal, never retroactive', () => {
    const u = computeUnifiedForecast('v4', {
      ...input,
      categoryBudgets: { spesa: 100 }, // budget molto sotto lo speso
      currentMonthBudgetStatus: 'confirmed',
    });
    // Qualunque effetto del budget passa dal componente esplicito.
    expect(typeof u.breakdown.budgetSignal).toBe('number');
    const sum = Object.values(u.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(u.central, 1);
  });

  it('estimates are deterministic for a fixed now', () => {
    const a = computeUnifiedForecast('v3', input);
    const b = computeUnifiedForecast('v3', input);
    expect(a.central).toBe(b.central);
    expect(a.breakdown).toEqual(b.breakdown);
  });
});
