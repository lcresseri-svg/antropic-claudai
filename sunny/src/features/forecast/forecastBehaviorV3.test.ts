/**
 * FASE 1 — Part B & C
 *
 * Part B: Behavior classification with known ground truth.
 *   Each fixture category is designed to trigger one specific behavior.
 *   The engine must classify it correctly; no accuracy measurement is done.
 *
 * Part C: Mutation tests — fixture mutated systematically to verify the
 *   engine reacts correctly to each structural change:
 *   M1 retrodatazione · M2 lookahead · M3 duplicazione · M4 cancellazione
 *   M5 anomalia isolata · M6 shift temporale · M7 bias solo variabile
 *   M8 budget non-leakage · M9 convenzione errori
 *
 * POLICY: these tests verify behaviour reactions only.
 * NEVER used to measure or optimise forecast accuracy.
 */
import { describe, it, expect } from 'vitest';
import { computeForecastV3, ForecastV3Input } from './forecastEngineV3';
import { runBacktestV3 } from './forecastBacktestV3';
import { detectStaleCategoryV3 } from './forecastBehaviorV3';
import { MonthCatHistory, computeCatStats } from './forecastHistory';
import {
  buildFixtureV3,
  FIXTURE_NOW,
  FIXTURE_CATEGORIES,
  fxTx,
  fixtureMonthKey,
} from './forecastFixtureV3';
import { CategoryDef, Transaction } from '../../types';

// ── helpers ───────────────────────────────────────────────────────────────────

function runFixture(
  overrides: Partial<ForecastV3Input> & { extraTxs?: Transaction[]; now?: Date },
) {
  const txs = [...buildFixtureV3(), ...(overrides.extraTxs ?? [])];
  return computeForecastV3({
    transactions: txs,
    expenseCategories: FIXTURE_CATEGORIES,
    monthlyIncome: 0,
    monthlyInvestments: 0,
    now: overrides.now ?? FIXTURE_NOW,
    biasFactor: overrides.biasFactor,
    categoryBudgets: overrides.categoryBudgets,
  });
}

function catOf(result: ReturnType<typeof computeForecastV3>, id: string) {
  const c = result.categories.find(x => x.categoryId === id);
  if (!c) throw new Error(`Category ${id} not found in result`);
  return c;
}

// ═══ PARTE B — behavior classification ═══════════════════════════════════════

describe('B — behavior classification (fixture ground truth)', () => {

  it('affitto → recurring (explicit seriesId, day 1, €800, 15 months)', () => {
    const cat = catOf(runFixture({}), 'affitto');
    expect(cat.behavior).toBe('recurring');
    // Payment already occurred on June 1: actual = 800, no variable residual
    expect(cat.actualSoFar).toBe(800);
    expect(cat.predictedVariableRemaining).toBe(0);
    expect(cat.projected).toBeGreaterThanOrEqual(800);
  });

  it('abbonamenti → recurring_bundle (Netflix+Spotify auto-detected, no flags)', () => {
    const cat = catOf(runFixture({}), 'abbonamenti');
    expect(cat.behavior).toBe('recurring_bundle');
    // Bundle = no statistical variable prediction on top
    expect(cat.predictedVariableRemaining).toBe(0);
  });

  it('palestra → fixed_monthly (€50 stable, unique merchants prevent auto-recurring)', () => {
    const cat = catOf(runFixture({}), 'palestra');
    expect(cat.behavior).toBe('fixed_monthly');
    expect(cat.projected).toBe(50);
    expect(cat.predictedVariableRemaining).toBe(0);
  });

  it('assicurazione → periodic_fixed (annual €300, June 2024 + June 2025)', () => {
    const cat = catOf(runFixture({}), 'assicurazione');
    expect(cat.behavior).toBe('periodic_fixed');
    expect(cat.behaviorResult.interval).toBe('annual');
    // June 2026 is an active month → engine expects the payment
    expect(cat.projected).toBeGreaterThan(200);
  });

  it('trasporti → hybrid (explicit seriesId bus-pass + variable taxi)', () => {
    const cat = catOf(runFixture({}), 'trasporti');
    expect(cat.behavior).toBe('hybrid');
    // Fixed part ≈ €50 (bus pass median)
    expect(cat.behaviorResult.fixedAmount).toBeGreaterThanOrEqual(40);
    expect(cat.behaviorResult.fixedAmount).toBeLessThanOrEqual(60);
  });

  it('giornali → stale (stopped Feb 2026, ≥3 consecutive inactive months by June 2026)', () => {
    const cat = catOf(runFixture({}), 'giornali');
    expect(cat.behavior).toBe('stale');
    expect(cat.predictedVariableRemaining).toBe(0);
  });

  it('medico → rare_variable (2 sparse visits Apr+May 2026, <3 active months in history)', () => {
    const cat = catOf(runFixture({}), 'medico');
    expect(cat.behavior).toBe('rare_variable');
    expect(cat.reliability).toBeLessThan(0.40);
  });

  it('spesa → variable_frequent (6 tx/month ≈ €150, stable 14-month history)', () => {
    const cat = catOf(runFixture({}), 'spesa');
    expect(cat.behavior).toBe('variable_frequent');
  });

  it('ristoranti → variable_sparse (2 tx/month, CV ≈ 0.22 < 0.50, medCount ≤ 3)', () => {
    const cat = catOf(runFixture({}), 'ristoranti');
    expect(cat.behavior).toBe('variable_sparse');
  });

  it('shopping → volatile_mixed (1 tx/month cycling 30–400, CV ≈ 0.75 > 0.50)', () => {
    const cat = catOf(runFixture({}), 'shopping');
    expect(cat.behavior).toBe('volatile_mixed');
  });

  it('nuova → unknown (zero transactions, no history)', () => {
    const cat = catOf(runFixture({}), 'nuova');
    expect(cat.behavior).toBe('unknown');
  });
});

// ═══ PARTE C — mutation tests ═════════════════════════════════════════════════

describe('C — mutation tests', () => {

  /**
   * M1 — retrodatazione
   * A tx with createdAt AFTER the end-of-month + 3-day grace must be excluded
   * from the backtest snapshot input but remain in the ground-truth actual.
   */
  it('M1: late-createdAt tx excluded from snapshot input, still present in actual (no causal leakage)', () => {
    // Grace cutoff for May 2026 = June 4 2026
    const MAY_GRACE_MS = new Date(2026, 5, 4).getTime();

    const txs: Transaction[] = [
      ...buildFixtureV3(),
      // Backdated entry: May 2026 date, entered 1 day AFTER the grace cutoff
      fxTx('2026-05-25', 200, 'spesa', 'spesa tardiva retrodata', {
        createdAt: MAY_GRACE_MS + 86_400_000,
      }),
    ];

    const result = runBacktestV3(txs, FIXTURE_CATEGORIES, FIXTURE_NOW, 2);
    const maySnaps = result.snapshots.filter(s => s.monthKey === '2026-05');

    expect(maySnaps.length).toBeGreaterThan(0);
    // All 5 snapshot days flag the late tx
    maySnaps.forEach(s => expect(s.excludedLateTx).toBeGreaterThanOrEqual(1));
    // Ground truth includes ALL actual tx (no filter on truth)
    maySnaps.forEach(s => expect(s.actual).toBeGreaterThan(0));
  });

  /**
   * M2 — lookahead
   * A future-dated recurring tx created AFTER the grace period must not be
   * pre-inserted into the historical snapshot (series lookahead guard).
   */
  it('M2: future series tx with late createdAt excluded from backtest snapshot (no lookahead leakage)', () => {
    // Grace cutoff for May 2026 = June 4 2026
    const MAY_GRACE_MS = new Date(2026, 5, 4).getTime();

    const txs: Transaction[] = [
      ...buildFixtureV3(),
      // Recurring tx in May 2026 that was created retroactively after May closed
      fxTx('2026-05-28', 100, 'affitto', 'affitto retroattivo extra', {
        seriesId: 'rent-retro',
        createdAt: MAY_GRACE_MS + 86_400_000,
      }),
    ];

    const result = runBacktestV3(txs, FIXTURE_CATEGORIES, FIXTURE_NOW, 2);
    const maySnaps = result.snapshots.filter(s => s.monthKey === '2026-05');

    expect(maySnaps.length).toBeGreaterThan(0);
    // The late series tx is excluded even though it has a recurring flag
    maySnaps.forEach(s => expect(s.excludedLateTx).toBeGreaterThanOrEqual(1));
  });

  /**
   * M3 — duplicazione
   * recurring_bundle: scheduled amount is NOT added on top of the historical
   * variable average → projected ≈ scheduled only (no double-count).
   */
  it('M3: recurring_bundle projected ≈ scheduled only; predictedVariableRemaining = 0 (no double-count)', () => {
    const cat = catOf(runFixture({}), 'abbonamenti');
    expect(cat.behavior).toBe('recurring_bundle');
    expect(cat.predictedVariableRemaining).toBe(0);
    // Netflix €15 + Spotify €10 = €25; if double-counted would be ≈ €50
    expect(cat.projected).toBeGreaterThanOrEqual(20);
    expect(cat.projected).toBeLessThanOrEqual(35);
  });

  /**
   * M4 — cancellazione
   * When an expected fixed_monthly payment did NOT arrive in the current month,
   * the engine projects the locked historical amount with no phantom variable.
   */
  it('M4: fixed_monthly payment absent in current month → projected = locked amount, no phantom remaining', () => {
    // Remove the June 2026 palestra tx (simulate the payment didn't arrive)
    const txsWithoutJunePalestra = buildFixtureV3().filter(
      t => !(t.category === 'palestra' && t.date.startsWith('2026-06')),
    );
    // Run at June 20 — well past palestra day-7 — so there is no excuse for it
    const nowLate = new Date(2026, 5, 20);

    const result = computeForecastV3({
      transactions: txsWithoutJunePalestra,
      expenseCategories: FIXTURE_CATEGORIES,
      monthlyIncome: 0,
      monthlyInvestments: 0,
      now: nowLate,
    });
    const cat = result.categories.find(c => c.categoryId === 'palestra')!;

    expect(cat.behavior).toBe('fixed_monthly');
    // No payment happened → actualSoFar = 0
    expect(cat.actualSoFar).toBe(0);
    // Engine still projects the locked amount (50), not 0 and not inflated
    expect(cat.projected).toBe(50);
    expect(cat.predictedVariableRemaining).toBe(0);
  });

  /**
   * M5 — anomalia isolata
   * A one-off spike in a month INSIDE the 5-month fixed window does not distort
   * the locked amount because fixed_monthly uses median (not arithmetic mean).
   * Separately, a spike in month-4 (outside the 3-month recent window) has zero
   * effect on a variable category's recent mean.
   *
   * NOTE (known limitation): a spike in one of the 3 recent months for a
   * *variable* category inflates robustMean when the other two are identical
   * (MAD = 0 → no winsorization). This is documented, not masked.
   */
  it('M5a: spike in fixed_monthly history uses median → projected = 100, not 460 (arithmetic mean)', () => {
    const cats: CategoryDef[] = [
      { id: 'test', label: 'Test', icon: '?', color: '#000', kind: 'expense' },
    ];
    // 5 months at €100 except month-4 (Feb 2026) which has a €1000 spike
    const txs: Transaction[] = [
      fxTx(`${fixtureMonthKey(1)}-05`, 100, 'test', 'merchant-m1'),
      fxTx(`${fixtureMonthKey(2)}-05`, 100, 'test', 'merchant-m2'),
      fxTx(`${fixtureMonthKey(3)}-05`, 100, 'test', 'merchant-m3'),
      fxTx(`${fixtureMonthKey(4)}-05`, 1000, 'test', 'merchant-m4'), // spike
      fxTx(`${fixtureMonthKey(5)}-05`, 100, 'test', 'merchant-m5'),
    ];

    const result = computeForecastV3({
      transactions: txs,
      expenseCategories: cats,
      monthlyIncome: 0,
      monthlyInvestments: 0,
      now: FIXTURE_NOW,
    });
    const cat = result.categories.find(c => c.categoryId === 'test')!;

    // Median of [100, 100, 100, 100, 1000] = 100; arithmetic mean = 280
    // fixed_monthly uses median → locked = 100
    expect(cat.behavior).toBe('fixed_monthly');
    expect(cat.projected).toBe(100);
  });

  it('M5b: spike in month-4 (outside 3-month recent window) does not affect variable forecast', () => {
    const cats: CategoryDef[] = [
      { id: 'varcat', label: 'VarCat', icon: '?', color: '#000', kind: 'expense' },
    ];
    // 3 normal recent months + spike at month-4 (outside window) + normal at month-12
    // Using unique merchants per tx so fixed_monthly does NOT fire (medCount = 1/month ≤ 2.5)
    // but adding enough months so activeHistoryCount >= 3
    const txs: Transaction[] = [
      fxTx(`${fixtureMonthKey(1)}-05`, 100, 'varcat', 'vc-m1'),
      fxTx(`${fixtureMonthKey(2)}-05`, 100, 'varcat', 'vc-m2'),
      fxTx(`${fixtureMonthKey(3)}-05`, 100, 'varcat', 'vc-m3'),
      fxTx(`${fixtureMonthKey(4)}-05`, 1000, 'varcat', 'vc-m4-spike'), // outside recentKeys
      fxTx(`${fixtureMonthKey(12)}-05`, 100, 'varcat', 'vc-m12'),
    ];

    const result = computeForecastV3({
      transactions: txs,
      expenseCategories: cats,
      monthlyIncome: 0,
      monthlyInvestments: 0,
      now: FIXTURE_NOW,
    });
    const cat = result.categories.find(c => c.categoryId === 'varcat')!;

    // The spike at month-4 is outside recentKeys → recentVarMean = robustMean([100,100,100]) = 100
    // projected should be near 100, NOT inflated toward 400 (which would include the spike)
    expect(cat.projected).toBeGreaterThan(30);
    expect(cat.projected).toBeLessThan(200);
  });

  /**
   * M6 — shift temporale
   * Annual periodic payment shifted ±1 month (gap = 13 instead of 12) is still
   * detected as annual because |13 - 12| ≤ 2 (tolerance in detectGapInterval).
   */
  it('M6: periodic payment shifted +1 month still detected as annual interval', () => {
    // Replace assicurazione fixture (Jun24, Jun25) with shifted (Jun24, Jul25)
    const baseTxs = buildFixtureV3().filter(t => t.category !== 'assicurazione');
    const shifted: Transaction[] = [
      fxTx(`${fixtureMonthKey(24)}-10`, 300, 'assicurazione', 'assicurazione casa polizza'), // Jun 2024
      fxTx(`${fixtureMonthKey(11)}-10`, 300, 'assicurazione', 'assicurazione casa polizza'), // Jul 2025 (+1 shift)
    ];

    const result = computeForecastV3({
      transactions: [...baseTxs, ...shifted],
      expenseCategories: FIXTURE_CATEGORIES,
      monthlyIncome: 0,
      monthlyInvestments: 0,
      now: FIXTURE_NOW,
    });
    const cat = result.categories.find(c => c.categoryId === 'assicurazione')!;

    // Gap = 13 months; |13 - 12| = 1 ≤ 2 → still classified annual
    expect(cat.behavior).toBe('periodic_fixed');
    expect(cat.behaviorResult.interval).toBe('annual');
  });

  /**
   * M7 — bias solo variabile
   * biasFactor scales ONLY predictedVariableRemaining.
   * Deterministic components (actuals, locked amounts) are invariant.
   * Clamp [0.75, 1.25] is enforced on inputs outside the range.
   */
  it('M7: biasFactor scales variable-only; recurring/fixed components unchanged; clamp respected', () => {
    const base    = runFixture({ biasFactor: 1.0 });
    const biased  = runFixture({ biasFactor: 1.25 });

    // --- spesa (variable_frequent) — bias applies ---
    const baseSpesa   = catOf(base,   'spesa');
    const biasedSpesa = catOf(biased, 'spesa');
    expect(biasedSpesa.biasCorrection).toBe(1.25);
    // Deterministic component (actuals + scheduled future) unchanged
    expect(biasedSpesa.deterministicComponent).toBe(baseSpesa.deterministicComponent);
    // If there was a variable residual, it is scaled up
    if (baseSpesa.predictedVariableRemaining > 0) {
      expect(biasedSpesa.predictedVariableRemaining).toBeGreaterThan(
        baseSpesa.predictedVariableRemaining,
      );
      expect(biasedSpesa.projected).toBeGreaterThan(baseSpesa.projected);
    }

    // --- affitto (recurring) — bias must NOT apply ---
    const baseAffitto   = catOf(base,   'affitto');
    const biasedAffitto = catOf(biased, 'affitto');
    expect(biasedAffitto.biasCorrection).toBe(1.0);
    expect(biasedAffitto.projected).toBe(baseAffitto.projected);

    // --- palestra (fixed_monthly) — bias must NOT apply ---
    const basePalestra   = catOf(base,   'palestra');
    const biasedPalestra = catOf(biased, 'palestra');
    expect(biasedPalestra.biasCorrection).toBe(1.0);
    expect(biasedPalestra.projected).toBe(basePalestra.projected);

    // --- Clamp: input 2.0 → clamped to 1.25 ---
    const overBiased = runFixture({ biasFactor: 2.0 });
    expect(overBiased.biasFactor).toBe(1.25);

    // --- Clamp: input 0.0 → clamped to 0.75 ---
    const underBiased = runFixture({ biasFactor: 0.0 });
    expect(underBiased.biasFactor).toBe(0.75);
  });

  /**
   * M8 — budget non-leakage
   * categoryBudgets does not affect the projected estimate for variable categories.
   * (Budget only influences stale detection and fixed/periodic expected amounts.)
   */
  it('M8: categoryBudgets with far-off value leaves variable_frequent projected unchanged', () => {
    const withoutBudget = runFixture({});
    // Set a wildly wrong budget for spesa — should have no effect on variable path
    const withBudget = runFixture({ categoryBudgets: { spesa: 9999 } });

    const catNoBudget = catOf(withoutBudget, 'spesa');
    const catBudget   = catOf(withBudget,   'spesa');

    expect(catBudget.behavior).toBe(catNoBudget.behavior);
    expect(catBudget.projected).toBe(catNoBudget.projected);
    expect(catBudget.predictedVariableRemaining).toBe(catNoBudget.predictedVariableRemaining);
  });

  /**
   * M9 — convenzione errori
   *
   * 9a: error = predicted − actual (sign convention, always exact).
   * 9b: det + var decomposition is EXACT for a minimal fixture where all
   *     deterministic amounts flow via seriesId (scheduled_recurring), not via
   *     the "locked shortfall" path of fixed_monthly/recurring.
   *
   * NOTE (documented limitation): the decomposition does NOT hold for
   * fixed_monthly categories whose payment arrives AFTER the snapshot day
   * without a seriesId, because the projected locked amount lands in neither
   * `scheduledFuture` nor `predictedVariableRemaining`. This is a known
   * structural gap in the backtest's decomposition — not a bug in the engine.
   */
  it('M9a: sign convention — error = predicted − actual for full fixture (always holds)', () => {
    const result = runBacktestV3(buildFixtureV3(), FIXTURE_CATEGORIES, FIXTURE_NOW, 6);
    expect(result.snapshots.length).toBeGreaterThan(0);
    result.snapshots.forEach(snap => {
      expect(snap.error).toBe(snap.predicted - snap.actual);
    });
  });

  it('FASE2-G1a (unit): trailing inactivity interrupted by active last month → NOT stale', () => {
    // Bug osservato su dati reali: 2 mesi inattivi NON consecutivi su 3 facevano
    // scattare stale anche con il mese scorso attivo (es. nov✗ dic✗ gen✓ → stale).
    const h = (key: string, total: number): MonthCatHistory =>
      ({ monthKey: key, variableTotal: total, variableCount: total > 0 ? 2 : 0, recurringTotal: 0 });
    const catHistory: Record<string, MonthCatHistory> = {
      '2026-05': h('2026-05', 120), // mese scorso ATTIVO
      '2026-04': h('2026-04', 0),
      '2026-03': h('2026-03', 0),
      '2026-01': h('2026-01', 90),
    };
    const recentKeys = ['2026-05', '2026-04', '2026-03']; // most recent first
    const res = detectStaleCategoryV3({ catHistory, recentKeys });
    expect(res.isStale).toBe(false);
  });

  it('FASE2-G1b (unit): trailing inactivity ≥ 2 consecutive months, no current activity → stale', () => {
    const h = (key: string, total: number): MonthCatHistory =>
      ({ monthKey: key, variableTotal: total, variableCount: total > 0 ? 2 : 0, recurringTotal: 0 });
    const catHistory: Record<string, MonthCatHistory> = {
      '2026-05': h('2026-05', 0),
      '2026-04': h('2026-04', 0),
      '2026-03': h('2026-03', 80),
    };
    const recentKeys = ['2026-05', '2026-04', '2026-03'];
    const res = detectStaleCategoryV3({ catHistory, recentKeys });
    expect(res.isStale).toBe(true);
    expect(res.lastActiveKey).toBe('2026-03');
  });

  it('FASE2-G1c (unit): current-month activity wakes a dormant category → NOT stale', () => {
    const h = (key: string, total: number): MonthCatHistory =>
      ({ monthKey: key, variableTotal: total, variableCount: total > 0 ? 2 : 0, recurringTotal: 0 });
    const catHistory: Record<string, MonthCatHistory> = {
      '2026-05': h('2026-05', 0),
      '2026-04': h('2026-04', 0),
      '2026-03': h('2026-03', 80),
    };
    const recentKeys = ['2026-05', '2026-04', '2026-03'];
    const res = detectStaleCategoryV3({ catHistory, recentKeys, hasCurrentMonthActivity: true });
    expect(res.isStale).toBe(false);
  });

  it('FASE2-G1d (engine): category with gaps but active LAST month is not stale', () => {
    const cats: CategoryDef[] = [
      { id: 'risorta', label: 'Risorta', icon: '?', color: '#000', kind: 'expense' },
    ];
    // Attiva Gen, Feb e Mag 2026 (4 tx/mese, importi variati → né fixed né bundle),
    // inattiva Mar+Apr. Prima del fix: 2 inattivi su 3 recenti → stale (errato).
    const txs: Transaction[] = [];
    for (const [monthsAgo, base] of [[1, 30], [4, 50], [5, 20]] as const) {
      for (let j = 0; j < 4; j++) {
        txs.push(fxTx(`${fixtureMonthKey(monthsAgo)}-${String(5 + j * 5).padStart(2, '0')}`,
          base + j * 7, 'risorta', `risorta acq ${monthsAgo}-${j}`));
      }
    }
    const result = computeForecastV3({
      transactions: txs, expenseCategories: cats,
      monthlyIncome: 0, monthlyInvestments: 0, now: FIXTURE_NOW,
    });
    const cat = result.categories.find(c => c.categoryId === 'risorta')!;
    expect(cat.behavior).not.toBe('stale');
  });

  it('FASE2-G1e (engine): dormant category with current-month tx wakes; without it stays stale', () => {
    const cats: CategoryDef[] = [
      { id: 'dormiente', label: 'Dormiente', icon: '?', color: '#000', kind: 'expense' },
    ];
    // Attiva Set-Dic 2025 (4 tx/mese), poi ferma Gen-Mag 2026. Totali mensili
    // MOLTO variabili (50/500/120/900) così detectPeriodicFixedV3 resta a
    // confidence 'low' (CV alto) e il percorso arriva al check stale.
    const MONTH_TOTALS: Record<number, number> = { 6: 50, 7: 500, 8: 120, 9: 900 };
    const baseTxs: Transaction[] = [];
    for (const monthsAgo of [6, 7, 8, 9]) {
      for (let j = 0; j < 4; j++) {
        baseTxs.push(fxTx(`${fixtureMonthKey(monthsAgo)}-${String(4 + j * 6).padStart(2, '0')}`,
          MONTH_TOTALS[monthsAgo] / 4, 'dormiente', `dorm acq ${monthsAgo}-${j}`));
      }
    }
    const run = (extra: Transaction[]) => computeForecastV3({
      transactions: [...baseTxs, ...extra], expenseCategories: cats,
      monthlyIncome: 0, monthlyInvestments: 0, now: FIXTURE_NOW,
    }).categories.find(c => c.categoryId === 'dormiente')!;

    // Senza attività corrente: 5 mesi consecutivi inattivi → stale (invariato)
    expect(run([]).behavior).toBe('stale');
    // Con una spesa registrata QUESTO mese: la categoria si risveglia
    const woken = run([fxTx('2026-06-08', 40, 'dormiente', 'dorm risveglio')]);
    expect(woken.behavior).not.toBe('stale');
  });

  it('FASE2-G1f (engine): single spike month after dormancy → rare_variable, not full variable path', () => {
    const cats: CategoryDef[] = [
      { id: 'spike', label: 'Spike', icon: '?', color: '#000', kind: 'expense' },
    ];
    // Storia vecchia (M-8..M-10, 4 tx/mese) → activeHistoryCount ≥ 3.
    // Poi dormiente, e UN solo mese attivo recente (M-1) con un picco da €1000.
    // Senza la guardia di recency: variable path con recentVarMean ≈ 333 →
    // coda gonfiata il mese dopo (regressione osservata su dati reali 2026-02).
    // Totali mensili variati (90/134/220) così periodic_fixed resta a
    // confidence 'low' (CV alto) e non intercetta il percorso prima del guard.
    const OLD_TOTALS: Record<number, number> = { 8: 90, 9: 134, 10: 220 };
    const txs: Transaction[] = [];
    for (const monthsAgo of [8, 9, 10]) {
      for (let j = 0; j < 4; j++) {
        txs.push(fxTx(`${fixtureMonthKey(monthsAgo)}-${String(3 + j * 7).padStart(2, '0')}`,
          OLD_TOTALS[monthsAgo] / 4, 'spike', `spk acq ${monthsAgo}-${j}`));
      }
    }
    txs.push(fxTx(`${fixtureMonthKey(1)}-12`, 1000, 'spike', 'spk picco isolato'));

    const result = computeForecastV3({
      transactions: txs, expenseCategories: cats,
      monthlyIncome: 0, monthlyInvestments: 0, now: FIXTURE_NOW,
    });
    const cat = result.categories.find(c => c.categoryId === 'spike')!;
    // Un mese attivo negli ultimi 6 → nessun pattern recente → rare_variable
    expect(cat.behavior).toBe('rare_variable');
    // La stima scalata per frequenza non deve ancorarsi al picco da 1000
    expect(cat.predictedVariableRemaining).toBeLessThan(300);
  });

  /**
   * FASE2-G2a — spike absorbed (unit)
   *
   * With robustMean(k=3.0) on n=3: a spike of €1080 with the other two months
   * at €400 and €530 gives robustMean ≈ 617 (spike only partially capped at
   * median+3×MAD=920). With median the estimate is 530 — the middle value —
   * and the spike no longer anchors the forecast for the following month.
   *
   * Real-data equivalent: Acquisti Jan 2026 spike (€1080 → reversion €90 in Feb).
   * Measured on real data (harness, 2026-06-10): Feb day-5 projection 320→309,
   * day-10 292→278, day-15 224→212. The improvement is smaller than the
   * variableAvg reduction (629→530) because the tail P75 cap was already the
   * binding constraint at early-month snapshots. Month MAE 2026-02: −6.8%.
   */
  it('FASE2-G2a (unit): recentVarMean median absorbs spike — [1080,400,530] → 530, not anchored to 1080', () => {
    const h = (key: string, total: number): MonthCatHistory =>
      ({ monthKey: key, variableTotal: total, variableCount: total > 0 ? 1 : 0, recurringTotal: 0 });
    const catHistory: Record<string, MonthCatHistory> = {
      '2026-01': h('2026-01', 1080), // spike month (most recent)
      '2025-12': h('2025-12', 400),
      '2025-11': h('2025-11', 530),
    };
    const stats = computeCatStats(catHistory, ['2026-01', '2025-12', '2025-11'], 1, []);

    // median([1080, 400, 530]) = sorted [400, 530, 1080] → 530
    // robustMean with k=3.0 would give 617 (spike partially capped but still inflating estimate)
    expect(stats.recentVarMean).toBe(530);
    expect(stats.recentVarMean).toBeLessThan(600); // spike (1080) has zero direct weight
  });

  /**
   * FASE2-G2b — genuine upward trend followed (unit)
   *
   * Requirement: using median must NOT flatten a genuine multi-month trend.
   * For an arithmetic progression [400→600→850] (recentKeys order: [850,600,400]),
   * median = mean = 600 (middle value of an arithmetic sequence).
   *
   * Acceptable lag definition (3-month window, documented):
   *   • recentVarMean must be ABOVE the trend's starting point (>400):
   *     confirms the model recognises the upward direction.
   *   • recentVarMean must be within 10% of the arithmetic mean (617):
   *     median(600) / mean(617) = 97.3% — well within tolerance.
   *   • Maximum acceptable lag relative to most recent month (850): ≤35%
   *     (600/850 = 70.6% → within range). Note: neither median nor robustMean
   *     can extrapolate a trend beyond the 3-month window; this is a structural
   *     limitation of short-window estimators, shared with the old estimator.
   */
  it('FASE2-G2b (unit): recentVarMean follows trend — median of [850,600,400]=600, within 10% of mean 617', () => {
    const h = (key: string, total: number): MonthCatHistory =>
      ({ monthKey: key, variableTotal: total, variableCount: total > 0 ? 2 : 0, recurringTotal: 0 });
    const catHistory: Record<string, MonthCatHistory> = {
      '2026-01': h('2026-01', 850), // most recent (highest — genuine trend peak)
      '2025-12': h('2025-12', 600),
      '2025-11': h('2025-11', 400), // oldest (lowest)
    };
    const stats = computeCatStats(catHistory, ['2026-01', '2025-12', '2025-11'], 1, []);

    const arithmeticMean = (850 + 600 + 400) / 3; // ≈ 616.7
    expect(stats.recentVarMean).toBeGreaterThan(400);       // above trend start
    expect(stats.recentVarMean).toBeLessThanOrEqual(850);   // not above most recent
    // Within 10% of arithmetic mean → trend not flattened (median=600, threshold=0.9×617≈555)
    expect(stats.recentVarMean).toBeGreaterThanOrEqual(arithmeticMean * 0.90);
  });

  it('M9b: det + var decomposition exact (±2 rounding) for clean deterministic+variable fixture', () => {
    // Design constraints:
    //   'r' — seriesId on day 3 so it is ALWAYS before snapshot day 5 (earliest snapshot).
    //         catScheduled=100 at all snapshots, catSchedFuture=0 → no locked-shortfall gap.
    //   'v' — active only in Apr 2026 (day 10, €100) and Mar 2026 (day 15, €200).
    //         → activeHistoryCount ≤ 2 in every backtest month → classified rare_variable.
    //         rare_variable uses catActualSoFar + predictedVariableRemaining, no locked shortfall.
    // Both sides of each error component track the same amounts → decomposition is exact.
    const cats: CategoryDef[] = [
      { id: 'r', label: 'Rec', icon: 'R', color: '#000', kind: 'expense' },
      { id: 'v', label: 'Var', icon: 'V', color: '#001', kind: 'expense' },
    ];
    const now = new Date(2026, 5, 15); // June 15 2026

    const txs: Transaction[] = [
      // 'r': 6 months history + current month, all on day 3 (always < snapshot day 5)
      ...Array.from({ length: 6 }, (_, k) =>
        fxTx(`${fixtureMonthKey(k + 1)}-03`, 100, 'r', 'rent', { seriesId: 'r-series' }),
      ),
      fxTx('2026-06-03', 100, 'r', 'rent', { seriesId: 'r-series' }),
      // 'v': only two historical occurrences so activeHistoryCount < 3 → rare_variable
      fxTx(`${fixtureMonthKey(2)}-10`, 100, 'v', 'rare-v-apr'),   // Apr 2026 (i=2)
      fxTx(`${fixtureMonthKey(3)}-15`, 200, 'v', 'rare-v-mar'),   // Mar 2026 (i=3)
    ];

    const result = runBacktestV3(txs, cats, now, 6);
    expect(result.snapshots.length).toBeGreaterThan(0);

    for (const snap of result.snapshots) {
      // Sign convention (always exact)
      expect(snap.error).toBe(snap.predicted - snap.actual);

      // Decomposition exact for this fixture: no locked-shortfall gap exists.
      // 'r' is always past before snapshot day 5 → scheduledFuture=0, detErr=0.
      // 'v' is rare_variable → variableRemaining flows through predictedVariable, not locked amount.
      const decomposedSum = snap.deterministicFutureError + snap.variableError;
      expect(Math.abs(decomposedSum - snap.error)).toBeLessThanOrEqual(2);
    }
  });
});
