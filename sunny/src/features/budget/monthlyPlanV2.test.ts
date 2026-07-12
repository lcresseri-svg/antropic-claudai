import { describe, it, expect } from 'vitest';
import { Transaction } from '../../types';
import {
  buildPlanFromRecurring, copyPlanFromPrevious, confirmPlan, editPlan,
  comparePlan, prevPlanMonth, MONTHLY_PLAN_VERSION, MonthlyPlanV2,
} from './monthlyPlanV2';

const TODAY = '2026-07-10';
const NOW = 1_800_000_000_000;

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-07-01', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

const fixture: Transaction[] = [
  // Entrata ricorrente (stipendio 2000/mese) + investimento ricorrente 300/mese.
  tx({ id: 'sal', date: '2026-08-01', description: 'Stipendio', amount: 2000, type: 'income', category: 'stipendio', recurring: { freq: 'monthly' } }),
  tx({ id: 'pac', date: '2026-08-05', description: 'PAC', amount: 300, type: 'investment', category: 'etf', recurring: { freq: 'monthly' } }),
  // Affitto ricorrente 700/mese.
  tx({ id: 'rent', date: '2026-08-02', description: 'Affitto', amount: 700, category: 'casa', recurring: { freq: 'monthly' } }),
  // Stagionalità: luglio storicamente caro per "vacanze".
  tx({ date: '2025-07-15', description: 'Vacanze', amount: 800, category: 'vacanze' }),
  tx({ date: '2024-07-20', description: 'Vacanze', amount: 600, category: 'vacanze' }),
  // Evento una tantum già registrato nel mese futuro.
  tx({ date: '2026-07-25', description: 'Regalo', amount: 150, category: 'regali' }),
  // Consuntivo del mese corrente.
  tx({ date: '2026-07-03', description: 'Spesa', amount: 200, category: 'spesa' }),
];

describe('buildPlanFromRecurring', () => {
  const plan = buildPlanFromRecurring(fixture, ['casa', 'vacanze', 'regali', 'spesa'], '2026-07', TODAY, NOW);

  it('derives income/investment targets from recurring series', () => {
    expect(plan.expectedIncome).toBe(2000);
    expect(plan.investmentTarget).toBe(300);
    expect(plan.version).toBe(MONTHLY_PLAN_VERSION);
    expect(plan.status).toBe('draft');
    expect(plan.source).toBe('from_recurring');
  });

  it('budgets = max(ricorrente, mediana stagionale), no invented categories', () => {
    expect(plan.categoryBudgets.casa).toBe(700);       // ricorrente
    expect(plan.categoryBudgets.vacanze).toBe(700);    // mediana(800, 600)
    expect(plan.categoryBudgets.regali).toBeUndefined(); // one-off → evento, non budget
  });

  it('future one-offs become planned events (no double counting with budgets)', () => {
    expect(plan.plannedEvents).toHaveLength(1);
    expect(plan.plannedEvents[0]).toMatchObject({ description: 'Regalo', amount: 150, kind: 'one_off' });
  });

  it('savingsTarget = income − budgets − investments, floored at 0', () => {
    // 2000 − (700 + 700) − 300 = 300
    expect(plan.savingsTarget).toBe(300);
  });
});

describe('plan lifecycle', () => {
  const base: MonthlyPlanV2 = buildPlanFromRecurring(fixture, ['casa'], '2026-07', TODAY, NOW);

  it('copyPlanFromPrevious keeps values, stamps copiedFrom, resets events', () => {
    const withEvents = { ...base, plannedEvents: [{ id: 'e', date: '2026-07-20', description: 'X', amount: 10, kind: 'one_off' as const }] };
    const copied = copyPlanFromPrevious(withEvents, '2026-08', NOW);
    expect(copied.month).toBe('2026-08');
    expect(copied.copiedFrom).toBe('2026-07');
    expect(copied.source).toBe('copied_from_previous_month');
    expect(copied.status).toBe('draft');
    expect(copied.categoryBudgets).toEqual(base.categoryBudgets);
    expect(copied.plannedEvents).toEqual([]);
  });

  it('only explicit confirmation flips status; edits keep confirmation', () => {
    expect(base.status).toBe('draft');
    const confirmed = confirmPlan(base, NOW + 1);
    expect(confirmed.status).toBe('confirmed');
    const edited = editPlan(confirmed, { savingsTarget: 999 }, NOW + 2);
    expect(edited.status).toBe('confirmed');
    expect(edited.source).toBe('manual');
    expect(edited.savingsTarget).toBe(999);
  });

  it('prevPlanMonth handles year boundaries', () => {
    expect(prevPlanMonth('2026-01')).toBe('2025-12');
    expect(prevPlanMonth('2026-07')).toBe('2026-06');
  });
});

describe('comparePlan (piano vs consuntivo vs forecast)', () => {
  it('keeps the three figures separate', () => {
    const plan = buildPlanFromRecurring(fixture, ['casa', 'vacanze'], '2026-07', TODAY, NOW);
    const c = comparePlan(plan, fixture, TODAY, 1900);
    expect(c.plannedExpenses).toBe(1550); // 700 + 700 + evento 150
    expect(c.actualExpenses).toBe(200);   // solo il consuntivo registrato
    expect(c.forecastExpenses).toBe(1900);
    const noForecast = comparePlan(plan, fixture, TODAY);
    expect(noForecast.forecastExpenses).toBeNull();
  });
});
