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

describe('computeForecastV4 — recurring virtual occurrences', () => {
  const GYM_CATS: CategoryDef[] = [
    { id: 'palestra', label: 'Palestra', icon: '🏋️', color: '#000', kind: 'expense' },
  ];

  it('forecasts ALL remaining weekly occurrences, not just the template row', () => {
    // In Sunny only the series' NEXT occurrence exists as a document; the 24th
    // is implied by the rule. History instances are excluded from the residual
    // tail, so without expansion the 24th would be counted nowhere.
    const txs = [
      tx('2026-05-06', 25, { category: 'palestra', seriesId: 's1' }),
      tx('2026-05-13', 25, { category: 'palestra', seriesId: 's1' }),
      tx('2026-05-20', 25, { category: 'palestra', seriesId: 's1' }),
      tx('2026-05-27', 25, { category: 'palestra', seriesId: 's1' }),
      tx('2026-06-17', 25, { category: 'palestra', seriesId: 's1', recurring: { freq: 'weekly' } }),
    ];
    const r = computeForecastV4({ transactions: txs, expenseCategories: GYM_CATS, now: NOW });
    const gym = r.byCategory['palestra'];
    expect(gym.recurringRemaining).toBe(50); // 17 + 24 June
    expect(gym.residualStatisticalRemaining).toBe(0); // history is recurring → not in the tail
    expect(gym.totalForecast).toBe(50);
  });

  it('ignores an expired template entirely (dead series ≠ future spend)', () => {
    const txs = [
      tx('2026-06-20', 500, {
        category: 'palestra', seriesId: 's1',
        recurring: { freq: 'monthly', until: '2026-05-31' },
      }),
    ];
    const r = computeForecastV4({ transactions: txs, expenseCategories: GYM_CATS, now: NOW });
    expect(r.byCategory['palestra']).toBeUndefined();
    expect(r.totalForecast).toBe(0);
  });
});

describe('computeForecastV4 — seasonal partial payment', () => {
  it('forecasts only the missing part when the seasonal spend was partially paid', () => {
    const txs = [
      tx('2024-06-10', 870, { category: 'assicurazioni' }),
      tx('2025-06-10', 880, { category: 'assicurazioni' }),
      // first tranche already paid this month, before the snapshot
      tx('2026-06-05', 400, { category: 'assicurazioni' }),
    ];
    const r = computeForecastV4({ transactions: txs, expenseCategories: CATS, now: NOW });
    const ass = r.byCategory['assicurazioni'];
    expect(ass.spentToDate).toBe(400);
    expect(ass.seasonalDetectedRemaining).toBe(475); // 875 − 400
    expect(ass.totalForecast).toBe(875);             // not 400 + 875
  });
});

describe('computeForecastV4 — planned-like exclusion cap', () => {
  it('a single planned expense replaces at most ONE similar historical tx per month', () => {
    const NOW1 = new Date(2026, 5, 1); // 1 June
    // History: every month TWO similar 300 € one-offs after day 1. This month
    // the user planned ONE 300 € payment → the second monthly 300 must stay
    // in the residual tail (only one is replaced by the planned expense).
    const hist = (m: string) => [
      tx(`${m}-10`, 300, { category: 'spesa' }), tx(`${m}-20`, 300, { category: 'spesa' }),
    ];
    const txs = [
      ...hist('2026-03'), ...hist('2026-04'), ...hist('2026-05'),
      tx('2026-06-10', 300, { category: 'spesa', description: 'Rata' }), // planned
    ];
    const r = computeForecastV4({ transactions: txs, expenseCategories: CATS, now: NOW1 });
    const spesa = r.byCategory['spesa'];
    expect(spesa.plannedManualRemaining).toBe(300);
    expect(spesa.residualStatisticalRemaining).toBe(300); // the second monthly 300
    expect(spesa.totalForecast).toBe(600);
  });
});

describe('computeForecastV4 — empirical reliability counts zero-spend months', () => {
  it('a budget that never materialised drives reliability to the floor', () => {
    // Activity in Jan+Feb only, then three CONFIRMED budgeted months (Mar–May)
    // with ZERO spend: the budget clearly does not predict spend.
    const txs = [
      tx('2026-01-20', 50, { category: 'acquisti' }),
      tx('2026-02-20', 50, { category: 'acquisti' }),
    ];
    const budgetHistory = ['2026-03', '2026-04', '2026-05', '2026-06'].map(month => ({
      month, categoryBudgets: { acquisti: 600 }, status: 'confirmed' as const, source: 'manual',
    }));
    const r = computeForecastV4({
      transactions: txs, expenseCategories: CATS, now: NOW,
      budgetHistory, applyBudgetSignal: true,
    });
    const acq = r.byCategory['acquisti'];
    expect(acq.budgetReliabilitySource).toBe('empirical');
    expect(acq.budgetReliabilitySampleCount).toBe(3);
    expect(acq.budgetReliability).toBe(0.15); // clamped floor, was 0.25 fallback
    // Adjustment scaled by the empirical floor, not the (higher) fallback.
    expect(acq.budgetSignalAdjustment!).toBe(Math.round((acq.budgetGap ?? 0) * 0.15));
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

  it('does NOT add a statistical residual on top of a committed fixed expense (history entered as one-offs)', () => {
    const cats: CategoryDef[] = [
      { id: 'finanziamento', label: 'Finanziamento auto', icon: '🚗', color: '#000', kind: 'expense' },
      { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#000', kind: 'expense' },
      { id: 'uscite', label: 'Uscite', icon: '🍽️', color: '#000', kind: 'expense' },
    ];
    const NOW1 = new Date(2026, 5, 1); // 1 June → the whole month is still "remaining"
    // Non-recurring €300 monthly history + a €300 payment this month (planned vs 1 Jun).
    const mk = (cat: string) => [
      tx('2026-03-10', 300, { category: cat }), tx('2026-04-10', 300, { category: cat }),
      tx('2026-05-10', 300, { category: cat }), tx('2026-06-10', 300, { category: cat, description: 'Rata' }),
    ];
    // Control: same history but NO planned payment this month.
    const noPlanned = [
      tx('2026-03-10', 300, { category: 'uscite' }), tx('2026-04-10', 300, { category: 'uscite' }),
      tx('2026-05-10', 300, { category: 'uscite' }),
    ];
    const r = computeForecastV4({
      transactions: [...mk('finanziamento'), ...mk('spesa'), ...noPlanned], expenseCategories: cats, now: NOW1,
    });
    const fin = r.byCategory['finanziamento'];
    expect(fin.plannedManualRemaining).toBe(300);
    expect(fin.residualStatisticalRemaining).toBe(0); // suppressed for the fixed category
    expect(fin.totalForecast).toBe(300);              // not 600
    // A VARIABLE category is protected too: the planned 300 replaces the
    // amount-similar historical one-offs in the residual tail (no more double).
    expect(r.byCategory['spesa'].residualStatisticalRemaining).toBe(0);
    expect(r.byCategory['spesa'].totalForecast).toBe(300);
    // Control: with NO planned expense this month the estimator still fires.
    expect(r.byCategory['uscite'].residualStatisticalRemaining).toBeGreaterThan(0);
  });
});
