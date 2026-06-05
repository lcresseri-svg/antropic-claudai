/**
 * Category forecast mode detection for Forecast Engine V2.
 *
 * Determines whether a category should be predicted statistically ('variable')
 * or treated deterministically ('locked_monthly' | 'locked_seasonal' | 'hybrid').
 *
 * All functions are pure and receive pre-built history maps — no Firestore calls.
 */
import { median, mad } from './forecastStats';
import { MonthCatHistory } from './forecastHistory';
import { CategoryForecastMode, PlannedBudgetItem, ForecastModeDebug } from './forecastTypes';

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Robust coefficient of variation using MAD/median. Resistant to outliers. */
function robustCV(values: number[]): number {
  if (values.length < 2) return 0;
  const m = median(values);
  if (m <= 0) return 1;
  return mad(values) / m;
}

/** Sum variable + recurring totals for a month key. */
function monthTotal(h: MonthCatHistory | undefined): number {
  if (!h) return 0;
  return h.variableTotal + h.recurringTotal;
}

// ── Budget meaning inference ──────────────────────────────────────────────────

/**
 * Decide whether a category budget acts as a confirmed expectation or a goal.
 *
 * Returns 'fixed_expected' when the budget closely matches the historical
 * median and the monthly amounts are stable — meaning the budget describes
 * what WILL happen, not what we wish would happen.
 *
 * Returns 'target' for variable categories (e.g. restaurants, shopping) where
 * the budget is an aspirational ceiling, not a predictive anchor.
 */
export function inferBudgetMeaning(
  budgetAmount: number | undefined,
  catHistory: Record<string, MonthCatHistory>,
  sixMonthKeys: string[],
): 'target' | 'fixed_expected' {
  if (!budgetAmount || budgetAmount <= 0) return 'target';

  const totals = sixMonthKeys
    .map(k => monthTotal(catHistory[k]))
    .filter(v => v > 0);

  if (totals.length < 2) return 'target';

  const med = median(totals);
  const cv = robustCV(totals);
  const budgetNearMedian = med > 0 && Math.abs(budgetAmount - med) / med <= 0.10;
  const amountStable = cv < 0.15;

  return (budgetNearMedian && amountStable) ? 'fixed_expected' : 'target';
}

// ── Locked monthly detection ──────────────────────────────────────────────────

export interface LockedMonthlyResult {
  isLocked: boolean;
  lockedAmount?: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
}

/**
 * Detect whether a category behaves as a fixed monthly expense.
 *
 * A category is locked_monthly when it recurs predictably each month with a
 * stable amount — e.g. a gym subscription, rent contribution, or a monthly
 * utility that always lands near the same figure.
 *
 * sixMonthKeys: the 6 calendar months immediately preceding the current one.
 */
export function detectLockedMonthlyCategory(
  catHistory: Record<string, MonthCatHistory>,
  sixMonthKeys: string[],
  budgetAmount: number | undefined,
  hasExplicitRecurring: boolean,
): LockedMonthlyResult {
  const reasons: string[] = [];

  // Explicit recurring series → locked by definition, skip statistical checks.
  if (hasExplicitRecurring) {
    reasons.push('Ha una ricorrenza esplicita (seriesId/recurring)');
    const totals = sixMonthKeys
      .map(k => monthTotal(catHistory[k]))
      .filter(v => v > 0);
    const med = totals.length > 0 ? median(totals) : 0;
    const lockedAmount = budgetAmount && med > 0 && Math.abs(budgetAmount - med) / med <= 0.10
      ? budgetAmount
      : (med > 0 ? med : budgetAmount);
    return { isLocked: true, lockedAmount, confidence: 'high', reasons };
  }

  const monthlyTotals = sixMonthKeys.map(k => monthTotal(catHistory[k]));
  const nonZeroTotals = monthlyTotals.filter(v => v > 0);
  const activeCount = nonZeroTotals.length;

  // Condition 1: present in ≥ 4 of last 6 months
  if (activeCount < 4) {
    return {
      isLocked: false,
      confidence: 'low',
      reasons: [`Solo ${activeCount} mesi attivi su 6 (soglia: 4)`],
    };
  }
  reasons.push(`Presente in ${activeCount}/6 mesi recenti`);

  // Condition 2: amount is stable (robustCV < 0.15)
  const cv = robustCV(nonZeroTotals);
  if (cv >= 0.15) {
    return {
      isLocked: false,
      confidence: 'low',
      reasons: [...reasons, `Variabilità importo troppo alta (CV robusta=${cv.toFixed(2)}, soglia 0.15)`],
    };
  }
  reasons.push(`Importo stabile (CV robusta=${cv.toFixed(2)})`);

  // Condition 3: monthly transaction count is small (not a high-frequency variable category)
  const varCounts = sixMonthKeys.map(k => catHistory[k]?.variableCount ?? 0);
  const nonZeroCounts = varCounts.filter(c => c > 0);
  const medCount = nonZeroCounts.length > 0 ? median(nonZeroCounts) : 0;
  if (medCount > 2.0) {
    return {
      isLocked: false,
      confidence: 'low',
      reasons: [...reasons, `Numero di transazioni variabili elevato (mediana=${medCount.toFixed(1)}) — categoria frequente, non fissa`],
    };
  }
  reasons.push(`Numero transazioni mensili contenuto (mediana variabili=${medCount.toFixed(1)})`);

  const medTotal = median(nonZeroTotals);

  // Budget confirmation: raises confidence and pins the locked amount.
  let lockedAmount = medTotal;
  let confidence: 'low' | 'medium' | 'high' = 'medium';

  if (budgetAmount && budgetAmount > 0) {
    const budgetNear = Math.abs(budgetAmount - medTotal) / medTotal <= 0.10;
    if (budgetNear) {
      reasons.push(`Budget (${Math.round(budgetAmount)}€) conferma la mediana storica (${Math.round(medTotal)}€)`);
      lockedAmount = budgetAmount;
      confidence = 'high';
    } else if (budgetAmount < medTotal * 0.5) {
      reasons.push(
        `Budget (${Math.round(budgetAmount)}€) molto inferiore allo storico (${Math.round(medTotal)}€) — budget usato come obiettivo, non come conferma`,
      );
      // Don't raise confidence — budget is a target, not a confirm
    } else {
      reasons.push(`Budget (${Math.round(budgetAmount)}€) diverge moderatamente dallo storico (${Math.round(medTotal)}€)`);
    }
  }

  return { isLocked: true, lockedAmount, confidence, reasons };
}

// ── Locked seasonal detection ─────────────────────────────────────────────────

export interface LockedSeasonalResult {
  isSeasonal: boolean;
  activeMonths: number[];       // 0-based calendar months (0 = January)
  expectedAmount?: number;
  confidence: 'low' | 'medium' | 'high';
  reasons: string[];
}

/**
 * Detect whether a category only appears in specific calendar months.
 *
 * A category is seasonal when its spending is concentrated in ≤ 4 months per
 * year and its presence ratio across the full history is < 40% of months.
 *
 * Examples: car insurance (June), annual membership (January), holiday gifts
 * (December), road tax (April).
 *
 * Critical rule: NEVER distribute an annual amount across inactive months.
 * If the category is seasonal and the current month is NOT an active month,
 * the forecast is 0 (or actualSoFar if something unexpected was recorded).
 *
 * allHistoryKeys: all month-keys in the category history (up to 24 months).
 * currentCalendarMonth: 0-based (0 = January).
 */
export function detectLockedSeasonalCategory(
  catHistory: Record<string, MonthCatHistory>,
  allHistoryKeys: string[],
  currentCalendarMonth: number,
  budgetAmount: number | undefined,
  plannedCurrentMonth: boolean,
): LockedSeasonalResult {
  const reasons: string[] = [];
  const empty = (r: string): LockedSeasonalResult =>
    ({ isSeasonal: false, activeMonths: [], confidence: 'low', reasons: [r] });

  if (allHistoryKeys.length < 6) return empty('Storia insufficiente (< 6 mesi)');

  // Build calendar-month → list of amounts
  const byCalMonth: Record<number, number[]> = {};
  let totalHistoryMonths = 0;
  let spendMonths = 0;

  for (const key of allHistoryKeys) {
    const h = catHistory[key];
    if (!h) continue;
    totalHistoryMonths++;
    const total = monthTotal(h);
    const calMonth = parseInt(key.slice(5, 7), 10) - 1; // 0-based
    if (total > 0) {
      spendMonths++;
      (byCalMonth[calMonth] ??= []).push(total);
    }
  }

  if (totalHistoryMonths < 6) return empty('Storia insufficiente');

  const spendRatio = spendMonths / totalHistoryMonths;
  if (spendRatio > 0.40) {
    return empty(
      `Categoria presente nel ${Math.round(spendRatio * 100)}% dei mesi — non è stagionale (soglia 40%)`,
    );
  }
  reasons.push(`Spesa in ${spendMonths}/${totalHistoryMonths} mesi totali (${Math.round(spendRatio * 100)}%)`);

  const activeCalMonths = Object.keys(byCalMonth).map(Number).sort((a, b) => a - b);
  if (activeCalMonths.length > 4) {
    return empty(
      `Distribuita su ${activeCalMonths.length} mesi dell'anno — non sufficientemente concentrata (soglia 4)`,
    );
  }
  reasons.push(
    `Attiva in ${activeCalMonths.length} ${activeCalMonths.length === 1 ? 'mese' : 'mesi'} dell\'anno: ${activeCalMonths.map(m => m + 1).join(', ')}`,
  );

  // Amount stability across active months
  const allActiveAmounts = Object.values(byCalMonth).flat();
  const cv = robustCV(allActiveAmounts);
  if (cv >= 0.40) {
    reasons.push(`Importo molto variabile nei mesi attivi (CV=${cv.toFixed(2)}) — confidenza bassa`);
  }

  // Confidence: how well we can predict the current month
  const currentMonthOccurrences = (byCalMonth[currentCalendarMonth] ?? []).length;
  let confidence: 'low' | 'medium' | 'high';

  if (currentMonthOccurrences >= 2) {
    confidence = 'high';
    reasons.push(`${currentMonthOccurrences} occorrenze storiche nello stesso mese di calendario`);
  } else if (currentMonthOccurrences === 1 && (budgetAmount || plannedCurrentMonth)) {
    confidence = 'medium';
    reasons.push('Una occorrenza storica nel mese confermata da budget/planned item');
  } else if (currentMonthOccurrences === 0 && plannedCurrentMonth) {
    confidence = 'medium';
    reasons.push('Nessuna occorrenza storica in questo mese, ma presente come planned item');
  } else if (currentMonthOccurrences >= 1) {
    confidence = 'medium';
    reasons.push('Una occorrenza storica in questo mese (senza conferma da budget)');
  } else {
    // Category is seasonal but this is not one of its active months
    confidence = 'low';
    reasons.push('Questo non è uno dei mesi storicamente attivi — previsione = 0');
  }

  // Expected amount for current month
  let expectedAmount: number | undefined;
  const currentMonthAmounts = byCalMonth[currentCalendarMonth];
  if (currentMonthAmounts?.length) {
    // Budget wins if it's close to the historical median for this specific month
    const histMedian = median(currentMonthAmounts);
    if (budgetAmount && budgetAmount > 0 && Math.abs(budgetAmount - histMedian) / histMedian <= 0.20) {
      expectedAmount = budgetAmount;
    } else {
      expectedAmount = histMedian;
    }
  } else if (plannedCurrentMonth && budgetAmount && budgetAmount > 0) {
    expectedAmount = budgetAmount;
  }

  return {
    isSeasonal: true,
    activeMonths: activeCalMonths,
    expectedAmount,
    confidence,
    reasons,
  };
}

// ── Hybrid detection ──────────────────────────────────────────────────────────

/**
 * A category is hybrid when it has both a stable recurring component AND a
 * meaningful variable spend on top of it (e.g. "Auto": monthly loan payment
 * + variable fuel + occasional repairs).
 *
 * Condition: category has explicit recurring transactions AND the variable
 * component contributes ≥ 20% of total median monthly spend.
 */
export function detectHybridCategory(
  catHistory: Record<string, MonthCatHistory>,
  sixMonthKeys: string[],
  hasExplicitRecurring: boolean,
): { isHybrid: boolean; fixedMedian: number; variableMedian: number; reasons: string[] } {
  const no = { isHybrid: false, fixedMedian: 0, variableMedian: 0, reasons: [] };
  if (!hasExplicitRecurring) return no;

  const recurringTotals = sixMonthKeys
    .map(k => catHistory[k]?.recurringTotal ?? 0)
    .filter(v => v > 0);
  const variableTotals = sixMonthKeys
    .map(k => catHistory[k]?.variableTotal ?? 0)
    .filter(v => v > 0);

  if (recurringTotals.length < 2 || variableTotals.length < 2) return no;

  const fixedMedian = median(recurringTotals);
  const variableMedian = median(variableTotals);

  // Variable part must be meaningful (≥ 20% of total) to warrant hybrid treatment
  if (variableMedian < fixedMedian * 0.20) return no;

  return {
    isHybrid: true,
    fixedMedian,
    variableMedian,
    reasons: [
      `Parte fissa ricorrente ~${Math.round(fixedMedian)}€/mese`,
      `Parte variabile ~${Math.round(variableMedian)}€/mese (${Math.round((variableMedian / (fixedMedian + variableMedian)) * 100)}% del totale)`,
    ],
  };
}

// ── Main mode inference ───────────────────────────────────────────────────────

export interface ForecastModeResult {
  mode: CategoryForecastMode;
  lockedAmount?: number;
  activeMonths?: number[];
  fixedComponent?: number;
  variableComponent?: number;
  budgetMeaning?: 'target' | 'fixed_expected';
  reasons: string[];
}

/**
 * Decide the forecast mode for one expense category.
 *
 * Priority order (mirrors the decision hierarchy in the spec):
 *  1. locked_monthly  — if stable monthly fixed pattern detected
 *  2. locked_seasonal — if spending is concentrated in specific calendar months
 *  3. hybrid          — if explicit recurring + significant variable component
 *  4. variable        — statistical model (default)
 */
export function inferCategoryForecastMode(params: {
  catHistory: Record<string, MonthCatHistory>;
  allHistoryKeys: string[];
  sixMonthKeys: string[];
  currentCalendarMonth: number;
  budgetAmount: number | undefined;
  hasExplicitRecurring: boolean;
  plannedCurrentMonth: boolean;
}): ForecastModeResult {
  const {
    catHistory, allHistoryKeys, sixMonthKeys,
    currentCalendarMonth, budgetAmount, hasExplicitRecurring, plannedCurrentMonth,
  } = params;

  // ── 1. Locked monthly ─────────────────────────────────────────────────────
  const monthly = detectLockedMonthlyCategory(
    catHistory, sixMonthKeys, budgetAmount, hasExplicitRecurring,
  );
  if (monthly.isLocked && monthly.confidence !== 'low') {
    const budgetMeaning = inferBudgetMeaning(budgetAmount, catHistory, sixMonthKeys);
    return {
      mode: 'locked_monthly',
      lockedAmount: monthly.lockedAmount,
      budgetMeaning,
      reasons: monthly.reasons,
    };
  }

  // ── 2. Locked seasonal ────────────────────────────────────────────────────
  const seasonal = detectLockedSeasonalCategory(
    catHistory, allHistoryKeys, currentCalendarMonth, budgetAmount, plannedCurrentMonth,
  );
  if (seasonal.isSeasonal && seasonal.confidence !== 'low') {
    return {
      mode: 'locked_seasonal',
      activeMonths: seasonal.activeMonths,
      lockedAmount: seasonal.expectedAmount,
      reasons: seasonal.reasons,
    };
  }

  // ── 3. Hybrid ─────────────────────────────────────────────────────────────
  const hybrid = detectHybridCategory(catHistory, sixMonthKeys, hasExplicitRecurring);
  if (hybrid.isHybrid) {
    const budgetMeaning = inferBudgetMeaning(budgetAmount, catHistory, sixMonthKeys);
    return {
      mode: 'hybrid',
      fixedComponent: hybrid.fixedMedian,
      variableComponent: hybrid.variableMedian,
      budgetMeaning,
      reasons: hybrid.reasons,
    };
  }

  // ── 4. Variable (default) ─────────────────────────────────────────────────
  const budgetMeaning = inferBudgetMeaning(budgetAmount, catHistory, sixMonthKeys);
  return {
    mode: 'variable',
    budgetMeaning,
    reasons: ['Categoria con spesa variabile — modello statistico completo'],
  };
}

// ── Explanation builder ───────────────────────────────────────────────────────

/**
 * Build a human-readable explanation of why a category was forecast this way.
 */
export function buildModeExplanation(
  catLabel: string,
  modeResult: ForecastModeResult,
  lockedAmount: number | undefined,
  currentCalendarMonth: number,
  isActiveSeasonalMonth: boolean,
): string {
  const amt = lockedAmount != null ? `${Math.round(lockedAmount)}€` : '';

  switch (modeResult.mode) {
    case 'locked_monthly': {
      if (modeResult.budgetMeaning === 'fixed_expected') {
        return (
          `${catLabel}: prevista a ${amt} perché storicamente ha una spesa mensile stabile e il budget conferma lo stesso importo.`
        );
      }
      return (
        `${catLabel}: prevista a ${amt} perché storicamente ha una sola transazione mensile stabile. Il budget è usato come obiettivo secondario.`
      );
    }
    case 'locked_seasonal': {
      const monthName = new Date(2024, currentCalendarMonth, 1)
        .toLocaleString('it-IT', { month: 'long' });
      if (!isActiveSeasonalMonth) {
        return (
          `${catLabel}: non prevista in questo mese — storicamente è una spesa stagionale che compare in altri periodi dell'anno. Previsione: 0€.`
        );
      }
      const monthsList = (modeResult.activeMonths ?? [])
        .map(m => new Date(2024, m, 1).toLocaleString('it-IT', { month: 'long' }))
        .join(', ');
      return (
        `${catLabel}: prevista a ${amt} perché è una spesa stagionale che storicamente compare a ${monthsList}. Non viene distribuita sugli altri mesi.`
      );
    }
    case 'hybrid': {
      const fixed = modeResult.fixedComponent ?? 0;
      const variable = modeResult.variableComponent ?? 0;
      return (
        `${catLabel}: categoria mista — parte fissa ricorrente ~${Math.round(fixed)}€ + parte variabile ~${Math.round(variable)}€. Le spese extra vengono aggiunte separatamente.`
      );
    }
    case 'variable':
    default: {
      if (modeResult.budgetMeaning === 'target') {
        return ''; // Let the standard explanation from buildExplanation() take over
      }
      return '';
    }
  }
}
