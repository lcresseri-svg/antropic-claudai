import { describe, it, expect } from 'vitest';
import { computeForecastV4 } from './forecastEngineV4';
import { FORECAST_V4_ADMIN_UIDS } from '../forecastFeatureGate';
import { Transaction, CategoryDef } from '../../../types';

const NOW = new Date(2026, 5, 15); // 15 June 2026
const ADMIN_UID = FORECAST_V4_ADMIN_UIDS[0];

const CATS: CategoryDef[] = [
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#000', kind: 'expense' },
  { id: 'assicurazioni', label: 'Assicurazioni', icon: '🛡️', color: '#000', kind: 'expense' },
  { id: 'acquisti', label: 'Acquisti', icon: '🛍️', color: '#000', kind: 'expense' },
];

function tx(date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date, description: 'x', amount,
    type: 'expense', category: 'spesa', account: 'cc', ...extra,
  };
}

function baseTransactions(): Transaction[] {
  return [
    // spesa: already spent + a future planned (large) expense
    tx('2026-06-10', 100, { category: 'spesa' }),
    tx('2026-06-20', 400, { category: 'spesa', description: 'Caparra viaggio' }),
    // assicurazioni: seasonal history in June (870, 880) → predict ~875
    tx('2024-06-10', 870, { category: 'assicurazioni' }),
    tx('2025-06-10', 880, { category: 'assicurazioni' }),
    // acquisti: small recurring monthly variable spend (after day 15) → residual ≈ 50
    tx('2025-09-20', 50, { category: 'acquisti' }),
    tx('2025-10-20', 50, { category: 'acquisti' }),
    tx('2025-11-20', 50, { category: 'acquisti' }),
    tx('2025-12-20', 50, { category: 'acquisti' }),
    tx('2026-01-20', 50, { category: 'acquisti' }),
    tx('2026-02-20', 50, { category: 'acquisti' }),
    tx('2026-03-20', 50, { category: 'acquisti' }),
    tx('2026-04-20', 50, { category: 'acquisti' }),
    tx('2026-05-20', 50, { category: 'acquisti' }),
    // non-expense flows that MUST be excluded
    { id: 'inc', date: '2026-06-12', description: 'Stipendio', amount: 2000, type: 'income', category: 'stip', account: 'cc' },
    { id: 'invst', date: '2026-06-12', description: 'ETF', amount: 500, type: 'investment', category: 'etf', account: 'cc' },
    { id: 'trf', date: '2026-06-12', description: 'Giro', amount: 100, type: 'transfer', category: 'mov', account: 'cc', toAccount: 'cc2' },
  ];
}

describe('computeForecastV4 — admin gate', () => {
  it('throws for a non-admin user', () => {
    expect(() => computeForecastV4({
      user: { uid: 'normal' }, transactions: baseTransactions(), expenseCategories: CATS, now: NOW,
    })).toThrow(/admin/i);
  });

  it('runs for an admin user', () => {
    expect(() => computeForecastV4({
      user: { uid: ADMIN_UID }, transactions: baseTransactions(), expenseCategories: CATS, now: NOW,
    })).not.toThrow();
  });
});

describe('computeForecastV4 — components', () => {
  it('forecasts only expenses (income/investment/transfer excluded)', () => {
    const r = computeForecastV4({ transactions: baseTransactions(), expenseCategories: CATS, now: NOW });
    // No income/investment/transfer leaks into category results.
    expect(r.byCategory['stip']).toBeUndefined();
    expect(r.byCategory['etf']).toBeUndefined();
    expect(r.byCategory['mov']).toBeUndefined();
  });

  it('splits spesa into spent-to-date + planned manual remaining', () => {
    const r = computeForecastV4({ transactions: baseTransactions(), expenseCategories: CATS, now: NOW });
    const spesa = r.byCategory['spesa'];
    expect(spesa.spentToDate).toBe(100);
    expect(spesa.plannedManualRemaining).toBe(400);
    expect(spesa.reasons).toContain('Spesa pianificata manuale futura');
  });

  it('flags the large planned expense (≥300 €) in diagnostics', () => {
    const r = computeForecastV4({ transactions: baseTransactions(), expenseCategories: CATS, now: NOW });
    const large = r.diagnostics.largePlannedExpenses.find(p => p.categoryId === 'spesa');
    expect(large).toBeDefined();
    expect(large!.amount).toBe(400);
  });

  it('detects the seasonal insurance expense (~875) for June', () => {
    const r = computeForecastV4({ transactions: baseTransactions(), expenseCategories: CATS, now: NOW });
    const ass = r.byCategory['assicurazioni'];
    expect(ass.seasonalDetectedRemaining).toBe(875);
    expect(r.diagnostics.seasonalDetected.some(s => s.categoryId === 'assicurazioni')).toBe(true);
  });

  it('totalForecast equals the sum of its components', () => {
    const r = computeForecastV4({ transactions: baseTransactions(), expenseCategories: CATS, now: NOW });
    const c = r.components;
    const sum = c.spentToDate + c.plannedManualRemaining + c.recurringRemaining +
      c.seasonalDetectedRemaining + c.residualStatisticalRemaining + c.budgetSignalAdjustment;
    expect(r.totalForecast).toBe(sum);
  });
});

describe('computeForecastV4 — seasonal/planned anti double-count', () => {
  it('does not add a seasonal insurance amount when a similar planned expense already covers it', () => {
    const txs = [
      tx('2024-06-10', 870, { category: 'assicurazioni' }),
      tx('2025-06-10', 880, { category: 'assicurazioni' }),
      // user already planned the June 2026 insurance manually
      tx('2026-06-25', 880, { category: 'assicurazioni', description: 'Assicurazione 2026' }),
    ];
    const r = computeForecastV4({ transactions: txs, expenseCategories: CATS, now: NOW });
    const ass = r.byCategory['assicurazioni'];
    expect(ass.plannedManualRemaining).toBe(880);
    expect(ass.seasonalDetectedRemaining).toBe(0);
  });
});

describe('computeForecastV4 — budget signal', () => {
  const confirmedJune = [{
    month: '2026-06', categoryBudgets: { acquisti: 600 },
    status: 'confirmed' as const, source: 'manual',
  }];

  it('applies a positive budget adjustment for Acquisti when the budget is confirmed', () => {
    const r = computeForecastV4({
      transactions: baseTransactions(), expenseCategories: CATS, now: NOW,
      budgetHistory: confirmedJune, applyBudgetSignal: true,
    });
    const acq = r.byCategory['acquisti'];
    expect(acq.residualStatisticalRemaining).toBeGreaterThan(0);
    expect(acq.budgetStatus).toBe('confirmed');
    expect(acq.budgetSignalAdjustment!).toBeGreaterThan(0);
    expect(acq.totalForecast).toBe(acq.forecastBeforeBudget + acq.budgetSignalAdjustment!);
  });

  it('zeroes the signal for a discretionary category when the budget is NOT confirmed', () => {
    const r = computeForecastV4({
      transactions: baseTransactions(), expenseCategories: CATS, now: NOW,
      // legacy categoryBudgets with no history → treated as unconfirmed current intent
      categoryBudgets: { acquisti: 600 },
      currentMonthBudgetStatus: 'auto_initialized', applyBudgetSignal: true,
    });
    const acq = r.byCategory['acquisti'];
    expect(acq.budgetStatus).toBe('auto_initialized');
    expect(acq.budgetSignalAdjustment).toBe(0);
    expect(acq.totalForecast).toBe(acq.forecastBeforeBudget);
  });

  it('does not change the forecast when the budget signal is disabled', () => {
    const r = computeForecastV4({
      transactions: baseTransactions(), expenseCategories: CATS, now: NOW,
      budgetHistory: confirmedJune, applyBudgetSignal: false,
    });
    const acq = r.byCategory['acquisti'];
    expect(acq.budgetSignalAdjustment).toBe(0);
    expect(acq.totalForecast).toBe(acq.forecastBeforeBudget);
  });

  it('never uses the current budget for a historical target month (backtest safety)', () => {
    // Simulate forecasting March 2026 with only a June 2026 budget present.
    const r = computeForecastV4({
      transactions: baseTransactions(), expenseCategories: CATS,
      now: new Date(2026, 2, 15), // March
      budgetHistory: confirmedJune, applyBudgetSignal: true,
    });
    // No budget snapshot for March → no budget signal anywhere.
    for (const c of Object.values(r.byCategory)) {
      expect(c.budgetSignalAdjustment ?? 0).toBe(0);
    }
    expect(r.diagnostics.budgetMonthStatus).toBe('missing');
  });
});

describe('computeForecastV4 — fixed categories never sum the budget on top', () => {
  const FIXED_CATS: CategoryDef[] = [
    { id: 'finanziamento', label: 'Finanziamento auto', icon: '🚗', color: '#000', kind: 'expense' },
  ];
  const budgetJune = [{
    month: '2026-06', categoryBudgets: { finanziamento: 300 },
    status: 'confirmed' as const, source: 'manual',
  }];

  it('a one-off planned instalment + equal budget gives previsto == programmato (not their sum)', () => {
    const txs = [tx('2026-06-28', 300, { category: 'finanziamento', description: 'Rata' })];
    const r = computeForecastV4({
      transactions: txs, expenseCategories: FIXED_CATS, now: NOW,
      budgetHistory: budgetJune, applyBudgetSignal: true,
    });
    const fin = r.byCategory['finanziamento'];
    expect(fin.plannedManualRemaining).toBe(300);
    expect(fin.forecastBeforeBudget).toBe(300);
    expect(fin.budgetSignalAdjustment ?? 0).toBe(0); // no top-up on a fixed category
    expect(fin.totalForecast).toBe(300);             // not 600
  });

  it('floors a fixed category with a budget but no planned movement up to the budget', () => {
    const r = computeForecastV4({
      transactions: [], expenseCategories: FIXED_CATS, now: NOW,
      budgetHistory: budgetJune, applyBudgetSignal: true,
    });
    const fin = r.byCategory['finanziamento'];
    expect(fin.forecastBeforeBudget).toBe(0);
    expect(fin.totalForecast).toBe(300); // coincides with the programmato
  });
});
