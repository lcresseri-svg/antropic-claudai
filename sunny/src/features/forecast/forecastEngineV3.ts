/**
 * Forecast Engine V3
 *
 * Key improvements over V2:
 *   1. recurring_bundle: prevents double-counting for auto-detected subscriptions
 *   2. stale detection: zeroes forecast for categories that stopped ≥ 2 months ago
 *   3. fixed_monthly relaxed threshold (≥ 3/5 instead of 4/6)
 *   4. periodic_fixed gap-based interval detection (quarterly/semi-annual/annual)
 *   5. adjustedVariableAvg: subtracts already-scheduled amount from statistical baseline
 *   6. Confidence intervals per category based on behavior type
 *   7. Bias correction (applied externally via biasFactor param)
 *
 * V3 is independent of V2 — it does not import from forecastEngine.ts or forecastMode.ts.
 */
import { Transaction, CategoryDef, ownShare } from '../../types';
import { robustMean, lerp, median } from './forecastStats';
import { buildCategoryHistory, computeCatStats } from './forecastHistory';
import {
  ForecastComposition, TreatmentBreakdown,
  ForecastRule, PlannedBudgetItem,
} from './forecastTypes';
import {
  buildMerchantHistory, buildMerchantRecentMonths,
  normalizeMerchant, inferForecastTreatment,
} from './forecastTreatment';
import {
  inferCategoryBehaviorV3, detectFixedMonthlyV3,
  behaviorIntervalWidth,
} from './forecastBehaviorV3';
import { CategoryForecastV3, TotalForecastV3, CategoryBehaviorResult } from './forecastTypesV3';

// ── Constants ─────────────────────────────────────────────────────────────────

const LOOKBACK_MONTHS = 3;
const HISTORY_CUTOFF_MONTHS = 24;
const SEASONAL_MAX_WEIGHT = 0.35;
const SEASONAL_FULL_YEARS = 2;
const AMOUNT_ALPHA_MAX = 0.7;
const MIN_PROG_FOR_PACE = 0.08;

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthKeys(n: number, now: Date): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function monthProgress(now: Date): number {
  return Math.min(1, now.getDate() / daysInMonth(now.getFullYear(), now.getMonth()));
}

// ── Curve signals (identical to V2 — duplicated to keep V3 independent) ──────

function computeAmountCurve(
  variableNormalSpent: number,
  variableAvg: number,
  prog: number,
): { projectedMonthly: number; remaining: number; reliability: number } | null {
  if (variableAvg <= 0) return null;
  const expectedSoFar = prog * variableAvg;
  const paceMonthly = prog > 0 ? variableNormalSpent / prog : 0;
  const spendRatio = expectedSoFar > 0 ? variableNormalSpent / expectedSoFar : 1;
  const timeReliability = Math.min(1, prog / 0.2);
  const spendReliability = Math.min(1, spendRatio);
  const reliability = timeReliability * spendReliability;
  const w = Math.min(1, prog * prog);
  const projectedMonthly = w * paceMonthly + (1 - w) * variableAvg;
  const remaining = Math.max(0, 1 - prog) * projectedMonthly;
  return { projectedMonthly, remaining, reliability };
}

function computeCountCurve(
  variableNormalCount: number,
  avgMonthlyCount: number,
  medianTicket: number,
  prog: number,
): { projectedMonthly: number; remaining: number; reliability: number } | null {
  if (avgMonthlyCount <= 0 || medianTicket <= 0) return null;
  if (prog < MIN_PROG_FOR_PACE) return null;
  const paceCountMonthly = variableNormalCount / prog;
  const countRatio = paceCountMonthly / avgMonthlyCount;
  const reliability = Math.min(1, prog / 0.25) * Math.min(1.5, countRatio) / 1.5;
  const projectedCountMonthly = lerp(avgMonthlyCount, paceCountMonthly, Math.min(1, prog * 1.5));
  const projectedMonthly = projectedCountMonthly * medianTicket;
  const remaining = Math.max(0, projectedCountMonthly - variableNormalCount) * medianTicket;
  return { projectedMonthly, remaining, reliability: Math.max(0, Math.min(1, reliability)) };
}

// ── Tail-aware variable remaining estimator ───────────────────────────────────

/**
 * Blend three signals to estimate remaining variable spend.
 * Shifts weight from pace extrapolation (over-predicts late month) to
 * historical tail distributions and transaction exhaustion (more accurate days 20+).
 */
function computeVariableRemainingV3(
  paceRemaining: number,
  catVarCount: number,
  recentCountMean: number,
  medianTicket: number,
  dayOfMonth: number,
  tail: { median: number; p75: number; samples: number },
): number {
  // Transaction exhaustion guard: count is at/above expected → cap at tail median
  if (recentCountMean > 0 && catVarCount >= recentCountMean) {
    return Math.max(0, Math.min(paceRemaining, tail.median));
  }

  const expectedRemainingTx = Math.max(0, recentCountMean - catVarCount);
  const txSignal = expectedRemainingTx * medianTicket;

  // Blend weights shift from pace→tail as month progresses
  let wPace: number, wTail: number, wTx: number;
  if (dayOfMonth < 10)      { wPace = 0.65; wTail = 0.25; wTx = 0.10; }
  else if (dayOfMonth < 15) { wPace = 0.50; wTail = 0.35; wTx = 0.15; }
  else if (dayOfMonth < 20) { wPace = 0.35; wTail = 0.40; wTx = 0.25; }
  else if (dayOfMonth < 25) { wPace = 0.15; wTail = 0.55; wTx = 0.30; }
  else                      { wPace = 0.05; wTail = 0.55; wTx = 0.40; }

  const blended = wPace * paceRemaining + wTail * tail.median + wTx * txSignal;

  // Apply P75 cap scaled by day (prevents extreme tail estimates)
  if (tail.p75 > 0) {
    const tailMultiplier = dayOfMonth < 15 ? 1.25 : dayOfMonth <= 21 ? 1.10 : 1.00;
    return Math.max(0, Math.min(blended, tail.p75 * tailMultiplier));
  }

  return Math.max(0, blended);
}

// ── Input interface ───────────────────────────────────────────────────────────

export interface ForecastV3Input {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  avgIncome?: number;
  avgInvest?: number;
  upcomingIncome?: number;
  upcomingInvest?: number;
  plannedItems?: PlannedBudgetItem[];
  forecastRules?: ForecastRule[];
  categoryBudgets?: Record<string, number>;
  /** Pre-computed bias factor from backtest. Clamped to [0.75, 1.25]. Default 1.0. */
  biasFactor?: number;
  now?: Date;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function computeForecastV3(input: ForecastV3Input): TotalForecastV3 {
  const now = input.now ?? new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayISO = now.toISOString().slice(0, 10);
  const prog = monthProgress(now);
  const currentDay = now.getDate();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - HISTORY_CUTOFF_MONTHS, 1);
  const recentKeys = monthKeys(LOOKBACK_MONTHS, now);
  const fiveMonthKeys = monthKeys(5, now);
  const tailLookbackKeys = monthKeys(6, now);
  const catIds = new Set(input.expenseCategories.map(c => c.id));
  const currentMonth = now.getMonth();

  const plannedItems = input.plannedItems ?? [];
  const forecastRules = input.forecastRules ?? [];
  const categoryBudgets = input.categoryBudgets ?? {};
  const biasFactor = Math.max(0.75, Math.min(1.25, input.biasFactor ?? 1.0));
  const biasCorrectionApplied = biasFactor !== 1.0;

  // ── 1. Build category history ─────────────────────────────────────────────
  const history = buildCategoryHistory(input.transactions, catIds, curKey, cutoff);

  // ── 2. Collect recent tickets + detect explicit recurring ─────────────────
  const recentTickets: Record<string, number[]> = {};
  const categoriesWithExplicitRecurring = new Set<string>();
  for (const t of input.transactions) {
    if (t.type !== 'expense') continue;
    if (!catIds.has(t.category)) continue;
    if (t.seriesId || t.recurring) categoriesWithExplicitRecurring.add(t.category);
    const tKey = t.date.slice(0, 7);
    if (recentKeys.includes(tKey) && !t.seriesId && !t.recurring) {
      (recentTickets[t.category] ??= []).push(ownShare(t));
    }
  }

  // ── 3. Pre-compute per-category stats ─────────────────────────────────────
  const allCatStats: Record<string, ReturnType<typeof computeCatStats>> = {};
  for (const cat of input.expenseCategories) {
    allCatStats[cat.id] = computeCatStats(
      history[cat.id] ?? {},
      recentKeys,
      currentMonth,
      recentTickets[cat.id] ?? [],
    );
  }

  // ── 3b. Pre-compute per-category tail data ───────────────────────────────
  // For each historical month that had variable activity, sum variable spend
  // that occurred AFTER currentDay. The resulting distribution (median, P75)
  // becomes the "tail signal" fed to computeVariableRemainingV3.
  const catTailData: Record<string, { median: number; p75: number; samples: number }> = {};
  for (const cat of input.expenseCategories) {
    const tailAmounts: number[] = [];
    for (const key of tailLookbackKeys) {
      const monthEntry = history[cat.id]?.[key];
      if (!monthEntry || monthEntry.variableTotal <= 0) continue;
      const afterISO = `${key}-${String(currentDay).padStart(2, '0')}`;
      const tailSum = input.transactions.reduce((s, t) =>
        t.type === 'expense' && t.category === cat.id &&
        t.date.slice(0, 7) === key && t.date > afterISO &&
        !t.seriesId && !t.recurring
          ? s + ownShare(t) : s, 0);
      tailAmounts.push(tailSum);
    }
    if (tailAmounts.length === 0) {
      catTailData[cat.id] = { median: 0, p75: 0, samples: 0 };
    } else {
      const sorted = [...tailAmounts].sort((a, b) => a - b);
      const med = median(tailAmounts);
      const p75 = sorted[Math.min(Math.floor(sorted.length * 0.75), sorted.length - 1)] ?? 0;
      catTailData[cat.id] = { median: med, p75, samples: tailAmounts.length };
    }
  }

  // ── 4. Build merchant context ─────────────────────────────────────────────
  const merchantHistory = buildMerchantHistory(input.transactions);
  const merchantRecentMonthsMap = buildMerchantRecentMonths(input.transactions, recentKeys);

  // ── 4b. Pre-pass: index future scheduled txs for materialization check ───
  // If a past variable transaction matches a future scheduled one by merchant
  // and similar amount (±20%), the future scheduled is already materialized
  // and must not be double-counted.
  const futureScheduledIndex = new Map<string, Array<{
    tx: Transaction; norm: string; share: number; claimed: boolean;
  }>>();
  for (const t of input.transactions) {
    if (t.type !== 'expense') continue;
    if (!catIds.has(t.category)) continue;
    if (t.date.slice(0, 7) !== curKey) continue;
    if (t.date <= todayISO) continue;
    const norm = normalizeMerchant(t.description);
    const stats = allCatStats[t.category];
    const treatment = inferForecastTreatment(t, {
      merchantOccurrences: merchantHistory[norm] ?? [],
      medianTicket: stats.medianTicket,
      recentActiveMonths: stats.recentActiveMonths,
      merchantRecentMonths: merchantRecentMonthsMap[norm] ?? 0,
      plannedItems,
      forecastRules,
    });
    if (treatment !== 'scheduled_recurring') continue;
    const list = futureScheduledIndex.get(t.category) ?? [];
    list.push({ tx: t, norm, share: ownShare(t), claimed: false });
    futureScheduledIndex.set(t.category, list);
  }

  // ── 5. Classify current-month transactions ────────────────────────────────
  const makeBreakdown = (): TreatmentBreakdown => ({
    variableNormal: 0, scheduledRecurring: 0, plannedNormal: 0,
    plannedOneOff: 0, oneOffExtra: 0, transferExcluded: 0,
  });

  const actualVarNormal: Record<string, number> = {};
  const actualScheduled: Record<string, number> = {};
  const actualOneOff: Record<string, number> = {};
  const varNormalCount: Record<string, number> = {};
  const scheduledFutureBucket: Record<string, number> = {};
  const plannedNormalFuture: Record<string, number> = {};
  const plannedOneOffFuture: Record<string, number> = {};
  const breakdownMap: Record<string, TreatmentBreakdown> = {};

  const plannedCurrentMonthCats = new Set(
    plannedItems.filter(p => p.month === curKey).map(p => p.categoryId),
  );

  for (const t of input.transactions) {
    if (t.type !== 'expense') continue;
    if (!catIds.has(t.category)) continue;
    if (t.date.slice(0, 7) !== curKey) continue;

    const catId = t.category;
    const isFuture = t.date > todayISO;
    const share = ownShare(t);
    const norm = normalizeMerchant(t.description);
    const stats = allCatStats[catId];
    const treatment = inferForecastTreatment(t, {
      merchantOccurrences: merchantHistory[norm] ?? [],
      medianTicket: stats.medianTicket,
      recentActiveMonths: stats.recentActiveMonths,
      merchantRecentMonths: merchantRecentMonthsMap[norm] ?? 0,
      plannedItems,
      forecastRules,
    });

    const bd = (breakdownMap[catId] ??= makeBreakdown());

    if (isFuture) {
      switch (treatment) {
        case 'scheduled_recurring': {
          // Skip if already materialized by a matching past actual
          const fsEntry = futureScheduledIndex.get(catId)?.find(fs => fs.tx === t);
          if (!fsEntry?.claimed) {
            scheduledFutureBucket[catId] = (scheduledFutureBucket[catId] ?? 0) + share;
            bd.scheduledRecurring++;
          }
          break;
        }
        case 'planned_one_off':
        case 'one_off_extra':
          plannedOneOffFuture[catId] = (plannedOneOffFuture[catId] ?? 0) + share;
          treatment === 'planned_one_off' ? bd.plannedOneOff++ : bd.oneOffExtra++;
          break;
        case 'transfer_excluded':
          bd.transferExcluded++;
          break;
        default:
          plannedNormalFuture[catId] = (plannedNormalFuture[catId] ?? 0) + share;
          treatment === 'planned_normal' ? bd.plannedNormal++ : bd.variableNormal++;
      }
    } else {
      switch (treatment) {
        case 'variable_normal':
        case 'planned_normal': {
          // Check if this past actual materializes a future scheduled transaction.
          // If merchant and amount match (±20%), reclassify as scheduled so the
          // future occurrence is not double-counted.
          const fsList = futureScheduledIndex.get(catId);
          const matched = fsList?.find(fs =>
            !fs.claimed && fs.norm === norm &&
            share > 0 && fs.share > 0 &&
            share / fs.share >= 0.80 && share / fs.share <= 1.25,
          );
          if (matched) {
            matched.claimed = true;
            actualScheduled[catId] = (actualScheduled[catId] ?? 0) + share;
            bd.scheduledRecurring++;
          } else {
            actualVarNormal[catId] = (actualVarNormal[catId] ?? 0) + share;
            varNormalCount[catId] = (varNormalCount[catId] ?? 0) + 1;
            treatment === 'planned_normal' ? bd.plannedNormal++ : bd.variableNormal++;
          }
          break;
        }
        case 'scheduled_recurring':
          actualScheduled[catId] = (actualScheduled[catId] ?? 0) + share;
          bd.scheduledRecurring++;
          break;
        case 'planned_one_off':
          actualOneOff[catId] = (actualOneOff[catId] ?? 0) + share;
          bd.plannedOneOff++;
          break;
        case 'one_off_extra':
          actualOneOff[catId] = (actualOneOff[catId] ?? 0) + share;
          bd.oneOffExtra++;
          break;
        case 'transfer_excluded':
          bd.transferExcluded++;
          break;
      }
    }
  }

  // ── 6. Per-category behavior inference + projections ─────────────────────
  const categoryForecasts: CategoryForecastV3[] = [];

  for (const cat of input.expenseCategories) {
    const catId = cat.id;
    const stats = allCatStats[catId];
    const catHistory = history[catId] ?? {};
    const allHistoryKeys = Object.keys(catHistory).sort();

    const catVarNormal = actualVarNormal[catId] ?? 0;
    const catVarCount = varNormalCount[catId] ?? 0;
    const catScheduled = actualScheduled[catId] ?? 0;
    const catOneOff = actualOneOff[catId] ?? 0;
    const catSchedFuture = scheduledFutureBucket[catId] ?? 0;
    const catPlannedNormalFuture = plannedNormalFuture[catId] ?? 0;
    const catPlannedOneOffFuture = plannedOneOffFuture[catId] ?? 0;
    const catActualSoFar = catVarNormal + catScheduled + catOneOff;
    const catTotalNormal = catVarNormal + catScheduled + catSchedFuture + catPlannedNormalFuture;

    // Infer behavior (requires treatment results from step 5)
    const behaviorResult: CategoryBehaviorResult = inferCategoryBehaviorV3({
      catHistory,
      allHistoryKeys,
      fiveMonthKeys,
      recentKeys,
      currentCalendarMonth: currentMonth,
      budgetAmount: categoryBudgets[catId],
      hasExplicitRecurring: categoriesWithExplicitRecurring.has(catId),
      plannedCurrentMonth: plannedCurrentMonthCats.has(catId),
      currentMonthActualScheduled: catScheduled,
      currentMonthActualVarNormal: catVarNormal,
      currentMonthVarNormalCount: catVarCount,
    });

    const behavior = behaviorResult.behavior;

    // ── Seasonal blend for variable average ───────────────────────────────
    let variableAvg = 0;
    if (stats.recentVarMean > 0 && stats.seasonalMean > 0) {
      const sw = SEASONAL_MAX_WEIGHT * Math.min(1, stats.seasonalYears / SEASONAL_FULL_YEARS);
      variableAvg = stats.recentVarMean * (1 - sw) + stats.seasonalMean * sw;
    } else {
      variableAvg = stats.recentVarMean > 0 ? stats.recentVarMean : stats.seasonalMean;
    }

    // V3 KEY FIX: adjust variable baseline by already-scheduled amount.
    // If subscriptions were historically counted as "variable" but are now
    // detected as scheduled_recurring, subtract them from the baseline.
    const adjustedVariableAvg = Math.max(0, variableAvg - catScheduled - catSchedFuture);

    let projected = 0;
    let predictedVariableRemaining = 0;
    let blendAlpha = 0;
    let reliability = 0;
    let explanation = '';
    let amtCurveRemaining = 0;
    let cntCurveRemaining = 0;

    // ── Branch by behavior ────────────────────────────────────────────────
    if (behavior === 'recurring') {
      const lockedAmount = behaviorResult.expectedAmount ?? catTotalNormal;
      const normalProjected = Math.max(catTotalNormal, lockedAmount);
      predictedVariableRemaining = 0;
      projected = Math.round(normalProjected + catOneOff + catPlannedOneOffFuture);
      reliability = 0.95;
      explanation = `${cat.label}: ricorrente fissa a ~${Math.round(lockedAmount)}€/mese.`;

    } else if (behavior === 'recurring_bundle') {
      // All current-month spend is auto-detected recurring.
      // No statistical prediction on top — this is the core V3 anti-double-count fix.
      const expectedMonthly = behaviorResult.expectedAmount ?? catActualSoFar;
      const normalProjected = Math.max(catActualSoFar + catSchedFuture, expectedMonthly);
      predictedVariableRemaining = 0;
      projected = Math.round(normalProjected + catOneOff + catPlannedOneOffFuture);
      reliability = 0.90;
      explanation = `${cat.label}: bundle di abbonamenti ricorrenti (~${Math.round(expectedMonthly)}€/mese). Nessuna spesa variabile aggiuntiva prevista.`;

    } else if (behavior === 'fixed_monthly') {
      const lockedAmount = behaviorResult.expectedAmount ?? catTotalNormal;
      const normalProjected = Math.max(catTotalNormal, lockedAmount);
      predictedVariableRemaining = 0;
      projected = Math.round(normalProjected + catOneOff + catPlannedOneOffFuture);
      reliability = 0.90;
      explanation = `${cat.label}: spesa fissa mensile ~${Math.round(lockedAmount)}€.`;

    } else if (behavior === 'periodic_fixed') {
      const isActiveMonth = (behaviorResult.activeMonths ?? []).includes(currentMonth);
      const expectedAmount = behaviorResult.expectedAmount ?? 0;

      if (!isActiveMonth) {
        predictedVariableRemaining = 0;
        projected = Math.round(catActualSoFar + catPlannedOneOffFuture);
        reliability = 0.93;
        const intLabel = behaviorResult.interval === 'quarterly' ? 'trimestrale' :
          behaviorResult.interval === 'semi_annual' ? 'semestrale' : 'periodica';
        explanation = `${cat.label}: spesa ${intLabel} — non attesa questo mese.`;
      } else {
        const normalProjected = Math.max(catTotalNormal, expectedAmount);
        predictedVariableRemaining = 0;
        projected = Math.round(normalProjected + catOneOff + catPlannedOneOffFuture);
        reliability = 0.85;
        explanation = `${cat.label}: spesa periodica ~${Math.round(expectedAmount)}€ prevista questo mese.`;
      }

    } else if (behavior === 'hybrid') {
      const fixedPart = behaviorResult.fixedAmount ?? 0;
      const ac = computeAmountCurve(catVarNormal, adjustedVariableAvg > 0 ? adjustedVariableAvg : variableAvg, prog);
      const cc = computeCountCurve(catVarCount, stats.recentCountMean, stats.medianTicket, prog);

      let blendedVariable = 0;
      if (ac && cc) {
        blendAlpha = Math.min(AMOUNT_ALPHA_MAX, prog * AMOUNT_ALPHA_MAX / 0.6);
        blendedVariable = blendAlpha * ac.projectedMonthly + (1 - blendAlpha) * cc.projectedMonthly;
        amtCurveRemaining = ac.remaining;
        cntCurveRemaining = cc.remaining;
        reliability = 0.7 * (blendAlpha * ac.reliability + (1 - blendAlpha) * cc.reliability);
      } else if (ac) {
        blendAlpha = 1; blendedVariable = ac.projectedMonthly; amtCurveRemaining = ac.remaining;
        reliability = 0.7 * ac.reliability;
      } else if (cc) {
        blendAlpha = 0; blendedVariable = cc.projectedMonthly; cntCurveRemaining = cc.remaining;
        reliability = 0.7 * cc.reliability;
      } else if (variableAvg > 0) {
        blendedVariable = adjustedVariableAvg > 0 ? adjustedVariableAvg : variableAvg;
        reliability = 0.1;
      }

      const paceRemainingH = Math.max(0, blendedVariable - catVarNormal - catPlannedNormalFuture);
      predictedVariableRemaining = computeVariableRemainingV3(
        paceRemainingH, catVarCount, stats.recentCountMean, stats.medianTicket,
        currentDay, catTailData[catId] ?? { median: 0, p75: 0, samples: 0 },
      );
      projected = Math.round(catActualSoFar + catSchedFuture + catPlannedNormalFuture + catPlannedOneOffFuture + predictedVariableRemaining);
      reliability = Math.max(0.1, reliability);
      explanation = `${cat.label}: parte fissa ~${Math.round(fixedPart)}€ + parte variabile stimata.`;

    } else if (behavior === 'stale') {
      // Category appears to have stopped → predict only what's already recorded
      predictedVariableRemaining = 0;
      projected = Math.round(catActualSoFar + catSchedFuture + catPlannedOneOffFuture);
      reliability = 0.80;
      const lastKey = behaviorResult.lastActiveKey ?? '?';
      explanation = `${cat.label}: nessuna spesa da ${lastKey}. Previsione: solo voci già registrate.`;

    } else {
      // variable_frequent / variable_sparse / volatile_mixed / unknown
      const useAvg = adjustedVariableAvg > 0 ? adjustedVariableAvg : variableAvg;
      const ac = computeAmountCurve(catVarNormal, useAvg, prog);
      const cc = computeCountCurve(catVarCount, stats.recentCountMean, stats.medianTicket, prog);

      let blendedProjectedMonthly = 0;
      if (ac && cc) {
        blendAlpha = Math.min(AMOUNT_ALPHA_MAX, prog * AMOUNT_ALPHA_MAX / 0.6);
        blendedProjectedMonthly = blendAlpha * ac.projectedMonthly + (1 - blendAlpha) * cc.projectedMonthly;
        amtCurveRemaining = ac.remaining; cntCurveRemaining = cc.remaining;
        reliability = blendAlpha * ac.reliability + (1 - blendAlpha) * cc.reliability;
      } else if (ac) {
        blendAlpha = 1; blendedProjectedMonthly = ac.projectedMonthly;
        amtCurveRemaining = ac.remaining; reliability = ac.reliability;
      } else if (cc) {
        blendAlpha = 0; blendedProjectedMonthly = cc.projectedMonthly;
        cntCurveRemaining = cc.remaining; reliability = cc.reliability;
      } else if (useAvg > 0) {
        blendedProjectedMonthly = useAvg; reliability = 0.1;
        explanation = `${cat.label}: stima basata sulla media storica (nessun dato ancora questo mese).`;
      }

      if (behavior === 'volatile_mixed') reliability *= 0.5;

      const paceRemainingV = Math.max(
        0, blendedProjectedMonthly - catVarNormal - catPlannedNormalFuture,
      );
      predictedVariableRemaining = computeVariableRemainingV3(
        paceRemainingV, catVarCount, stats.recentCountMean, stats.medianTicket,
        currentDay, catTailData[catId] ?? { median: 0, p75: 0, samples: 0 },
      );
      projected = Math.round(
        catActualSoFar + catSchedFuture + catPlannedNormalFuture +
        catPlannedOneOffFuture + predictedVariableRemaining,
      );

      if (!explanation) {
        const pct = Math.round(prog * 100);
        const ratio = catVarNormal / (useAvg * prog + 0.001);
        if (ratio > 1.3) explanation = `${cat.label}: ritmo +${Math.round((ratio - 1) * 100)}% sopra la media.`;
        else if (ratio < 0.7) explanation = `${cat.label}: ritmo basso (${pct}% del mese trascorso).`;
        else explanation = `${cat.label}: ritmo in linea con la media storica.`;
      }
    }

    // ── Apply bias correction — ONLY to predictedVariableRemaining ───────────
    // Deterministic components (actuals, scheduled, locked amounts, periodic
    // expectations, one-offs) are never touched. If a fixed category is
    // predicted wrong, the fix is better classification, not bias scaling.
    // Bias applies only to the statistical variable estimate.
    const projectedRaw = projected;
    const biasApplicable =
      behavior === 'variable_frequent' ||
      behavior === 'variable_sparse' ||
      behavior === 'volatile_mixed' ||
      behavior === 'hybrid';
    const biasCorrection = (biasCorrectionApplied && biasApplicable) ? biasFactor : 1.0;

    if (biasCorrection !== 1.0 && predictedVariableRemaining > 0) {
      const calibrated = Math.round(predictedVariableRemaining * biasCorrection);
      // Recompute projected: swap out the old variable estimate for the corrected one
      projected = projected - predictedVariableRemaining + calibrated;
      predictedVariableRemaining = calibrated;
    }

    // ── Confidence interval ───────────────────────────────────────────────
    const halfWidth = behaviorIntervalWidth(behavior);
    const projectedLow = Math.round(Math.max(0, projected * (1 - halfWidth)));
    const projectedHigh = Math.round(projected * (1 + halfWidth));

    const composition: ForecastComposition = {
      actualVariableNormalSoFar: Math.round(catVarNormal),
      actualScheduledSoFar: Math.round(catScheduled),
      actualOneOffSoFar: Math.round(catOneOff),
      scheduledFuture: Math.round(catSchedFuture),
      plannedNormalFuture: Math.round(catPlannedNormalFuture),
      plannedOneOffFuture: Math.round(catPlannedOneOffFuture),
      predictedVariableRemaining: Math.round(predictedVariableRemaining),
    };

    categoryForecasts.push({
      categoryId: catId,
      behavior,
      behaviorResult,
      actualSoFar: Math.round(catActualSoFar),
      scheduledFuture: Math.round(catSchedFuture),
      plannedFuture: Math.round(catPlannedNormalFuture + catPlannedOneOffFuture),
      amountCurveRemaining: Math.round(amtCurveRemaining),
      countCurveRemaining: Math.round(cntCurveRemaining),
      predictedVariableRemaining: Math.round(predictedVariableRemaining),
      projected,
      projectedRaw,
      biasCorrection,
      projectedLow,
      projectedHigh,
      blendAlpha,
      reliability: Math.max(0, Math.min(1, reliability)),
      explanation,
      composition,
      treatmentBreakdown: breakdownMap[catId] ?? makeBreakdown(),
    });
  }

  // ── 7. Totals ─────────────────────────────────────────────────────────────
  const projectedExpenses = categoryForecasts.reduce((s, c) => s + c.projected, 0);
  const committedIncome = input.monthlyIncome + Math.max(0, input.upcomingIncome ?? 0);
  const committedInvest = input.monthlyInvestments + Math.max(0, input.upcomingInvest ?? 0);
  const expectedIncome = Math.round(Math.max(committedIncome, input.avgIncome ?? 0));
  const expectedInvest = Math.round(Math.max(committedInvest, input.avgInvest ?? 0));
  const savings = expectedIncome - projectedExpenses - expectedInvest;

  const totalProjected = projectedExpenses || 1;
  const overallReliability = categoryForecasts.reduce(
    (s, c) => s + (c.reliability * c.projected) / totalProjected, 0,
  );

  return {
    projectedExpenses,
    expectedIncome,
    expectedInvest,
    savings,
    categories: categoryForecasts,
    overallReliability: Math.max(0, Math.min(1, overallReliability)),
    biasCorrectionApplied,
    biasFactor,
  };
}

// ── Income/investment helpers ─────────────────────────────────────────────────

export function medianMonthlyFlowV3(
  transactions: Transaction[],
  type: 'income' | 'investment',
  now: Date = new Date(),
  months = 3,
): number {
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const byMonth: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== type) continue;
    const key = t.date.slice(0, 7);
    if (key >= curKey) continue;
    byMonth[key] = (byMonth[key] ?? 0) + ownShare(t);
  }
  const recent = Object.entries(byMonth)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, months)
    .map(([, v]) => v);
  return median(recent);
}
