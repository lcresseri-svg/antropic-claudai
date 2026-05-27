export type Category =
  | 'spesa'
  | 'casa'
  | 'ristoranti'
  | 'trasporti'
  | 'shopping'
  | 'stipendio'
  | 'altro';

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: Category;
}

export interface CategoryMeta {
  label: string;
  color: string;
  icon: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  spesa:      { label: 'Spesa',       color: '#8A9270', icon: '🛒' },
  casa:       { label: 'Casa',        color: '#E6B95C', icon: '🏠' },
  ristoranti: { label: 'Ristoranti',  color: '#D4956A', icon: '🍽️' },
  trasporti:  { label: 'Trasporti',   color: '#7B9E87', icon: '🚗' },
  shopping:   { label: 'Shopping',    color: '#B5A8C8', icon: '🛍️' },
  stipendio:  { label: 'Stipendio',   color: '#5B8DB8', icon: '💼' },
  altro:      { label: 'Altro',       color: '#C4B59E', icon: '📦' },
};

export const EXPENSE_CATEGORIES: Category[] = [
  'spesa', 'casa', 'ristoranti', 'trasporti', 'shopping', 'altro',
];

export const ALL_CATEGORIES: Category[] = [
  'spesa', 'casa', 'ristoranti', 'trasporti', 'shopping', 'stipendio', 'altro',
];
