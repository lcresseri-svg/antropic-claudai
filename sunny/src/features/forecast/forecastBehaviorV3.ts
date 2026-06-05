/**
 * Category behavior classification for Forecast Engine V3.
 *
 * Key improvements over V2:
 *   - `recurring_bundle`: prevents double-counting when auto-detected recurring
 *     merchants were historically tracked as variable spend.
 *   - `stale`: zeroes-out categories that stopped ≥ 2 months ago.
 *   - `fixed_monthly`: relaxed threshold (≥ 3/5 months, down from 4/6).
 *   - `periodic_fixed`: gap-based interval detection (quarterly / semi-annual / annual).
 *
 * All functions are pure — no Firestore calls, no React.
 */
import { median, mad } from './forecastStats';
import { MonthCatHistory } from './forecastHistory';
import { CategoryBehavior, CategoryBehaviorResult, PeriodicInterval } from './forecastTypesV3';

// ── Constants ─────────────────────────────────────────────────────────────────

const FIXED_WINDOW = 5;
const FIXED_MIN_ACTIVE = 3;
const FIXED_MAX_CV = 0.15;
const FIXED_MAX_MED_COUNT = 2.5;
const BUNDLE_MAX_CV = 0.20;
const STALE_INACTIVE_MONTHS = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthTotal(h: MonthCatHistory | undefined): number {
  return h ? h.variableTotal + h.recurringTotal : 0;
}

function robustCV(values: number[]): number {
  if (values.length < 2) return 0;
  const m = median(values);
  if (m <= 0) return 1;
  return mad(values) / m;
}

// ── Stale detection ───────────────────────────────────────────────────────────

/**
 * A category is stale when it was active historically but has had zero activity
 * in the last `STALE_INACTIVE_MONTHS` months — and there is no budget or planned
 * item confirming it should still be active.
 */
export function detectStaleCategoryV3(params: {
  catHistory: Record<string, MonthCatHistory>;
  recentKeys: string[];
  budgetAmount?: number;
  hasPlanningCurrentMonth?: boolean;
}): { isStale: boolean; lastActiveKey?: string; reasons: string[] } {
  if ((params.budgetAmount ?? 0) > 0) return { isStale: false, reasons: [] };
  if (params.hasPlanningCurrentMonth) return { isStale: false, reasons: [] };

  const allKeys = Object.keys(params.catHistory).sort().reverse();
  const lastActiveKey = allKeys.find(k => monthTotal(params.catHistory[k]) > 0);
  if (!lastActiveKey) return { isStale: false, reasons: [] };

  const inactiveRecent = params.recentKeys.filter(k => monthTotal(params.catHistory[k]) === 0).length;
  if (inactiveRecent >= STALE_INACTIVE_MONTHS) {
    return {
      isStale: true,
      lastActiveKey,
      reasons: [
        `Inattiva negli ultimi ${inactiveRecent} mesi (ultimo: ${lastActiveKey})`,
        'Nessun budget o pianificazione → previsione azzerata',
      ],
    };
  }

  return { isStale: false, reasons: [] };
}

// ── Periodic interval detection ───────────────────────────────────────────────

function detectGapInterval(activeKeys: string[]): { interval: PeriodicInterval; intervalMonths: number } {
  if (activeKeys.length < 2) return { interval: 'irregular', intervalMonths: 0 };

  const sorted = [...activeKeys].sort();
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const [yp, mp] = sorted[i - 1].split('-').map(Number);
    const [yc, mc] = sorted[i].split('-').map(Number);
    gaps.push((yc - yp) * 12 + (mc - mp));
  }

  const med = median(gaps);
  if (Math.abs(med - 3) <= 1) return { interval: 'quarterly', intervalMonths: 3 };
  if (Math.abs(med - 6) <= 1.5) return { interval: 'semi_annual', intervalMonths: 6 };
  if (Math.abs(med - 12) <= 2) return { interval: 'annual', intervalMonths: 12 };
  return { interval: 'irregular', intervalMonths: Math.round(med) };
}

/**
 * Detect regular non-monthly payment cadence using occurrence gap analysis.
 * More robust than V2's calendar-month concentration because it works even
 * when payment months shift slightly year to year.
 */
export function detectPeriodicFixedV3(params: {
  catHistory: Record<string, MonthCatHistory>;
  allHistoryKeys: string[];
  currentCalendarMonth: number;
  budgetAmount?: number;
}): {
  isPeriodic: boolean;
  interval: PeriodicInterval;
  intervalMonths: number;
  activeMonths: number[];
  nextExpectedCalendarMonth?: number;
  expectedAmount?: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
} {
  const no = {
    isPeriodic: false, interval: 'irregular' as PeriodicInterval, intervalMonths: 0,
    activeMonths: [], confidence: 'low' as const, reasons: [] as string[],
  };

  if (params.allHistoryKeys.length < 4) return no;

  const activeKeys = params.allHistoryKeys.filter(k => monthTotal(params.catHistory[k]) > 0);
  if (activeKeys.length < 2) return no;

  const spendRatio = activeKeys.length / params.allHistoryKeys.length;
  // More than 50% of months active → not periodic (too frequent)
  if (spendRatio > 0.50) return no;

  const { interval, intervalMonths } = detectGapInterval(activeKeys);
  if (intervalMonths === 0) return no;

  const allAmounts = activeKeys.map(k => monthTotal(params.catHistory[k]));
  const cv = robustCV(allAmounts);
  const histMedian = median(allAmounts);

  const expectedAmount = params.budgetAmount && params.budgetAmount > 0 &&
    Math.abs(params.budgetAmount - histMedian) / histMedian <= 0.25
    ? params.budgetAmount
    : histMedian;

  // Calendar months that historically had activity
  const activeCalMonths = [...new Set(activeKeys.map(k => parseInt(k.slice(5, 7), 10) - 1))]
    .sort((a, b) => a - b);

  // Next expected calendar month: last active + interval
  const lastActive = [...activeKeys].sort().pop()!;
  const [ly, lm] = lastActive.split('-').map(Number);
  const nextDate = new Date(ly, (lm - 1) + intervalMonths, 1);
  const nextExpectedCalendarMonth = nextDate.getMonth();

  const confidence: 'low' | 'medium' | 'high' =
    cv < 0.15 ? 'high' : cv < 0.30 ? 'medium' : 'low';

  const intervalLabel =
    interval === 'quarterly' ? 'trimestrale' :
    interval === 'semi_annual' ? 'semestrale' :
    interval === 'annual' ? 'annuale' :
    `ogni ~${intervalMonths} mesi`;

  return {
    isPeriodic: true, interval, intervalMonths, activeMonths: activeCalMonths,
    nextExpectedCalendarMonth, expectedAmount, confidence,
    reasons: [
      `${activeKeys.length}/${params.allHistoryKeys.length} mesi attivi (${Math.round(spendRatio * 100)}%)`,
      `Cadenza ${intervalLabel} (gap mediano ${intervalMonths} mesi)`,
      cv < 0.20
        ? `Importo stabile (CV=${cv.toFixed(2)})`
        : `Importo variabile (CV=${cv.toFixed(2)})`,
    ],
  };
}

// ── Recurring bundle detection ─────────────────────────────────────────────────

/**
 * A recurring_bundle is a category whose transactions are classified as
 * `scheduled_recurring` in the current month by the treatment classifier
 * (because the merchants appeared repeatedly), but historically those same
 * transactions were tracked in `variableTotal` (no seriesId/recurring flag).
 *
 * Without this detection, V2 would add `actualScheduled` (e.g. 150€) PLUS
 * a statistical `predictedVariableRemaining` also at ~150€, doubling the forecast.
 *
 * Typical example: "Abbonamenti" containing Netflix, Spotify, Palestra — each
 * recurring monthly, none with a seriesId because they were added manually.
 */
export function detectRecurringBundleV3(params: {
  catHistory: Record<string, MonthCatHistory>;
  recentKeys: string[];
  currentMonthActualScheduled: number;
  currentMonthActualVarNormal: number;
  currentMonthVarNormalCount: number;
}): { isBundle: boolean; reasons: string[] } {
  if (params.currentMonthActualScheduled <= 0) return { isBundle: false, reasons: [] };
  if (params.currentMonthActualVarNormal > 0 || params.currentMonthVarNormalCount > 0) {
    return { isBundle: false, reasons: [] };
  }

  const recentRecurring = params.recentKeys.map(k => params.catHistory[k]?.recurringTotal ?? 0);
  const recentVariable = params.recentKeys.map(k => params.catHistory[k]?.variableTotal ?? 0);

  const hasRecurringHistory = recentRecurring.some(v => v > 0);
  const hasVariableHistory = recentVariable.some(v => v > 0);

  if (!hasVariableHistory && !hasRecurringHistory) return { isBundle: false, reasons: [] };
  if (hasRecurringHistory) return { isBundle: false, reasons: [] }; // properly tracked → not a bundle issue

  // Historical spend was in variableTotal but current month auto-detected as recurring
  const varAmounts = recentVariable.filter(v => v > 0);
  const cv = varAmounts.length >= 2 ? robustCV(varAmounts) : 0;

  if (cv > BUNDLE_MAX_CV) {
    return {
      isBundle: false,
      reasons: [`Storico variabile irregolare (CV=${cv.toFixed(2)}) — non è un bundle`],
    };
  }

  return {
    isBundle: true,
    reasons: [
      'Spesa del mese interamente classificata come ricorrente auto-rilevata',
      `Storico in variableTotal stabile (CV=${cv.toFixed(2)}) → previsione statistica disabilitata (anti-doppio-conteggio)`,
    ],
  };
}

// ── Fixed monthly detection (V3 relaxed threshold) ───────────────────────────

export function detectFixedMonthlyV3(params: {
  catHistory: Record<string, MonthCatHistory>;
  fiveMonthKeys: string[];
  budgetAmount?: number;
  hasExplicitRecurring: boolean;
}): { isFixed: boolean; lockedAmount?: number; confidence: 'low' | 'medium' | 'high'; reasons: string[] } {
  const { catHistory, fiveMonthKeys, budgetAmount, hasExplicitRecurring } = params;

  if (hasExplicitRecurring) {
    const totals = fiveMonthKeys.map(k => monthTotal(catHistory[k])).filter(v => v > 0);
    const med = totals.length > 0 ? median(totals) : 0;
    const locked = budgetAmount && med > 0 && Math.abs(budgetAmount - med) / med <= 0.10
      ? budgetAmount
      : (med > 0 ? med : budgetAmount);
    return {
      isFixed: true, lockedAmount: locked, confidence: 'high',
      reasons: ['Ricorrenza esplicita (seriesId/recurring)'],
    };
  }

  const monthlyTotals = fiveMonthKeys.map(k => monthTotal(catHistory[k]));
  const nonZeroTotals = monthlyTotals.filter(v => v > 0);
  const activeCount = nonZeroTotals.length;

  if (activeCount < FIXED_MIN_ACTIVE) {
    return {
      isFixed: false, confidence: 'low',
      reasons: [`${activeCount}/${FIXED_WINDOW} mesi attivi (soglia: ${FIXED_MIN_ACTIVE})`],
    };
  }

  const cv = robustCV(nonZeroTotals);
  if (cv >= FIXED_MAX_CV) {
    return {
      isFixed: false, confidence: 'low',
      reasons: [`Variabilità troppo alta (CV=${cv.toFixed(2)}, soglia ${FIXED_MAX_CV})`],
    };
  }

  const varCounts = fiveMonthKeys.map(k => catHistory[k]?.variableCount ?? 0).filter(c => c > 0);
  const medCount = varCounts.length > 0 ? median(varCounts) : 0;
  if (medCount > FIXED_MAX_MED_COUNT) {
    return {
      isFixed: false, confidence: 'low',
      reasons: [`Troppo frequente (mediana=${medCount.toFixed(1)} tx/mese)`],
    };
  }

  const medTotal = median(nonZeroTotals);
  let lockedAmount = medTotal;
  let confidence: 'low' | 'medium' | 'high' = 'medium';

  if (budgetAmount && budgetAmount > 0 && Math.abs(budgetAmount - medTotal) / medTotal <= 0.10) {
    lockedAmount = budgetAmount;
    confidence = 'high';
  }

  return {
    isFixed: true, lockedAmount, confidence,
    reasons: [
      `${activeCount}/${FIXED_WINDOW} mesi attivi, importo stabile (CV=${cv.toFixed(2)})`,
      confidence === 'high' ? `Budget (${Math.round(budgetAmount!)}€) conferma mediana (${Math.round(medTotal)}€)` : '',
    ].filter(Boolean),
  };
}

// ── Main behavior inference ───────────────────────────────────────────────────

/**
 * Decide the V3 behavior for one expense category.
 *
 * Priority:
 *   recurring → recurring_bundle → fixed_monthly → periodic_fixed →
 *   hybrid → stale → variable_frequent / variable_sparse / volatile_mixed →
 *   unknown
 *
 * NOTE: `currentMonthActual*` fields come from the treatment classification
 * loop and must be computed BEFORE calling this function.
 */
export function inferCategoryBehaviorV3(params: {
  catHistory: Record<string, MonthCatHistory>;
  allHistoryKeys: string[];
  fiveMonthKeys: string[];
  recentKeys: string[];
  currentCalendarMonth: number;
  budgetAmount?: number;
  hasExplicitRecurring: boolean;
  plannedCurrentMonth: boolean;
  currentMonthActualScheduled: number;
  currentMonthActualVarNormal: number;
  currentMonthVarNormalCount: number;
}): CategoryBehaviorResult {
  const {
    catHistory, allHistoryKeys, fiveMonthKeys, recentKeys,
    currentCalendarMonth, budgetAmount, hasExplicitRecurring, plannedCurrentMonth,
    currentMonthActualScheduled, currentMonthActualVarNormal, currentMonthVarNormalCount,
  } = params;

  if (allHistoryKeys.length < 2) {
    return { behavior: 'unknown', confidence: 'low', reasons: ['Storia insufficiente'] };
  }

  // ── 1. Explicit recurring ──────────────────────────────────────────────────
  if (hasExplicitRecurring) {
    const recTotals = fiveMonthKeys.map(k => catHistory[k]?.recurringTotal ?? 0).filter(v => v > 0);
    const varTotals = fiveMonthKeys.map(k => catHistory[k]?.variableTotal ?? 0).filter(v => v > 0);
    const fixedMedian = recTotals.length > 0 ? median(recTotals) : 0;
    const varMedian = varTotals.length > 0 ? median(varTotals) : 0;

    if (varMedian > fixedMedian * 0.20 && varTotals.length >= 2) {
      return {
        behavior: 'hybrid',
        confidence: 'high',
        reasons: [
          `Ricorrente esplicita ~${Math.round(fixedMedian)}€/mese`,
          `+ parte variabile ~${Math.round(varMedian)}€/mese (${Math.round(varMedian / (fixedMedian + varMedian + 0.001) * 100)}%)`,
        ],
        fixedAmount: fixedMedian,
        variableAmount: varMedian,
        expectedAmount: fixedMedian,
      };
    }

    const fixed = detectFixedMonthlyV3({ catHistory, fiveMonthKeys, budgetAmount, hasExplicitRecurring });
    return {
      behavior: 'recurring',
      confidence: 'high',
      reasons: fixed.reasons,
      expectedAmount: fixed.lockedAmount,
    };
  }

  // ── 2. Recurring bundle (anti-double-count) ────────────────────────────────
  const bundle = detectRecurringBundleV3({
    catHistory, recentKeys,
    currentMonthActualScheduled, currentMonthActualVarNormal, currentMonthVarNormalCount,
  });
  if (bundle.isBundle) {
    const recentAmounts = recentKeys.map(k => monthTotal(catHistory[k])).filter(v => v > 0);
    const expectedAmount = recentAmounts.length > 0 ? median(recentAmounts) : currentMonthActualScheduled;
    return {
      behavior: 'recurring_bundle',
      confidence: 'high',
      reasons: bundle.reasons,
      expectedAmount,
      activeMonths: [...new Set(
        Object.keys(catHistory)
          .filter(k => monthTotal(catHistory[k]) > 0)
          .map(k => parseInt(k.slice(5, 7), 10) - 1),
      )].sort((a, b) => a - b),
    };
  }

  // ── 3. Fixed monthly (relaxed: ≥3/5 months) ───────────────────────────────
  const fixed = detectFixedMonthlyV3({ catHistory, fiveMonthKeys, budgetAmount, hasExplicitRecurring: false });
  if (fixed.isFixed && fixed.confidence !== 'low') {
    const stale = detectStaleCategoryV3({ catHistory, recentKeys, budgetAmount, hasPlanningCurrentMonth: plannedCurrentMonth });
    if (stale.isStale) {
      return {
        behavior: 'stale', confidence: 'medium',
        reasons: stale.reasons,
        isStale: true, lastActiveKey: stale.lastActiveKey,
        expectedAmount: fixed.lockedAmount,
      };
    }
    return {
      behavior: 'fixed_monthly',
      confidence: fixed.confidence,
      reasons: fixed.reasons,
      expectedAmount: fixed.lockedAmount,
    };
  }

  // ── 4. Periodic fixed (gap-based interval detection) ─────────────────────
  const periodic = detectPeriodicFixedV3({ catHistory, allHistoryKeys, currentCalendarMonth, budgetAmount });
  if (periodic.isPeriodic && periodic.confidence !== 'low') {
    return {
      behavior: 'periodic_fixed',
      confidence: periodic.confidence,
      reasons: periodic.reasons,
      interval: periodic.interval,
      intervalMonths: periodic.intervalMonths,
      activeMonths: periodic.activeMonths,
      nextExpectedCalendarMonth: periodic.nextExpectedCalendarMonth,
      expectedAmount: periodic.expectedAmount,
    };
  }

  // ── Stale check for variable behaviors ────────────────────────────────────
  const stale = detectStaleCategoryV3({ catHistory, recentKeys, budgetAmount, hasPlanningCurrentMonth: plannedCurrentMonth });
  if (stale.isStale) {
    return {
      behavior: 'stale', confidence: 'medium',
      reasons: stale.reasons,
      isStale: true, lastActiveKey: stale.lastActiveKey,
    };
  }

  // ── 5. Variable behaviors ─────────────────────────────────────────────────
  if (allHistoryKeys.length < 3) {
    return { behavior: 'unknown', confidence: 'low', reasons: ['Storia insufficiente (< 3 mesi)'] };
  }

  const recentCounts = recentKeys.map(k => catHistory[k]?.variableCount ?? 0).filter(c => c > 0);
  const medCount = recentCounts.length > 0 ? median(recentCounts) : 0;
  const recentAmounts = recentKeys.map(k => monthTotal(catHistory[k])).filter(v => v > 0);
  const cv = recentAmounts.length >= 2 ? robustCV(recentAmounts) : 0;

  if (cv > 0.50) {
    return {
      behavior: 'volatile_mixed', confidence: 'low',
      reasons: [`Alta variabilità (CV=${cv.toFixed(2)}) — previsione poco affidabile`],
    };
  }

  if (medCount > 3) {
    return {
      behavior: 'variable_frequent', confidence: 'medium',
      reasons: [`~${medCount.toFixed(1)} transazioni/mese — categoria frequente`],
    };
  }

  return {
    behavior: 'variable_sparse', confidence: 'medium',
    reasons: [`~${medCount.toFixed(1)} transazioni/mese — categoria poco frequente`],
  };
}

// ── Uncertainty width per behavior ───────────────────────────────────────────

/** Returns the ±half-width of the confidence interval as a fraction of `projected`. */
export function behaviorIntervalWidth(behavior: CategoryBehavior): number {
  switch (behavior) {
    case 'recurring':
    case 'recurring_bundle':
    case 'fixed_monthly':
      return 0.0;
    case 'periodic_fixed': return 0.15;
    case 'hybrid':         return 0.20;
    case 'variable_sparse': return 0.35;
    case 'variable_frequent': return 0.25;
    case 'volatile_mixed': return 0.55;
    case 'stale':          return 0.05;
    case 'unknown':        return 0.50;
    default:               return 0.30;
  }
}
