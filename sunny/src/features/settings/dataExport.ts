import { Transaction, CategoryDef, AccountDef, BudgetState } from '../../types';
import { MonthlyBudget, monthlyToBudgetState } from '../budget/monthlyBudget';

/** One month of budget configuration in the export (section 17.9). */
export interface ExportMonthlyBudget {
  month: string;
  savingsTarget?: number;
  categoryBudgets: Record<string, number>;
  incomeBudgets?: Record<string, number>;
  investmentBudgets?: Record<string, number>;
  suggestionAccepted?: boolean;
  status?: MonthlyBudget['status'];
  source?: MonthlyBudget['source'];
  copiedFromMonth?: string;
  confirmedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface ExportBudgetBlock {
  currentMonth: string;
  currentBudget: ExportMonthlyBudget;
}

export interface ExportPayload {
  exportedAt: string;
  app: 'Sunny';
  schemaVersion: 1;
  user: { uid: string; email: string | null; displayName: string | null };
  categories: CategoryDef[];
  accounts: AccountDef[];
  transactions: Transaction[];
  /** Current month's budget (with status/source). Optional for old exports. */
  budget?: ExportBudgetBlock;
  /**
   * Per-month budget snapshots, when available. Required to compute the V4
   * budget-signal reliability empirically; the model falls back to per-category
   * defaults when it's missing.
   */
  budgetHistory?: ExportMonthlyBudget[];
}

/** Input describing the user's monthly budget state for the export. */
export interface BudgetExportInput {
  currentMonth: string;
  current?: MonthlyBudget | null;
  history?: MonthlyBudget[];
  /** Legacy meta/budget, used when there's no per-month snapshot yet. */
  legacy?: BudgetState | null;
}

/** Columns exported in the CSV, in order. */
export const CSV_COLUMNS: (keyof Transaction)[] = [
  'date', 'description', 'amount', 'type', 'category',
  'account', 'toAccount', 'notes', 'shared', 'groupId', 'direction',
];

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize transactions to RFC-4180 CSV with a header row. Pure & testable. */
export function transactionsToCsv(transactions: Transaction[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const t of transactions) {
    lines.push(CSV_COLUMNS.map(c => csvEscape(t[c])).join(','));
  }
  return lines.join('\r\n');
}

/** Map a monthly budget snapshot into its export shape. */
export function toExportMonthlyBudget(m: MonthlyBudget): ExportMonthlyBudget {
  return {
    month: m.month,
    savingsTarget: m.savingsTarget,
    categoryBudgets: m.categoryBudgets ?? {},
    incomeBudgets: m.incomeBudgets ?? {},
    investmentBudgets: m.investmentBudgets ?? {},
    suggestionAccepted: m.suggestionAccepted,
    status: m.status,
    source: m.source,
    copiedFromMonth: m.copiedFromMonth,
    confirmedAt: m.confirmedAt,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

/** Build the export budget block + history from the monthly budget state. */
export function buildBudgetExport(input: BudgetExportInput): {
  budget?: ExportBudgetBlock;
  budgetHistory?: ExportMonthlyBudget[];
} {
  // Prefer the per-month snapshot; fall back to the legacy budget as a synthetic
  // 'missing'-status current month so older accounts still export their budget.
  let currentBudget: ExportMonthlyBudget | undefined;
  if (input.current) {
    currentBudget = toExportMonthlyBudget(input.current);
  } else if (input.legacy) {
    const bs = monthlyToBudgetState({
      month: input.currentMonth, status: 'missing', source: 'auto_initialized',
      ...input.legacy,
    } as MonthlyBudget);
    currentBudget = {
      month: input.currentMonth,
      savingsTarget: bs.savingsTarget,
      categoryBudgets: bs.categoryBudgets,
      incomeBudgets: bs.incomeBudgets,
      investmentBudgets: bs.investmentBudgets,
      suggestionAccepted: bs.suggestionAccepted,
      status: 'missing',
    };
  }
  const history = (input.history ?? []).map(toExportMonthlyBudget);
  return {
    ...(currentBudget ? { budget: { currentMonth: input.currentMonth, currentBudget } } : {}),
    ...(history.length > 0 ? { budgetHistory: history } : {}),
  };
}

/** Build the full GDPR export payload. Pure & testable. */
export function buildExportPayload(
  user: { uid: string; email: string | null; displayName: string | null },
  categories: CategoryDef[],
  accounts: AccountDef[],
  transactions: Transaction[],
  budgetExport?: BudgetExportInput,
): ExportPayload {
  const { budget, budgetHistory } = budgetExport ? buildBudgetExport(budgetExport) : {};
  return {
    exportedAt: new Date().toISOString(),
    app: 'Sunny',
    schemaVersion: 1,
    user: { uid: user.uid, email: user.email, displayName: user.displayName },
    categories,
    accounts,
    transactions,
    ...(budget ? { budget } : {}),
    ...(budgetHistory ? { budgetHistory } : {}),
  };
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(payload: ExportPayload) {
  const today = new Date().toISOString().slice(0, 10);
  downloadBlob(JSON.stringify(payload, null, 2), `sunny-dati-${today}.json`, 'application/json');
}

export function downloadCsv(transactions: Transaction[]) {
  const today = new Date().toISOString().slice(0, 10);
  // Prepend BOM so Excel opens UTF-8 correctly
  downloadBlob('﻿' + transactionsToCsv(transactions), `sunny-transazioni-${today}.csv`, 'text/csv;charset=utf-8');
}
