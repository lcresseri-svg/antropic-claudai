export type TransactionType = 'income' | 'expense' | 'investment' | 'transfer';

export const TYPE_META: Record<TransactionType, { label: string; color: string }> = {
  income:     { label: 'Entrata',      color: '#8A9270' },
  expense:    { label: 'Uscita',       color: '#F5F5F5' },
  investment: { label: 'Investimento', color: '#E6B95C' },
  transfer:   { label: 'Movimento',    color: '#88B0C0' },
};

export const TYPE_ORDER: TransactionType[] = ['expense', 'income', 'investment', 'transfer'];

/** User-editable category. Stored in Firestore per user. */
export interface CategoryDef {
  id: string;
  label: string;
  icon: string;   // single emoji
  color: string;  // hex
  kind: TransactionType;
}

/** User-editable account. */
export interface AccountDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  initialBalance?: number;
}

export interface Transaction {
  id: string;
  date: string;          // YYYY-MM-DD
  description: string;
  amount: number;        // always positive
  type: TransactionType;
  category: string;      // CategoryDef.id
  account: string;       // AccountDef.id
  toAccount?: string;    // AccountDef.id — transfers only
  notes?: string;
  shared?: number;       // others' part of a shared expense; counted as movement, not spending
  groupId?: string;      // links a split expense with its reimbursement transfers
  recurring?: RecurrenceRule;
}

export interface RecurrenceRule {
  freq: 'weekly' | 'monthly' | 'yearly';
  until?: string; // YYYY-MM-DD
}

/** The portion of an expense that is actually yours (excludes the shared part). */
export function ownShare(t: Transaction): number {
  return t.type === 'expense' ? t.amount - (t.shared ?? 0) : t.amount;
}

/** Patch used by bulk edit. */
export type TransactionPatch = Partial<Pick<Transaction, 'category' | 'account' | 'type'>>;

/** Budget configuration, persisted locally (no backend required). */
export interface BudgetState {
  savingsTarget: number;                    // monthly savings goal (€)
  categoryBudgets: Record<string, number>;  // categoryId -> monthly limit (€)
  suggestionAccepted: boolean;              // true once the user accepts Sunny's plan
}
