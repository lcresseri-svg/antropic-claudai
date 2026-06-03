export type TransactionType = 'income' | 'expense' | 'investment' | 'transfer';

export const TYPE_META: Record<TransactionType, { label: string; color: string }> = {
  income:     { label: 'Entrata',      color: '#8A9270' },
  expense:    { label: 'Uscita',       color: '#F5F5F5' },
  investment: { label: 'Investimento', color: '#E6B95C' },
  transfer:   { label: 'Movimento',    color: '#88B0C0' },
};

export const TYPE_ORDER: TransactionType[] = ['expense', 'income', 'investment', 'transfer'];

/** Classification of an investment fund (detailed-investments mode). */
export type FundType = 'pension' | 'bond' | 'equity';

export const FUND_TYPE_META: Record<FundType, { label: string; color: string; icon: string }> = {
  pension: { label: 'Fondo pensionistico', color: '#8FB0A0', icon: '🛡️' },
  bond:    { label: 'Obbligazionario',      color: '#88B0C0', icon: '🏛️' },
  equity:  { label: 'Azionario',            color: '#E6B95C', icon: '📈' },
};

export const FUND_TYPE_ORDER: FundType[] = ['pension', 'bond', 'equity'];

/** User-editable category. Stored in Firestore per user. */
export interface CategoryDef {
  id: string;
  label: string;
  icon: string;   // single emoji
  color: string;  // hex
  kind: TransactionType;
  initialBalance?: number; // investment categories only: capital already invested before Sunny
  fundType?: FundType;     // investment categories only: fund classification (detailed mode)
  tfrAmount?: number;      // pension funds only: portion of capital that is TFR
}

/** User-editable account. */
export interface AccountDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  initialBalance?: number;
  isInvestment?: boolean;
}

export interface Transaction {
  id: string;
  date: string;          // YYYY-MM-DD
  description: string;
  amount: number;        // always positive
  type: TransactionType;
  category: string;      // CategoryDef.id
  account: string;       // AccountDef.id — may be '' for a source-less investment (e.g. TFR / employer contribution)
  tfr?: number;          // investment into a pension fund only: portion of this contribution that is TFR
  toAccount?: string;    // AccountDef.id — transfers only
  notes?: string;
  shared?: number;       // others' part of a shared expense; counted as movement, not spending
  groupId?: string;      // links a split expense with its reimbursement transfers
  recurring?: RecurrenceRule;
  seriesId?: string;     // stable id linking a recurring template to its materialized instances
  projected?: boolean;   // CLIENT-ONLY: a virtual future occurrence — NEVER persisted to Firestore
}

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  until?: string; // YYYY-MM-DD
}

export type Freq = RecurrenceRule['freq'];

/** The portion of an expense that is actually yours (excludes the shared part). */
export function ownShare(t: Transaction): number {
  return t.type === 'expense' ? t.amount - (t.shared ?? 0) : t.amount;
}

/** Patch used by bulk edit. */
export type TransactionPatch = Partial<Pick<Transaction, 'category' | 'account' | 'type'>>;

/** Budget configuration, persisted locally (no backend required). */
export interface BudgetState {
  savingsTarget: number;                       // monthly savings goal (€)
  categoryBudgets: Record<string, number>;     // expense categoryId -> monthly limit (€)
  incomeBudgets: Record<string, number>;       // income categoryId -> monthly expected (€)
  investmentBudgets: Record<string, number>;   // investment categoryId -> monthly target (€)
  suggestionAccepted: boolean;
}
