/**
 * Forecast diagnostics export — Forecast Engine V3.
 *
 * Produces a single, downloadable JSON document with everything needed to
 * analyse the model's behaviour over the last N complete months: settings,
 * categories, budgets, monthly actuals, a rich multi-snapshot backtest
 * (per-sample, per-category, per-behaviour, per-day), the transactions used,
 * and automatic issue detection.
 *
 * Admin-only: the screen that triggers this is already behind the admin
 * allow-list. No Firebase UID is exported in clear — only an opaque hash.
 *
 * Export version: sunny-forecast-diagnostics-v1
 */
import { Transaction, CategoryDef, AccountDef, BudgetState, ownShare } from '../../types';
import { computeForecastV3, medianMonthlyFlowV3 } from './forecastEngineV3';
import { runBacktestV3 } from './forecastBacktestV3';
import { CategoryBehavior, CategoryForecastV3 } from './forecastTypesV3';
import { normalizeMerchant } from './forecastTreatment';
import { median } from './forecastStats';
import { APP_VERSION } from '../../appInfo';

const MODEL_VERSION = 'forecast-engine-v3';
const EXPORT_VERSION = 'sunny-forecast-diagnostics-v1';
const SNAPSHOT_DAYS = [5, 10, 15, 20, 25];
const ADMIN_ONLY = true;

/** Behaviours whose variable estimate is eligible for bias correction. */
const BIAS_APPLICABLE: ReadonlySet<CategoryBehavior> = new Set<CategoryBehavior>([
  'variable_frequent', 'variable_sparse', 'volatile_mixed', 'hybrid',
]);

// ── Public types ───────────────────────────────────────────────────────────────

export type DiagnosticsPrivacyMode = 'full' | 'pseudonymized';

export interface DiagnosticsInput {
  transactions: Transaction[];
  /** ALL categories (income / expense / investment). */
  categories: CategoryDef[];
  accounts: AccountDef[];
  budget: BudgetState;
  settings: ExportSettingsSnapshot;
  /** Default 12. */
  monthsRequested?: number;
  /** Default 'pseudonymized'. */
  privacyMode?: DiagnosticsPrivacyMode;
  /** Default true. */
  includeTransactions?: boolean;
  /** Default true. */
  includeCategoryForecasts?: boolean;
  /** Firebase UID — never exported in clear, only hashed. */
  userId?: string;
  currency?: string;
  now?: Date;
}

export interface ExportSettingsSnapshot {
  includeInvestments: boolean;
  enableBudget: boolean;
  enableInvestments: boolean;
  aiEnabled?: boolean;
  analysisDepth?: string;
}

interface ExportMetadata {
  exportVersion: typeof EXPORT_VERSION;
  generatedAt: string;
  appVersion?: string;
  modelVersion: string;
  userIdHash?: string;
  adminOnly: boolean;
  currency: string;
  timezone?: string;
  privacyMode: DiagnosticsPrivacyMode;
  period: {
    monthsRequested: number;
    monthsAvailable: number;
    fromMonth: string;
    toMonth: string;
    excludeCurrentMonth: boolean;
  };
}

interface ExportCategory {
  id: string;
  label: string;
  type: 'income' | 'expense' | 'investment';
  icon?: string;
  isEnabled?: boolean;
  inferredBehavior?: CategoryBehavior;
  behaviorConfidence?: 'low' | 'medium' | 'high';
  activeMonths?: number[];
  expectedAmount?: number;
  expectedMonthlyCount?: number;
  notes?: string[];
}

interface ExportAccount {
  id: string;
  label: string;
  icon?: string;
  isInvestment?: boolean;
}

interface ExportBudgetMonth {
  month: string;
  savingsTarget?: number;
  categoryBudgets: Record<string, number>;
  incomeBudgets?: Record<string, number>;
  investmentBudgets?: Record<string, number>;
}

interface ForecastConfigSnapshot {
  lookbackMonths: number;
  snapshotDays: number[];
  biasFactor: number;
  biasAppliedOnlyToVariable: boolean;
  snapshotIncludesDateRule: '<=' | '<';
}

interface MonthlyActualCategory {
  actualTotal: number;
  transactionCount: number;
  averageTicket?: number;
  deterministicActual?: number;
  variableActual?: number;
  recurringActual?: number;
}

interface MonthlyActual {
  month: string;
  totals: {
    income: number;
    expense: number;
    investment: number;
    transfer: number;
    savings: number;
  };
  byCategory: Record<string, MonthlyActualCategory>;
  byMerchant?: Record<string, { actualTotal: number; transactionCount: number; categories: string[] }>;
}

interface ExportTransaction {
  id: string;
  date: string;
  month: string;
  amount: number;
  type: 'income' | 'expense' | 'investment' | 'transfer';
  categoryId: string;
  accountId?: string;
  description?: string;
  normalizedMerchant?: string;
  isRecurring?: boolean;
  seriesId?: string;
  recurringFreq?: string;
}

interface BacktestComponentStats {
  mae: number;
  medae: number;
  wape: number;
  wapeReliable: boolean;
  bias: number;
}

interface BacktestSummary {
  sampleCount: number;
  monthsCount: number;
  total: { mae: number; medae: number; wape: number; bias: number; r2?: number };
  variable: BacktestComponentStats;
  deterministic: BacktestComponentStats;
  notes: string[];
}

interface BacktestDaySummary {
  day: number;
  sampleCount: number;
  mae: number;
  medae: number;
  wape: number;
  bias: number;
  variableMae: number;
  deterministicMae: number;
  worstSamples: { month: string; actual: number; forecast: number; error: number; errorPct: number }[];
}

interface BacktestCategorySummary {
  categoryId: string;
  categoryLabel?: string;
  behavior?: CategoryBehavior;
  sampleCount: number;
  mae: number;
  medae: number;
  wape: number;
  bias: number;
  actualTotal: number;
  forecastTotal: number;
  errorContribution: number;
  commonIssues?: string[];
}

interface BacktestBehaviorSummary {
  behavior: CategoryBehavior;
  sampleCount: number;
  mae: number;
  medae: number;
  wape: number;
  bias: number;
  actualTotal: number;
  forecastTotal: number;
}

interface ExportCategoryForecast {
  categoryId: string;
  categoryLabel?: string;
  behavior: CategoryBehavior;
  confidence: 'low' | 'medium' | 'high';
  actualFinal: number;
  forecastTotal: number;
  error: number;
  actualSoFar: number;
  deterministicComponent: number;
  variableComponent: number;
  actualFinalDeterministic: number;
  actualFinalVariable: number;
  scheduledFuture: number;
  recurringFuture: number;
  periodicFuture: number;
  plannedFuture: number;
  budgetConfirmedFuture: number;
  oneOffSoFar: number;
  predictedVariableRemaining: number;
  calibratedVariableRemaining: number;
  budgetAmount?: number;
  budgetMeaning?: 'target' | 'fixed_expected' | 'none';
  activeMonths?: number[];
  expectedAmount?: number;
  actualTransactionCountSoFar?: number;
  expectedRemainingTransactions?: number;
  normalizedMerchants?: string[];
  explanation?: string;
  issues?: string[];
  debug?: {
    treatmentBreakdown?: Record<string, number>;
    behaviorReasons?: string[];
    tailCap?: number;
    historicalTailRemaining?: number;
    recentPaceRemaining?: number;
    biasCorrectionFactorApplied?: number;
  };
}

interface BacktestSample {
  month: string;
  snapshotDay: number;
  snapshotDate: string;
  actualFinal: { income: number; expense: number; investment: number; savings: number };
  forecast: { income: number; expense: number; investment: number; savings: number };
  error: { income: number; expense: number; investment: number; savings: number; expensePct: number };
  components: {
    forecastDeterministic: number;
    actualFinalDeterministic: number;
    deterministicError: number;
    forecastVariable: number;
    actualFinalVariable: number;
    variableError: number;
    actualSoFar: number;
    scheduledFuture: number;
    recurringFuture: number;
    periodicFuture: number;
    plannedFuture: number;
    budgetConfirmedFuture: number;
    oneOffSoFar: number;
    predictedVariableRemaining: number;
    calibratedVariableRemaining: number;
    missedDeterministic: number;
  };
  categoryForecasts?: ExportCategoryForecast[];
  topErrorContributors: {
    categoryId: string;
    categoryLabel?: string;
    behavior?: CategoryBehavior;
    actualFinal: number;
    forecastTotal: number;
    error: number;
    reason?: string;
  }[];
  debug: {
    modelVersion: string;
    biasCorrectionFactor: number;
    biasAppliedOnlyToVariable: boolean;
    snapshotIncludesDateRule: '<=' | '<';
    flags?: Record<string, boolean>;
    notes?: string[];
  };
}

interface ForecastBacktestExport {
  summary: BacktestSummary;
  bySnapshotDay: Record<string, BacktestDaySummary>;
  byBehavior: Record<string, BacktestBehaviorSummary>;
  byCategory: Record<string, BacktestCategorySummary>;
  samples: BacktestSample[];
}

export interface ForecastDiagnosticsExport {
  metadata: ExportMetadata;
  settings: ExportSettingsSnapshot;
  categories: ExportCategory[];
  accounts: ExportAccount[];
  budgets: ExportBudgetMonth[];
  forecastConfig: ForecastConfigSnapshot;
  monthlyActuals: MonthlyActual[];
  backtest: ForecastBacktestExport;
  transactions: ExportTransaction[];
  notes: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function monthKeyForOffset(now: Date, i: number): { key: string; year: number; monthRaw: number } {
  const year = now.getMonth() - i < 0
    ? now.getFullYear() - Math.ceil((i - now.getMonth()) / 12)
    : now.getFullYear();
  const monthRaw = ((now.getMonth() - i) % 12 + 12) % 12;
  return { key: `${year}-${String(monthRaw + 1).padStart(2, '0')}`, year, monthRaw };
}

/** Opaque, non-reversible hash of a UID (djb2 → base36). Not cryptographic; just avoids clear UID. */
function hashId(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  return `u_${h.toString(36)}`;
}

function isRecurring(t: Transaction): boolean {
  return !!(t.seriesId || t.recurring);
}

function round(n: number): number {
  return Math.round(n);
}

function safeWape(absErrorSum: number, denom: number): { wape: number; reliable: boolean } {
  const reliable = denom > 50;
  return { wape: reliable ? Math.round((absErrorSum / denom) * 1000) / 10 : 0, reliable };
}

/** Stable merchant pseudonymiser: same merchant → same merchant_NNN key for this export. */
function makePseudonymizer() {
  const map = new Map<string, string>();
  let counter = 0;
  return (normalized: string): string => {
    if (!normalized) return '';
    let key = map.get(normalized);
    if (!key) {
      counter += 1;
      key = `merchant_${String(counter).padStart(3, '0')}`;
      map.set(normalized, key);
    }
    return key;
  };
}

// ── Main builder ──────────────────────────────────────────────────────────────

export function buildForecastDiagnosticsExport(input: DiagnosticsInput): ForecastDiagnosticsExport {
  const now = input.now ?? new Date();
  const monthsRequested = input.monthsRequested ?? 12;
  const privacyMode = input.privacyMode ?? 'pseudonymized';
  const includeTransactions = input.includeTransactions ?? true;
  const includeCategoryForecasts = input.includeCategoryForecasts ?? true;
  const currency = input.currency ?? 'EUR';
  const notes: string[] = [];

  const expenseCategories = input.categories.filter(c => c.kind === 'expense');
  const catLabel = (id: string) => input.categories.find(c => c.id === id)?.label ?? id;

  const pseudonymize = makePseudonymizer();
  const merchantKey = (description: string): string => {
    const norm = normalizeMerchant(description);
    return privacyMode === 'pseudonymized' ? pseudonymize(norm) : norm;
  };

  // ── Period: last `monthsRequested` complete months, excluding current ─────
  const monthOffsets: { key: string; year: number; monthRaw: number }[] = [];
  for (let i = 1; i <= monthsRequested; i++) monthOffsets.push(monthKeyForOffset(now, i));
  // toMonth = most recent complete (i=1), fromMonth = oldest (i=monthsRequested)
  const toMonth = monthOffsets[0]?.key ?? '';
  const fromMonth = monthOffsets[monthOffsets.length - 1]?.key ?? '';
  const monthKeysSet = new Set(monthOffsets.map(m => m.key));

  // Months that actually have any transaction activity
  const activeMonthKeys = new Set<string>();
  for (const t of input.transactions) {
    const k = t.date.slice(0, 7);
    if (monthKeysSet.has(k)) activeMonthKeys.add(k);
  }
  const monthsAvailable = activeMonthKeys.size;
  if (monthsAvailable < monthsRequested) {
    notes.push(`Solo ${monthsAvailable} dei ${monthsRequested} mesi richiesti hanno dati disponibili.`);
  }

  // ── Run the canonical backtest once (covers the requested period) ─────────
  const backtestCore = runBacktestV3(input.transactions, expenseCategories, now, monthsRequested);
  const biasFactor = backtestCore.biasFactor;

  // ── Metadata ──────────────────────────────────────────────────────────────
  const metadata: ExportMetadata = {
    exportVersion: EXPORT_VERSION,
    generatedAt: now.toISOString(),
    appVersion: APP_VERSION,
    modelVersion: MODEL_VERSION,
    userIdHash: input.userId ? hashId(input.userId) : undefined,
    adminOnly: ADMIN_ONLY,
    currency,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    privacyMode,
    period: {
      monthsRequested,
      monthsAvailable,
      fromMonth,
      toMonth,
      excludeCurrentMonth: true,
    },
  };

  // ── Current-forecast behaviour map (for category-level metadata) ──────────
  const avgIncome = medianMonthlyFlowV3(input.transactions, 'income', now);
  const avgInvest = medianMonthlyFlowV3(input.transactions, 'investment', now);
  const curIncome = input.transactions
    .filter(t => t.type === 'income' && t.date.slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    .reduce((s, t) => s + ownShare(t), 0);
  const curInvest = input.transactions
    .filter(t => t.type === 'investment' && t.date.slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
    .reduce((s, t) => s + ownShare(t), 0);
  const currentForecast = computeForecastV3({
    transactions: input.transactions,
    expenseCategories,
    monthlyIncome: curIncome,
    monthlyInvestments: curInvest,
    avgIncome, avgInvest,
    now,
  });
  const behaviorByCat = new Map<string, CategoryForecastV3>(
    currentForecast.categories.map(c => [c.categoryId, c]),
  );

  // ── Categories ──────────────────────────────────────────────────────────
  const categories: ExportCategory[] = input.categories.map(c => {
    const fc = c.kind === 'expense' ? behaviorByCat.get(c.id) : undefined;
    return {
      id: c.id,
      label: c.label,
      type: c.kind === 'transfer' ? 'expense' : c.kind, // transfers shouldn't appear; guard for type
      icon: c.icon,
      inferredBehavior: fc?.behavior,
      behaviorConfidence: fc?.behaviorResult.confidence,
      activeMonths: fc?.behaviorResult.activeMonths,
      expectedAmount: fc?.behaviorResult.expectedAmount,
      notes: fc?.behaviorResult.reasons,
    };
  });

  // ── Accounts ──────────────────────────────────────────────────────────────
  const accounts: ExportAccount[] = input.accounts.map(a => ({
    id: a.id, label: a.label, icon: a.icon, isInvestment: a.isInvestment,
  }));

  // ── Budgets ───────────────────────────────────────────────────────────────
  // Sunny stores only the CURRENT budget (no historical snapshots). We export it
  // tagged with the current month and note the limitation.
  const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const budgets: ExportBudgetMonth[] = [{
    month: curKey,
    savingsTarget: input.budget.savingsTarget,
    categoryBudgets: input.budget.categoryBudgets,
    incomeBudgets: input.budget.incomeBudgets,
    investmentBudgets: input.budget.investmentBudgets,
  }];
  notes.push('I budget storici per mese non sono disponibili: viene esportato solo il budget corrente (usato anche come riferimento nel backtest).');

  // ── Forecast config ────────────────────────────────────────────────────────
  const forecastConfig: ForecastConfigSnapshot = {
    lookbackMonths: 3,
    snapshotDays: SNAPSHOT_DAYS,
    biasFactor,
    biasAppliedOnlyToVariable: true,
    snapshotIncludesDateRule: '<=',
  };

  // ── Monthly actuals ─────────────────────────────────────────────────────────
  const monthlyActuals: MonthlyActual[] = [];
  for (const m of monthOffsets) {
    if (!activeMonthKeys.has(m.key)) continue;
    const monthTx = input.transactions.filter(t => t.date.slice(0, 7) === m.key);
    if (monthTx.length === 0) continue;

    const totals = { income: 0, expense: 0, investment: 0, transfer: 0, savings: 0 };
    const byCategory: Record<string, MonthlyActualCategory> = {};
    const byMerchant: Record<string, { actualTotal: number; transactionCount: number; categories: string[] }> = {};

    for (const t of monthTx) {
      const share = ownShare(t);
      if (t.type === 'income') totals.income += share;
      else if (t.type === 'expense') totals.expense += share;
      else if (t.type === 'investment') totals.investment += share;
      else if (t.type === 'transfer') totals.transfer += share;

      if (t.type !== 'expense') continue;
      const entry = (byCategory[t.category] ??= {
        actualTotal: 0, transactionCount: 0,
        deterministicActual: 0, variableActual: 0, recurringActual: 0,
      });
      entry.actualTotal += share;
      entry.transactionCount += 1;
      if (isRecurring(t)) {
        entry.recurringActual = (entry.recurringActual ?? 0) + share;
        entry.deterministicActual = (entry.deterministicActual ?? 0) + share;
      } else {
        entry.variableActual = (entry.variableActual ?? 0) + share;
      }

      const mk = merchantKey(t.description);
      if (mk) {
        const me = (byMerchant[mk] ??= { actualTotal: 0, transactionCount: 0, categories: [] });
        me.actualTotal += share;
        me.transactionCount += 1;
        if (!me.categories.includes(t.category)) me.categories.push(t.category);
      }
    }

    for (const entry of Object.values(byCategory)) {
      entry.actualTotal = round(entry.actualTotal);
      entry.deterministicActual = round(entry.deterministicActual ?? 0);
      entry.variableActual = round(entry.variableActual ?? 0);
      entry.recurringActual = round(entry.recurringActual ?? 0);
      entry.averageTicket = entry.transactionCount > 0
        ? round(entry.actualTotal / entry.transactionCount) : 0;
    }
    for (const me of Object.values(byMerchant)) me.actualTotal = round(me.actualTotal);

    totals.savings = round(totals.income - totals.expense - totals.investment);
    totals.income = round(totals.income);
    totals.expense = round(totals.expense);
    totals.investment = round(totals.investment);
    totals.transfer = round(totals.transfer);

    monthlyActuals.push({ month: m.key, totals, byCategory, byMerchant });
  }

  // ── Backtest samples (rich per-snapshot, per-category) ────────────────────
  const samples: BacktestSample[] = [];
  // Aggregators
  const catAgg = new Map<string, {
    behavior?: CategoryBehavior; absErr: number[]; signedErr: number[];
    actualTotal: number; forecastTotal: number; issues: Set<string>;
  }>();
  const behAgg = new Map<CategoryBehavior, {
    absErr: number[]; signedErr: number[]; actualTotal: number; forecastTotal: number;
  }>();

  for (const m of monthOffsets) {
    if (!activeMonthKeys.has(m.key)) continue;

    const monthExpenseTx = input.transactions.filter(t => t.type === 'expense' && t.date.slice(0, 7) === m.key);
    const actualExpenseFull = round(monthExpenseTx.reduce((s, t) => s + ownShare(t), 0));
    if (actualExpenseFull === 0) continue;
    const actualIncomeFull = round(input.transactions
      .filter(t => t.type === 'income' && t.date.slice(0, 7) === m.key)
      .reduce((s, t) => s + ownShare(t), 0));
    const actualInvestFull = round(input.transactions
      .filter(t => t.type === 'investment' && t.date.slice(0, 7) === m.key)
      .reduce((s, t) => s + ownShare(t), 0));

    // Per-category full-month actual split (deterministic vs variable)
    const catActualFull = new Map<string, { total: number; det: number; var: number; count: number }>();
    for (const t of monthExpenseTx) {
      const e = (catActualFull.get(t.category) ?? { total: 0, det: 0, var: 0, count: 0 });
      const share = ownShare(t);
      e.total += share; e.count += 1;
      if (isRecurring(t)) e.det += share; else e.var += share;
      catActualFull.set(t.category, e);
    }

    const isActiveCalMonth = (c: CategoryForecastV3) =>
      (c.behaviorResult.activeMonths ?? []).includes(m.monthRaw);

    for (const day of SNAPSHOT_DAYS) {
      const snapshotISO = `${m.key}-${String(day).padStart(2, '0')}`;
      const snapshotTx = input.transactions.filter(t =>
        t.date <= snapshotISO ||
        (t.date.slice(0, 7) === m.key && t.date > snapshotISO && isRecurring(t) && t.type === 'expense'),
      );
      const snapshotDate = new Date(m.year, m.monthRaw, day);

      const snapIncome = snapshotTx
        .filter(t => t.type === 'income' && t.date.slice(0, 7) === m.key)
        .reduce((s, t) => s + ownShare(t), 0);
      const snapInvest = snapshotTx
        .filter(t => t.type === 'investment' && t.date.slice(0, 7) === m.key)
        .reduce((s, t) => s + ownShare(t), 0);

      const result = computeForecastV3({
        transactions: snapshotTx,
        expenseCategories,
        monthlyIncome: snapIncome,
        monthlyInvestments: snapInvest,
        now: snapshotDate,
      });

      const forecastExpense = round(result.projectedExpenses);
      const forecastIncome = round(result.expectedIncome);
      const forecastInvest = round(result.expectedInvest);

      // After-snapshot actual splits (what the engine had to predict)
      const afterTx = monthExpenseTx.filter(t => t.date > snapshotISO);
      const actualDetAfter = round(afterTx.filter(isRecurring).reduce((s, t) => s + ownShare(t), 0));
      const actualVarAfter = round(afterTx.filter(t => !isRecurring(t)).reduce((s, t) => s + ownShare(t), 0));
      const actualSoFarTotal = round(result.categories.reduce((s, c) => s + c.actualSoFar, 0));

      const forecastDeterministic = round(result.categories.reduce((s, c) => s + c.deterministicComponent, 0));
      const forecastVariable = round(result.categories.reduce((s, c) => s + c.predictedVariableRemaining, 0));
      const actualFinalDeterministic = round(actualSoFarTotal + actualDetAfter);
      const actualFinalVariable = actualVarAfter;
      const deterministicError = round(forecastDeterministic - actualFinalDeterministic);
      const variableError = round(forecastVariable - actualFinalVariable);
      const missedDeterministic = round(Math.max(0,
        actualDetAfter - result.categories.reduce((s, c) => s + c.scheduledFuture + c.plannedFuture, 0)));

      const expenseError = round(forecastExpense - actualExpenseFull);
      const expensePct = actualExpenseFull > 0 ? Math.round((expenseError / actualExpenseFull) * 1000) / 10 : 0;

      // Per-category forecasts within this sample
      const catForecasts: ExportCategoryForecast[] = [];
      for (const c of result.categories) {
        const actual = catActualFull.get(c.categoryId);
        const actualFinal = round(actual?.total ?? 0);
        if (actualFinal === 0 && c.projected === 0) continue;

        const error = round(c.projected - actualFinal);
        const issues = detectCategoryIssues(c, {
          actualFinal,
          actualFinalDeterministic: round(actual?.det ?? 0),
          actualFinalVariable: round(actual?.var ?? 0),
          snapshotDay: day,
          isActiveMonth: isActiveCalMonth(c),
        });

        // Aggregate
        const ca = catAgg.get(c.categoryId) ?? {
          behavior: c.behavior, absErr: [], signedErr: [],
          actualTotal: 0, forecastTotal: 0, issues: new Set<string>(),
        };
        ca.behavior = c.behavior;
        ca.absErr.push(Math.abs(error));
        ca.signedErr.push(error);
        ca.actualTotal += actualFinal;
        ca.forecastTotal += c.projected;
        issues.forEach(i => ca.issues.add(i));
        catAgg.set(c.categoryId, ca);

        const ba = behAgg.get(c.behavior) ?? { absErr: [], signedErr: [], actualTotal: 0, forecastTotal: 0 };
        ba.absErr.push(Math.abs(error));
        ba.signedErr.push(error);
        ba.actualTotal += actualFinal;
        ba.forecastTotal += c.projected;
        behAgg.set(c.behavior, ba);

        if (includeCategoryForecasts) {
          const calibrated = BIAS_APPLICABLE.has(c.behavior)
            ? round(c.variableBeforeBias * biasFactor)
            : c.predictedVariableRemaining;
          const isPeriodic = c.behavior === 'periodic_fixed';
          catForecasts.push({
            categoryId: c.categoryId,
            categoryLabel: catLabel(c.categoryId),
            behavior: c.behavior,
            confidence: c.behaviorResult.confidence,
            actualFinal,
            forecastTotal: c.projected,
            error,
            actualSoFar: c.actualSoFar,
            deterministicComponent: c.deterministicComponent,
            variableComponent: c.predictedVariableRemaining,
            actualFinalDeterministic: round(actual?.det ?? 0),
            actualFinalVariable: round(actual?.var ?? 0),
            scheduledFuture: c.composition.scheduledFuture,
            recurringFuture: c.composition.scheduledFuture,
            periodicFuture: isPeriodic ? c.composition.scheduledFuture : 0,
            plannedFuture: c.composition.plannedNormalFuture + c.composition.plannedOneOffFuture,
            budgetConfirmedFuture: c.composition.plannedNormalFuture,
            oneOffSoFar: c.composition.actualOneOffSoFar,
            predictedVariableRemaining: c.variableBeforeBias,
            calibratedVariableRemaining: calibrated,
            budgetAmount: input.budget.categoryBudgets[c.categoryId],
            budgetMeaning: input.budget.categoryBudgets[c.categoryId]
              ? (c.behavior === 'fixed_monthly' || c.behavior === 'periodic_fixed' ? 'fixed_expected' : 'target')
              : 'none',
            activeMonths: c.behaviorResult.activeMonths,
            expectedAmount: c.behaviorResult.expectedAmount,
            actualTransactionCountSoFar: c.treatmentBreakdown.variableNormal,
            expectedRemainingTransactions: c.expectedRemainingTx,
            explanation: c.explanation,
            issues: issues.length ? issues : undefined,
            debug: {
              treatmentBreakdown: {
                variableNormal: c.treatmentBreakdown.variableNormal,
                scheduledRecurring: c.treatmentBreakdown.scheduledRecurring,
                plannedNormal: c.treatmentBreakdown.plannedNormal,
                plannedOneOff: c.treatmentBreakdown.plannedOneOff,
                oneOffExtra: c.treatmentBreakdown.oneOffExtra,
                transferExcluded: c.treatmentBreakdown.transferExcluded,
              },
              behaviorReasons: c.behaviorResult.reasons,
              tailCap: c.tailP75,
              historicalTailRemaining: c.tailMedian,
              recentPaceRemaining: c.paceRemainingSignal,
              biasCorrectionFactorApplied: BIAS_APPLICABLE.has(c.behavior) ? biasFactor : 1.0,
            },
          });
        }
      }

      // Top error contributors (always computed, even if catForecasts not exported)
      const contributors = result.categories.map(c => {
        const actualFinal = round(catActualFull.get(c.categoryId)?.total ?? 0);
        const error = round(c.projected - actualFinal);
        const issues = detectCategoryIssues(c, {
          actualFinal,
          actualFinalDeterministic: round(catActualFull.get(c.categoryId)?.det ?? 0),
          actualFinalVariable: round(catActualFull.get(c.categoryId)?.var ?? 0),
          snapshotDay: day,
          isActiveMonth: isActiveCalMonth(c),
        });
        return {
          categoryId: c.categoryId,
          categoryLabel: catLabel(c.categoryId),
          behavior: c.behavior,
          actualFinal,
          forecastTotal: c.projected,
          error,
          reason: issues[0],
        };
      })
        .filter(x => Math.abs(x.error) > 0)
        .sort((a, b) => Math.abs(b.error) - Math.abs(a.error))
        .slice(0, 5);

      samples.push({
        month: m.key,
        snapshotDay: day,
        snapshotDate: snapshotISO,
        actualFinal: {
          income: actualIncomeFull,
          expense: actualExpenseFull,
          investment: actualInvestFull,
          savings: round(actualIncomeFull - actualExpenseFull - actualInvestFull),
        },
        forecast: {
          income: forecastIncome,
          expense: forecastExpense,
          investment: forecastInvest,
          savings: round(forecastIncome - forecastExpense - forecastInvest),
        },
        error: {
          income: round(forecastIncome - actualIncomeFull),
          expense: expenseError,
          investment: round(forecastInvest - actualInvestFull),
          savings: round((forecastIncome - forecastExpense - forecastInvest) - (actualIncomeFull - actualExpenseFull - actualInvestFull)),
          expensePct,
        },
        components: {
          forecastDeterministic,
          actualFinalDeterministic,
          deterministicError,
          forecastVariable,
          actualFinalVariable,
          variableError,
          actualSoFar: actualSoFarTotal,
          scheduledFuture: round(result.categories.reduce((s, c) => s + c.composition.scheduledFuture, 0)),
          recurringFuture: round(result.categories.reduce((s, c) => s + c.composition.scheduledFuture, 0)),
          periodicFuture: round(result.categories.filter(c => c.behavior === 'periodic_fixed')
            .reduce((s, c) => s + c.composition.scheduledFuture, 0)),
          plannedFuture: round(result.categories.reduce((s, c) => s + c.plannedFuture, 0)),
          budgetConfirmedFuture: round(result.categories.reduce((s, c) => s + c.composition.plannedNormalFuture, 0)),
          oneOffSoFar: round(result.categories.reduce((s, c) => s + c.composition.actualOneOffSoFar, 0)),
          predictedVariableRemaining: round(result.categories.reduce((s, c) => s + c.variableBeforeBias, 0)),
          calibratedVariableRemaining: round(result.categories.reduce((s, c) =>
            s + (BIAS_APPLICABLE.has(c.behavior) ? c.variableBeforeBias * biasFactor : c.predictedVariableRemaining), 0)),
          missedDeterministic,
        },
        categoryForecasts: includeCategoryForecasts ? catForecasts : undefined,
        topErrorContributors: contributors,
        debug: {
          modelVersion: MODEL_VERSION,
          biasCorrectionFactor: biasFactor,
          biasAppliedOnlyToVariable: true,
          snapshotIncludesDateRule: '<=',
        },
      });
    }
  }

  // ── Backtest summary (reuse canonical totals, add component stats) ────────
  const monthsCount = new Set(samples.map(s => s.month)).size;
  const allAbsErr = samples.map(s => Math.abs(s.error.expense));
  const allSignedErr = samples.map(s => s.error.expense);
  const totalActualExpense = samples.reduce((s, x) => s + x.actualFinal.expense, 0);

  const varAbs = samples.map(s => Math.abs(s.components.variableError));
  const varSigned = samples.map(s => s.components.variableError);
  const totalActualVar = samples.reduce((s, x) => s + x.components.actualFinalVariable, 0);
  const varWape = safeWape(varAbs.reduce((a, b) => a + b, 0), totalActualVar);

  const detAbs = samples.map(s => Math.abs(s.components.deterministicError));
  const detSigned = samples.map(s => s.components.deterministicError);
  const totalActualDet = samples.reduce((s, x) => s + x.components.actualFinalDeterministic, 0);
  const detWape = safeWape(detAbs.reduce((a, b) => a + b, 0), totalActualDet);

  const meanOf = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const summary: BacktestSummary = {
    sampleCount: samples.length,
    monthsCount,
    total: {
      mae: backtestCore.mae,
      medae: backtestCore.medAE,
      wape: backtestCore.wape,
      bias: backtestCore.bias,
      r2: backtestCore.r2,
    },
    variable: {
      mae: meanOf(varAbs),
      medae: Math.round(median(varAbs)),
      wape: varWape.wape,
      wapeReliable: varWape.reliable,
      bias: meanOf(varSigned),
    },
    deterministic: {
      mae: meanOf(detAbs),
      medae: Math.round(median(detAbs)),
      wape: detWape.wape,
      wapeReliable: detWape.reliable,
      bias: meanOf(detSigned),
    },
    notes: [
      'Convenzione errore: error = forecast − actual (positivo = sovrastima).',
      'I componenti variable/deterministic sono calcolati sulla parte di mese SUCCESSIVA allo snapshot (ciò che il modello doveva prevedere): error totale ≈ variableError + deterministicError.',
      `missedDeterministic medio: ${backtestCore.missedDeterministicMean}€ (ricorrenti/periodici arrivati dopo lo snapshot e non previsti).`,
      ...(varWape.reliable ? [] : ['WAPE variabile non affidabile: denominatore troppo piccolo.']),
      ...(detWape.reliable ? [] : ['WAPE deterministico non affidabile: denominatore troppo piccolo.']),
    ],
  };

  // ── bySnapshotDay ──────────────────────────────────────────────────────────
  const bySnapshotDay: Record<string, BacktestDaySummary> = {};
  for (const day of SNAPSHOT_DAYS) {
    const ds = samples.filter(s => s.snapshotDay === day);
    if (ds.length === 0) continue;
    const abs = ds.map(s => Math.abs(s.error.expense));
    const signed = ds.map(s => s.error.expense);
    const denom = ds.reduce((s, x) => s + x.actualFinal.expense, 0);
    const worst = [...ds]
      .sort((a, b) => Math.abs(b.error.expense) - Math.abs(a.error.expense))
      .slice(0, 3)
      .map(s => ({
        month: s.month, actual: s.actualFinal.expense, forecast: s.forecast.expense,
        error: s.error.expense, errorPct: s.error.expensePct,
      }));
    bySnapshotDay[String(day)] = {
      day,
      sampleCount: ds.length,
      mae: meanOf(abs),
      medae: Math.round(median(abs)),
      wape: safeWape(abs.reduce((a, b) => a + b, 0), denom).wape,
      bias: meanOf(signed),
      variableMae: meanOf(ds.map(s => Math.abs(s.components.variableError))),
      deterministicMae: meanOf(ds.map(s => Math.abs(s.components.deterministicError))),
      worstSamples: worst,
    };
  }

  // ── byCategory ──────────────────────────────────────────────────────────────
  const byCategory: Record<string, BacktestCategorySummary> = {};
  const grandAbsErr = allAbsErr.reduce((a, b) => a + b, 0) || 1;
  for (const [catId, agg] of catAgg) {
    const absSum = agg.absErr.reduce((a, b) => a + b, 0);
    byCategory[catId] = {
      categoryId: catId,
      categoryLabel: catLabel(catId),
      behavior: agg.behavior,
      sampleCount: agg.absErr.length,
      mae: meanOf(agg.absErr),
      medae: Math.round(median(agg.absErr)),
      wape: safeWape(absSum, agg.actualTotal).wape,
      bias: meanOf(agg.signedErr),
      actualTotal: round(agg.actualTotal),
      forecastTotal: round(agg.forecastTotal),
      errorContribution: Math.round((absSum / grandAbsErr) * 1000) / 10,
      commonIssues: agg.issues.size ? Array.from(agg.issues) : undefined,
    };
  }

  // ── byBehavior ──────────────────────────────────────────────────────────────
  const byBehavior: Record<string, BacktestBehaviorSummary> = {};
  for (const [behavior, agg] of behAgg) {
    const absSum = agg.absErr.reduce((a, b) => a + b, 0);
    byBehavior[behavior] = {
      behavior,
      sampleCount: agg.absErr.length,
      mae: meanOf(agg.absErr),
      medae: Math.round(median(agg.absErr)),
      wape: safeWape(absSum, agg.actualTotal).wape,
      bias: meanOf(agg.signedErr),
      actualTotal: round(agg.actualTotal),
      forecastTotal: round(agg.forecastTotal),
    };
  }

  const backtest: ForecastBacktestExport = {
    summary, bySnapshotDay, byBehavior, byCategory, samples,
  };

  // ── Transactions ────────────────────────────────────────────────────────────
  let exportTransactions: ExportTransaction[] = [];
  if (includeTransactions) {
    // Include the requested months plus one extra month of immediately-prior history
    const extraMonth = monthKeyForOffset(now, monthsRequested + 1).key;
    const includeKeys = new Set([...monthKeysSet, extraMonth, curKey]);
    exportTransactions = input.transactions
      .filter(t => includeKeys.has(t.date.slice(0, 7)))
      .map(t => ({
        id: t.id,
        date: t.date,
        month: t.date.slice(0, 7),
        amount: round(ownShare(t)),
        type: t.type,
        categoryId: t.category,
        accountId: t.account || undefined,
        description: privacyMode === 'full' ? t.description : undefined,
        normalizedMerchant: merchantKey(t.description) || undefined,
        isRecurring: isRecurring(t) || undefined,
        seriesId: t.seriesId,
        recurringFreq: t.recurring?.freq,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } else {
    notes.push('Transazioni non incluse (includeTransactions = false).');
  }

  return {
    metadata,
    settings: input.settings,
    categories,
    accounts,
    budgets,
    forecastConfig,
    monthlyActuals,
    backtest,
    transactions: exportTransactions,
    notes,
  };
}

// ── Issue detection ───────────────────────────────────────────────────────────

function detectCategoryIssues(
  c: CategoryForecastV3,
  ctx: {
    actualFinal: number;
    actualFinalDeterministic: number;
    actualFinalVariable: number;
    snapshotDay: number;
    isActiveMonth: boolean;
  },
): string[] {
  const issues: string[] = [];
  const { actualFinal, snapshotDay, isActiveMonth } = ctx;
  const forecast = c.projected;

  // missing_periodic_fixed: periodic, active month, real spend, forecast much lower
  if (c.behavior === 'periodic_fixed' && isActiveMonth &&
      actualFinal > 100 && forecast < actualFinal * 0.6) {
    issues.push('missing_periodic_fixed');
  }

  // tail_overestimate: late month, forecast clearly above actual, high variable estimate
  if (snapshotDay >= 20 && forecast > actualFinal * 1.25 &&
      c.predictedVariableRemaining > actualFinal * 0.15) {
    issues.push('tail_overestimate');
  }

  // tail_underestimate: early month, forecast well below a high actual
  if (snapshotDay <= 10 && actualFinal > 100 && forecast < actualFinal * 0.6) {
    issues.push('tail_underestimate');
  }

  // volatile_category: flagged volatile with large relative error
  if (c.behavior === 'volatile_mixed' && actualFinal > 50 &&
      Math.abs(forecast - actualFinal) > actualFinal * 0.4) {
    issues.push('volatile_category');
  }

  // actual_not_included_at_snapshot: deterministic spend exists but engine missed it
  if (ctx.actualFinalDeterministic > 100 && c.composition.scheduledFuture === 0 &&
      c.composition.actualScheduledSoFar === 0 && forecast < actualFinal * 0.7) {
    issues.push('actual_not_included_at_snapshot');
  }

  return issues;
}
