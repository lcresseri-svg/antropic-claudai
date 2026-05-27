// ── Transaction type ─────────────────────────────────────────────────────────
export type TransactionType = 'income' | 'expense' | 'investment' | 'transfer';

export const TYPE_META: Record<TransactionType, { label: string; icon: string; color: string }> = {
  income:     { label: 'Entrata',      icon: '↑',  color: '#8A9270' },
  expense:    { label: 'Uscita',       icon: '↓',  color: '#1C1C1E' },
  investment: { label: 'Investimento', icon: '📈', color: '#E6B95C' },
  transfer:   { label: 'Movimento',    icon: '⇄',  color: '#7B9E87' },
};

// ── Category ─────────────────────────────────────────────────────────────────
export type Category =
  // Expense
  | 'spesa' | 'casa' | 'ristoranti' | 'trasporti' | 'shopping' | 'salute' | 'abbonamenti' | 'altro'
  // Income
  | 'stipendio' | 'freelance' | 'dividendi' | 'rimborso'
  // Investment
  | 'azioni_etf' | 'crypto' | 'obbligazioni' | 'fondi'
  // Transfer
  | 'trasferimento';

export interface CategoryMeta {
  label: string;
  color: string;
  icon: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  // Expense
  spesa:        { label: 'Spesa',        color: '#8A9270', icon: '🛒' },
  casa:         { label: 'Casa',         color: '#E6B95C', icon: '🏠' },
  ristoranti:   { label: 'Ristoranti',   color: '#D4956A', icon: '🍽️' },
  trasporti:    { label: 'Trasporti',    color: '#7B9E87', icon: '🚗' },
  shopping:     { label: 'Shopping',     color: '#B5A8C8', icon: '🛍️' },
  salute:       { label: 'Salute',       color: '#F28B82', icon: '🏥' },
  abbonamenti:  { label: 'Abbonamenti',  color: '#A8CFDB', icon: '📱' },
  altro:        { label: 'Altro',        color: '#C4B59E', icon: '📦' },
  // Income
  stipendio:    { label: 'Stipendio',    color: '#5B8DB8', icon: '💼' },
  freelance:    { label: 'Freelance',    color: '#6BAA8E', icon: '💻' },
  dividendi:    { label: 'Dividendi',    color: '#B8A45B', icon: '💹' },
  rimborso:     { label: 'Rimborso',     color: '#9DB85B', icon: '↩️' },
  // Investment
  azioni_etf:   { label: 'Azioni / ETF', color: '#E6B95C', icon: '📊' },
  crypto:       { label: 'Crypto',       color: '#F4A261', icon: '₿'  },
  obbligazioni: { label: 'Obbligazioni', color: '#A8C5B8', icon: '🏛️' },
  fondi:        { label: 'Fondi',        color: '#C9B8D8', icon: '🏦' },
  // Transfer
  trasferimento:{ label: 'Trasferimento',color: '#7B9E87', icon: '⇄'  },
};

export const CATEGORIES_BY_TYPE: Record<TransactionType, Category[]> = {
  expense:    ['spesa','casa','ristoranti','trasporti','shopping','salute','abbonamenti','altro'],
  income:     ['stipendio','freelance','dividendi','rimborso','altro'],
  investment: ['azioni_etf','crypto','obbligazioni','fondi'],
  transfer:   ['trasferimento'],
};

// ── Account ──────────────────────────────────────────────────────────────────
export type Account =
  | 'conto_corrente'
  | 'conto_risparmio'
  | 'carta_credito'
  | 'contanti'
  | 'conto_investimenti'
  | 'altro_conto';

export const ACCOUNT_META: Record<Account, { label: string; icon: string; color: string }> = {
  conto_corrente:    { label: 'Conto Corrente',   icon: '🏦', color: '#5B8DB8' },
  conto_risparmio:   { label: 'Conto Risparmio',  icon: '💰', color: '#8A9270' },
  carta_credito:     { label: 'Carta di Credito', icon: '💳', color: '#B5A8C8' },
  contanti:          { label: 'Contanti',          icon: '💵', color: '#E6B95C' },
  conto_investimenti:{ label: 'Investimenti',      icon: '📈', color: '#D4956A' },
  altro_conto:       { label: 'Altro Conto',       icon: '📦', color: '#C4B59E' },
};

export const ALL_ACCOUNTS: Account[] = [
  'conto_corrente','conto_risparmio','carta_credito','contanti','conto_investimenti','altro_conto',
];

// ── Payment method ────────────────────────────────────────────────────────────
export type PaymentMethod =
  | 'carta_debito'
  | 'carta_credito'
  | 'contanti'
  | 'bonifico'
  | 'app_pagamento'
  | 'rate'
  | 'altro_pagamento';

export const PAYMENT_META: Record<PaymentMethod, { label: string; icon: string }> = {
  carta_debito:   { label: 'Carta Debito',         icon: '💳' },
  carta_credito:  { label: 'Carta Credito',         icon: '💳' },
  contanti:       { label: 'Contanti',              icon: '💵' },
  bonifico:       { label: 'Bonifico',              icon: '🏦' },
  app_pagamento:  { label: 'App (PayPal, Satispay)', icon: '📱' },
  rate:           { label: 'Rate / Finanziamento',  icon: '📅' },
  altro_pagamento:{ label: 'Altro',                 icon: '📦' },
};

export const ALL_PAYMENTS: PaymentMethod[] = [
  'carta_debito','carta_credito','contanti','bonifico','app_pagamento','rate','altro_pagamento',
];

// ── Transaction ───────────────────────────────────────────────────────────────
export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: Category;
  account?: Account;
  paymentMethod?: PaymentMethod;
  toAccount?: Account;   // used for transfers
  notes?: string;
}

// Legacy helpers kept for backwards compatibility
export const EXPENSE_CATEGORIES = CATEGORIES_BY_TYPE.expense;
export const ALL_CATEGORIES: Category[] = Object.keys(CATEGORY_META) as Category[];
