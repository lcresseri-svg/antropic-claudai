import { CategoryDef, AccountDef } from './types';

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  // Expense
  { id: 'spesa',        label: 'Spesa',        icon: '🛒', color: '#8A9270', kind: 'expense' },
  { id: 'casa',         label: 'Casa',         icon: '🏠', color: '#E6B95C', kind: 'expense' },
  { id: 'ristoranti',   label: 'Ristoranti',   icon: '🍽️', color: '#D4956A', kind: 'expense' },
  { id: 'trasporti',    label: 'Trasporti',    icon: '🚗', color: '#7B9E87', kind: 'expense' },
  { id: 'shopping',     label: 'Shopping',     icon: '🛍️', color: '#B5A8C8', kind: 'expense' },
  { id: 'salute',       label: 'Salute',       icon: '🩺', color: '#E08B8B', kind: 'expense' },
  { id: 'abbonamenti',  label: 'Abbonamenti',  icon: '🔁', color: '#88B0C0', kind: 'expense' },
  { id: 'altro',        label: 'Altro',        icon: '•',  color: '#9A9A9A', kind: 'expense' },
  // Income
  { id: 'stipendio',    label: 'Stipendio',    icon: '💼', color: '#6FA8DC', kind: 'income' },
  { id: 'freelance',    label: 'Freelance',    icon: '💻', color: '#6BAA8E', kind: 'income' },
  { id: 'dividendi',    label: 'Dividendi',    icon: '💹', color: '#C9B05B', kind: 'income' },
  { id: 'rimborso',     label: 'Rimborso',     icon: '↩️', color: '#9DB85B', kind: 'income' },
  { id: 'altro_in',     label: 'Altro',        icon: '•',  color: '#9A9A9A', kind: 'income' },
  // Investment
  { id: 'azioni_etf',   label: 'Azioni / ETF', icon: '📈', color: '#E6B95C', kind: 'investment' },
  { id: 'crypto',       label: 'Crypto',       icon: '₿',  color: '#E0A05C', kind: 'investment' },
  { id: 'obbligazioni', label: 'Obbligazioni', icon: '🏛️', color: '#8FB0A0', kind: 'investment' },
  { id: 'fondi',        label: 'Fondi',        icon: '🏦', color: '#B0A0C8', kind: 'investment' },
  // Transfer
  { id: 'trasferimento',label: 'Trasferimento',icon: '⇄',  color: '#88B0C0', kind: 'transfer' },
];

export const DEFAULT_ACCOUNTS: AccountDef[] = [
  { id: 'conto_corrente',     label: 'Conto Corrente',  icon: '🏦', color: '#6FA8DC' },
  { id: 'conto_risparmio',    label: 'Conto Risparmio', icon: '💰', color: '#8A9270' },
  { id: 'carta_credito',      label: 'Carta di Credito',icon: '💳', color: '#B5A8C8' },
  { id: 'contanti',           label: 'Contanti',        icon: '💵', color: '#E6B95C' },
  { id: 'conto_investimenti', label: 'Investimenti',    icon: '📊', color: '#D4956A' },
];

export const FALLBACK_CATEGORY = (id: string): CategoryDef => ({
  id, label: id || 'Altro', icon: '•', color: '#8B8B8B', kind: 'expense',
});

export const FALLBACK_ACCOUNT = (id: string): AccountDef => ({
  id, label: id || 'Conto', icon: '•', color: '#8B8B8B',
});

/** Emoji palette offered when creating categories/accounts. */
export const EMOJI_CHOICES = [
  '🛒','🏠','🍽️','🚗','🛍️','🩺','🔁','💼','💻','💹','↩️','📈','₿','🏛️','🏦',
  '💰','💳','💵','📊','✈️','🎬','🎮','📚','🐶','👶','🎁','⚡','💡','📱','☕',
  '🍺','💪','✂️','🧾','🌍','❤️','⭐','🚬','⛽','👗','🅿️','•',
];

/** Color palette offered when creating categories/accounts. */
export const COLOR_CHOICES = [
  '#E6B95C','#8A9270','#D4956A','#7B9E87','#B5A8C8','#E08B8B','#88B0C0',
  '#6FA8DC','#6BAA8E','#C9B05B','#9DB85B','#E0A05C','#8FB0A0','#B0A0C8','#9A9A9A',
];
