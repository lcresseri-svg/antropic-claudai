import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from './firebase';
import { CategoryDef, AccountDef } from './types';
import {
  DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, FALLBACK_CATEGORY, FALLBACK_ACCOUNT,
} from './defaults';

interface SettingsValue {
  categories: CategoryDef[];
  accounts: AccountDef[];
  anthropicApiKey: string;
  getCat: (id: string) => CategoryDef;
  getAcc: (id: string) => AccountDef;
  saveCategories: (c: CategoryDef[]) => void;
  saveAccounts: (a: AccountDef[]) => void;
  saveApiKey: (key: string) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [accounts, setAccounts] = useState<AccountDef[]>(DEFAULT_ACCOUNTS);
  const [anthropicApiKey, setAnthropicApiKey] = useState('');

  useEffect(() => {
    if (!user) {
      setCategories(DEFAULT_CATEGORIES);
      setAccounts(DEFAULT_ACCOUNTS);
      setAnthropicApiKey('');
      return;
    }
    const ref = doc(db, 'users', user.uid, 'meta', 'settings');
    return onSnapshot(ref, snap => {
      if (!snap.exists()) {
        setDoc(ref, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS });
        return;
      }
      const d = snap.data();
      setCategories((d.categories as CategoryDef[]) ?? DEFAULT_CATEGORIES);
      setAccounts((d.accounts as AccountDef[]) ?? DEFAULT_ACCOUNTS);
      setAnthropicApiKey((d.anthropicApiKey as string) ?? '');
    });
  }, [user]);

  const persist = useCallback(
    (cats: CategoryDef[], accs: AccountDef[], apiKey: string) => {
      if (user) setDoc(doc(db, 'users', user.uid, 'meta', 'settings'), { categories: cats, accounts: accs, anthropicApiKey: apiKey });
    },
    [user],
  );

  const saveCategories = useCallback((c: CategoryDef[]) => {
    setCategories(c);
    persist(c, accounts, anthropicApiKey);
  }, [accounts, anthropicApiKey, persist]);

  const saveAccounts = useCallback((a: AccountDef[]) => {
    setAccounts(a);
    persist(categories, a, anthropicApiKey);
  }, [categories, anthropicApiKey, persist]);

  const saveApiKey = useCallback((key: string) => {
    setAnthropicApiKey(key);
    persist(categories, accounts, key);
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
    <SettingsContext.Provider value={{ categories, accounts, anthropicApiKey, getCat, getAcc, saveCategories, saveAccounts, saveApiKey }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
