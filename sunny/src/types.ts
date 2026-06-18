export type TransactionType = 'income' | 'expense' | 'investment' | 'transfer';

export const TYPE_META: Record<TransactionType, { label: string; color: string }> = {
  income:     { label: 'Entrata',      color: '#8A9270' },
  expense:    { label: 'Uscita',       color: '#F5F5F5' },
  investment: { label: 'Investimento', color: '#E6B95C' },
  transfer:   { label: 'Movimento',    color: '#88B0C0' },
};

// The TYPE_META colours are bright accents tuned for the DARK theme; on a light
// background several are too pale to work as a pill / CTA background or as text
// (the near-white "expense" disappears entirely). These are the light-theme
// equivalents — deeper, with enough contrast for white text on top.
const TYPE_COLOR_LIGHT: Record<TransactionType, string> = {
  income:     '#4E6B3E',
  expense:    '#3A3A3A',
  investment: '#A07A37',
  transfer:   '#3A7A9A',
};

/** Theme-correct display colour for a transaction type. */
export function typeColor(type: TransactionType, theme: 'dark' | 'light' = 'dark'): string {
  return theme === 'light' ? TYPE_COLOR_LIGHT[type] : TYPE_META[type].color;
}

/** Text colour to sit ON a `typeColor` pill/CTA background, per theme. */
export function typeOnColor(theme: 'dark' | 'light' = 'dark'): string {
  return theme === 'light' ? '#FFFFFF' : '#0D0D0D';
}

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
  currentValue?: number;   // investment categories only: market value, entered manually
  lastValueUpdate?: string; // ISO date of the last currentValue update
  archived?: boolean;      // soft-deleted: removed by the user but still referenced in
                           // the transaction history. Resolved by getCat for display,
                           // hidden from every picker / management / planning list.
}

/** A currentValue older than this many days is considered stale. */
export const STALE_DAYS = 30;

/** User-editable account. */
export interface AccountDef {
  id: string;
  label: string;
  icon: string;
  color: string;
  initialBalance?: number;
  isInvestment?: boolean;
  archived?: boolean;      // soft-deleted: removed by the user but still referenced in
                           // the transaction history. Resolved by getAcc for display,
                           // hidden from every picker / management / planning list.
}

export interface Transaction {
  id: string;
  date: string;          // YYYY-MM-DD
  description: string;
  amount: number;        // always positive
  type: TransactionType;
  category: string;      // CategoryDef.id
  account: string;       // AccountDef.id — may be '' for a source-less investment (e.g. TFR / employer contribution)
  direction?: 'in' | 'out'; // investments only: absent or 'in' = deposit, 'out' = withdrawal (credits the account)
  tfr?: number;          // investment into a pension fund only: portion of this contribution that is TFR
  toAccount?: string;    // AccountDef.id — transfers only
  notes?: string;
  shared?: number;       // others' part of a shared expense; counted as movement, not spending
  groupId?: string;      // links a split expense with its reimbursement transfers
  recurring?: RecurrenceRule;
  seriesId?: string;     // stable id linking a recurring template to its materialized instances
  projected?: boolean;   // CLIENT-ONLY: a virtual future occurrence — NEVER persisted to Firestore
  demo?: boolean;        // written by onboarding demo data; removable from Settings
  createdAt?: number;    // ms epoch — when this document was created; used to break same-date sort ties
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

/** Flow sign of an investment transaction: +1 deposit, −1 withdrawal. */
export function investSign(t: Transaction): 1 | -1 {
  return t.direction === 'out' ? -1 : 1;
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
