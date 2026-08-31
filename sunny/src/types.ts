export type TransactionType = 'income' | 'expense' | 'investment' | 'transfer' | 'refund';

export const TYPE_META: Record<TransactionType, { label: string; color: string }> = {
  income:     { label: 'Entrata',      color: '#8A9270' },
  expense:    { label: 'Uscita',       color: '#F5F5F5' },
  investment: { label: 'Investimento', color: '#E6B95C' },
  transfer:   { label: 'Movimento',    color: '#88B0C0' },
  refund:     { label: 'Storno',       color: '#8FB0A0' },
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
  refund:     '#4A7C63',
};

/** Theme-correct display colour for a transaction type. */
export function typeColor(type: TransactionType, theme: 'dark' | 'light' = 'dark'): string {
  return theme === 'light' ? TYPE_COLOR_LIGHT[type] : TYPE_META[type].color;
}

/** Text colour to sit ON a `typeColor` pill/CTA background, per theme. */
export function typeOnColor(theme: 'dark' | 'light' = 'dark'): string {
  return theme === 'light' ? '#FFFFFF' : '#0D0D0D';
}

/** Types the user can pick DIRECTLY (type selector, category kinds).
 *  'refund' is deliberately absent: uno storno nasce sempre da una spesa
 *  esistente (sheet dedicata) ed eredita la sua categoria, quindi non è né un
 *  tipo selezionabile a mano né un genere di categoria. */
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
  /** Investment categories only: date (YYYY-MM-DD, never future) the position was
   *  subscribed. Anchors initialBalance in time for duration / annualized return.
   *  Absent + initialBalance=0 → the first recorded operation is the start. */
  subscriptionDate?: string;
  /** Expense categories only: total amount financed/borrowed for this category
   *  (e.g. a loan). When set (> 0), the category tracks a repayment plan:
   *  expenses recorded in it count as installments paid, and the category
   *  detail shows how much is left to repay. */
  financedAmount?: number;
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
  /** When true, the account remains usable but its balance is omitted from
   *  aggregate liquidity and net-worth calculations. Missing means included. */
  excludeFromNetWorth?: boolean;
  archived?: boolean;      // soft-deleted: removed by the user but still referenced in
                           // the transaction history. Resolved by getAcc for display,
                           // hidden from every picker / management / planning list.
}

/** Apple Wallet card → Sunny account association. `cardKey` is a normalized,
 *  stable key produced by the receiving Cloud Function; `cardLabel` is only for
 *  display in Settings. Existing users have an empty list by default. */
export interface ApplePayCardMapping {
  cardKey: string;
  cardLabel: string;
  accountId: string;
}

export type ApplePayPendingStatus = 'pending' | 'confirmed' | 'ignored';

/** A Wallet payment received from the iOS automation but not yet booked.
 *  Pending payments live in a dedicated collection and therefore never affect
 *  balances/statistics until the review modal creates real transactions. */
export interface ApplePayPendingPayment {
  id: string;
  schemaVersion: 1;
  eventId: string;
  source: 'apple_pay';
  status: ApplePayPendingStatus;
  amount: number;
  currency: string;
  date: string;
  merchant: string;
  description: string;
  cardKey: string;
  cardLabel: string;
  accountId?: string;
  receivedAt: number;
  confirmedAt?: number;
  ignoredAt?: number;
  confirmedTransactionIds?: string[];
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
  seriesMeta?: SeriesMeta; // "smart series" flavour (subscription / installment); absent = plain recurring
  projected?: boolean;   // CLIENT-ONLY: a virtual future occurrence — NEVER persisted to Firestore
  demo?: boolean;        // written by onboarding demo data; removable from Settings
  createdAt?: number;    // ms epoch — when this document was created; used to break same-date sort ties
  /** Provenance for movements created by an iOS Shortcut. Absent for every
   *  existing/manual transaction, so this is fully backwards-compatible. */
  source?: 'shortcut' | 'apple_pay';
  /** Id of the source event/pending document, used to make confirmations
   *  traceable and idempotent. */
  sourceId?: string;
  /** Investments only: explicit market-value delta this movement applies to the
   *  category's currentValue, when it differs from ±amount (e.g. a withdrawal's
   *  'out' leg carries capitaleRimborsato but must drop the value by the full
   *  cash out). Default: investSign(t) * amount. */
  valueDelta?: number;
  /** Bookkeeping stamp: the currentValue change ACTUALLY applied (post-clamp)
   *  for this document. Present = managed; absent = legacy/unmanaged (its
   *  edits/deletes never touch currentValue). Written atomically with the
   *  settings update — never by hand. */
  valueEffect?: AppliedValueEffect;
  /** Investments only: TRUE while the movement is future-dated and its
   *  controvalore effect has NOT been applied yet. Cleared (and replaced by a
   *  valueEffect stamp) by the idempotent reconciler once the date is due.
   *  Distinguishes "pending, will be applied" from legacy/unmanaged docs. */
  valuePending?: boolean;
  /** One-off investment deposits only: spread the amount over N months (2–120)
   *  in trends/averages/insights. PURELY STATISTICAL — the single real movement,
   *  balances, cash flow, forecasts and currentValue are untouched. */
  statsSpreadMonths?: number;
  /** Refunds only (type 'refund'): id of the EXPENSE being refunded. Lo storno
   *  eredita la categoria di quella spesa e non ne ha una propria. */
  refundOf?: string;
  /** Expenses only — CLIENT-ONLY derived field, NEVER persisted to Firestore
   *  (come `projected`). Totale già stornato su questa spesa, calcolato da
   *  `applyRefunds` all'ingresso dei dati: è ciò che rende `ownShare` la spesa
   *  NETTA ovunque, senza toccare il documento originale. */
  refundedTotal?: number;
}

/** The currentValue change actually applied by a managed investment document. */
export interface AppliedValueEffect {
  category: string;   // CategoryDef.id the delta was applied to
  delta: number;      // signed, post-clamp (never drives currentValue below 0)
  appliedAt: number;  // ms epoch
}

export interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  until?: string; // YYYY-MM-DD
}

export type Freq = RecurrenceRule['freq'];

/** Flavour of a recurring series. Legacy series without seriesMeta = 'recurring'. */
export type SeriesKind = 'recurring' | 'subscription' | 'installment';

/**
 * Series metadata stored on the template (and copied onto its instances by the
 * normal materialization spread). Only INPUT data lives here — derived figures
 * (paid amount, remaining, monthly equivalent, …) are computed at runtime by
 * buildSeriesSummary and never persisted.
 */
export interface SeriesMeta {
  kind: SeriesKind;
  createdAt?: number;
  subscription?: { label?: string };
  installment?: {
    totalAmount: number;       // full plan amount (all installments together)
    totalInstallments: number; // number of installments in the plan
    firstDate: string;         // YYYY-MM-DD of the first installment
  };
}

/**
 * Quanto la spesa ti è EFFETTIVAMENTE costata: al netto della quota altrui
 * (`shared`) e degli storni ricevuti (`refundedTotal`, popolato da
 * `applyRefunds`). È la misura STATISTICA usata ovunque si sommino le spese
 * (categorie, budget, insight, forecast, recap, trend): un rimborso riduce così
 * la spesa nel mese in cui la spesa è avvenuta, ovunque e in un colpo solo.
 *
 * Per la CASSA usa `grossOwnShare`: il conto ha visto uscire l'intero importo
 * alla data della spesa, e lo storno rientra alla SUA data come movimento a sé.
 */
export function ownShare(t: Transaction): number {
  if (t.type !== 'expense') return t.amount;
  return Math.max(0, t.amount - (t.shared ?? 0) - (t.refundedTotal ?? 0));
}

/**
 * Quota di tua competenza AL LORDO degli storni — quanto è davvero uscito dal
 * conto alla data della spesa. Solo per saldi e flusso di cassa: le statistiche
 * usano `ownShare`.
 */
export function grossOwnShare(t: Transaction): number {
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
