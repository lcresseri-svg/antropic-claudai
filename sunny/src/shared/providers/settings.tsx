import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { CategoryDef, AccountDef } from '../../types';
import {
  DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, FALLBACK_CATEGORY, FALLBACK_ACCOUNT,
} from '../../defaults';

type Theme = 'dark' | 'light';

interface SettingsValue {
  categories: CategoryDef[];
  accounts: AccountDef[];
  theme: Theme;
  getCat: (id: string) => CategoryDef;
  getAcc: (id: string) => AccountDef;
  saveCategories: (c: CategoryDef[]) => void;
  saveAccounts: (a: AccountDef[]) => void;
  saveTheme: (t: Theme) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [accounts, setAccounts] = useState<AccountDef[]>(DEFAULT_ACCOUNTS);
  const [theme, setTheme] = useState<Theme>('dark');

  // Apply theme class to <html> whenever theme changes
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    if (!user) {
      setCategories(DEFAULT_CATEGORIES);
      setAccounts(DEFAULT_ACCOUNTS);
      setTheme('dark');
      return;
    }
    const ref = doc(db, 'users', user.uid, 'meta', 'settings');
    return onSnapshot(ref, snap => {
      if (!snap.exists()) {
        setDoc(ref, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, theme: 'dark' });
        return;
      }
      const d = snap.data();
      setCategories((d.categories as CategoryDef[]) ?? DEFAULT_CATEGORIES);
      setAccounts((d.accounts as AccountDef[]) ?? DEFAULT_ACCOUNTS);
      setTheme((d.theme as Theme) ?? 'dark');
    });
  }, [user]);

  const persist = useCallback(
    (cats: CategoryDef[], accs: AccountDef[], t: Theme) => {
      if (user) setDoc(doc(db, 'users', user.uid, 'meta', 'settings'), { categories: cats, accounts: accs, theme: t });
    },
    [user],
  );

  const saveCategories = useCallback((c: CategoryDef[]) => {
    setCategories(c);
    persist(c, accounts, theme);
  }, [accounts, theme, persist]);

  const saveAccounts = useCallback((a: AccountDef[]) => {
    setAccounts(a);
    persist(categories, a, theme);
  }, [categories, theme, persist]);

  const saveTheme = useCallback((t: Theme) => {
    setTheme(t);
    persist(categories, accounts, t);
  }, [categories, accounts, persist]);

  const getCat = useCallback(
    (id: string) => categories.find(c => c.id === id) ?? FALLBACK_CATEGORY(id),
    [categories],
  );
  const getAcc = useCallback(
    (id: string) => accounts.find(a => a.id === id) ?? FALLBACK_ACCOUNT(id),
    [accounts],
  );

  return (
    <SettingsContext.Provider value={{ categories, accounts, theme, getCat, getAcc, saveCategories, saveAccounts, saveTheme }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
