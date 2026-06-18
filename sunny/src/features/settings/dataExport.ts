import { Transaction, CategoryDef, AccountDef, BudgetState } from '../../types';

/** Budget block in the export (matches BudgetState, all fields optional). */
export interface ExportBudget {
  savingsTarget?: number;
  categoryBudgets: Record<string, number>;
  incomeBudgets?: Record<string, number>;
  investmentBudgets?: Record<string, number>;
  suggestionAccepted?: boolean;
}

/** One historical month of budget configuration (enables forecast reliability). */
export interface ExportBudgetHistoryEntry {
  month: string;
  categoryBudgets: Record<string, number>;
  totalBudget?: number;
  updatedAt?: string;
}

export interface ExportPayload {
  exportedAt: string;
  app: 'Sunny';
  schemaVersion: 1;
  user: { uid: string; email: string | null; displayName: string | null };
  categories: CategoryDef[];
  accounts: AccountDef[];
  transactions: Transaction[];
  /** Current budget. Optional for backward compatibility with older exports. */
  budget?: ExportBudget;
  /**
   * Historical budgets per month, when available. Sunny currently stores only
   * the current budget, so this is usually omitted; the forecast reliability
   * model falls back to per-category defaults when it's missing.
   */
  budgetHistory?: ExportBudgetHistoryEntry[];
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

/** Map the live BudgetState into the export budget block. */
export function toExportBudget(budget: BudgetState): ExportBudget {
  return {
    savingsTarget: budget.savingsTarget,
    categoryBudgets: budget.categoryBudgets ?? {},
    incomeBudgets: budget.incomeBudgets ?? {},
    investmentBudgets: budget.investmentBudgets ?? {},
    suggestionAccepted: budget.suggestionAccepted,
  };
}

/** Build the full GDPR export payload. Pure & testable. */
export function buildExportPayload(
  user: { uid: string; email: string | null; displayName: string | null },
  categories: CategoryDef[],
  accounts: AccountDef[],
  transactions: Transaction[],
  budget?: BudgetState,
  budgetHistory?: ExportBudgetHistoryEntry[],
): ExportPayload {
  return {
    exportedAt: new Date().toISOString(),
    app: 'Sunny',
    schemaVersion: 1,
    user: { uid: user.uid, email: user.email, displayName: user.displayName },
    categories,
    accounts,
    transactions,
    ...(budget ? { budget: toExportBudget(budget) } : {}),
    ...(budgetHistory && budgetHistory.length > 0 ? { budgetHistory } : {}),
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
