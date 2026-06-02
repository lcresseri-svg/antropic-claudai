import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { CategoryDef, AccountDef } from '../../types';
import {
  DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, FALLBACK_CATEGORY, FALLBACK_ACCOUNT,
} from '../../defaults';

type Theme = 'dark' | 'light';
export type InsightDepth = 'minimal' | 'medium' | 'advanced';

interface SettingsValue {
  categories: CategoryDef[];
  accounts: AccountDef[];
  theme: Theme;
  includeInvestments: boolean; // count invested capital in net worth
  enableInvestments: boolean;  // show/hide entire investments feature
  insightDepth: InsightDepth;
  aiEnabled: boolean;
  getCat: (id: string) => CategoryDef;
  getAcc: (id: string) => AccountDef;
  saveCategories: (c: CategoryDef[]) => void;
  saveAccounts: (a: AccountDef[]) => void;
  saveTheme: (t: Theme) => void;
  saveIncludeInvestments: (v: boolean) => void;
  saveEnableInvestments: (v: boolean) => void;
  saveInsightDepth: (v: InsightDepth) => void;
  saveAiEnabled: (v: boolean) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

const MERGE = { merge: true } as const;

export function SettingsProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [accounts, setAccounts] = useState<AccountDef[]>(DEFAULT_ACCOUNTS);
  const [theme, setTheme] = useState<Theme>('dark');
  const [includeInvestments, setIncludeInvestments] = useState(true);
  const [enableInvestments, setEnableInvestments] = useState(true);
  const [insightDepth, setInsightDepth] = useState<InsightDepth>('medium');
  const [aiEnabled, setAiEnabled] = useState(true);

  // Apply theme class to <html> immediately when state changes
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  useEffect(() => {
    if (!user) {
      setCategories(DEFAULT_CATEGORIES);
      setAccounts(DEFAULT_ACCOUNTS);
      setTheme('dark');
      setIncludeInvestments(true);
      setEnableInvestments(true);
      setInsightDepth('medium');
      setAiEnabled(true);
      return;
    }
    const ref = doc(db, 'users', user.uid, 'meta', 'settings');
    return onSnapshot(ref, snap => {
      if (!snap.exists()) {
        // CRITICAL: only seed defaults when the SERVER confirms the document is
        // missing. A cold/empty local cache also reports !exists() (fromCache),
        // and writing here would clobber a real user's settings. Also use merge
        // so we never blow away fields we didn't include.
        if (!snap.metadata.fromCache) {
          setDoc(ref, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, theme: 'dark' }, MERGE);
        }
        return;
      }
      const d = snap.data();
      setCategories((d.categories as CategoryDef[]) ?? DEFAULT_CATEGORIES);
      setAccounts((d.accounts as AccountDef[]) ?? DEFAULT_ACCOUNTS);
      setTheme((d.theme as Theme) ?? 'dark');
      setIncludeInvestments(d.includeInvestments ?? true);
      setEnableInvestments(d.enableInvestments ?? true);
      setInsightDepth((d.insightDepth as InsightDepth) ?? 'medium');
      setAiEnabled(d.aiEnabled ?? true);
    });
  }, [user]);

  // Each save function writes only its own field (merge: true) to avoid
  // stale-closure overwrites and race conditions with onSnapshot.
  const settingsRef = useCallback(
    () => doc(db, 'users', user!.uid, 'meta', 'settings'),
    [user],
  );

  const saveCategories = useCallback((c: CategoryDef[]) => {
    setCategories(c);
    if (user) setDoc(settingsRef(), { categories: c }, MERGE);
  }, [user, settingsRef]);

  const saveAccounts = useCallback((a: AccountDef[]) => {
    setAccounts(a);
    if (user) setDoc(settingsRef(), { accounts: a }, MERGE);
  }, [user, settingsRef]);

  const saveTheme = useCallback((t: Theme) => {
    setTheme(t);
    if (user) setDoc(settingsRef(), { theme: t }, MERGE);
  }, [user, settingsRef]);

  const saveIncludeInvestments = useCallback((v: boolean) => {
    setIncludeInvestments(v);
    if (user) setDoc(settingsRef(), { includeInvestments: v }, MERGE);
  }, [user, settingsRef]);

  const saveEnableInvestments = useCallback((v: boolean) => {
    setEnableInvestments(v);
    if (user) setDoc(settingsRef(), { enableInvestments: v }, MERGE);
  }, [user, settingsRef]);

  const saveInsightDepth = useCallback((v: InsightDepth) => {
    setInsightDepth(v);
    if (user) setDoc(settingsRef(), { insightDepth: v }, MERGE);
  }, [user, settingsRef]);

  const saveAiEnabled = useCallback((v: boolean) => {
    setAiEnabled(v);
    if (user) setDoc(settingsRef(), { aiEnabled: v }, MERGE);
  }, [user, settingsRef]);

  const getCat = useCallback(
    (id: string) => categories.find(c => c.id === id) ?? FALLBACK_CATEGORY(id),
    [categories],
  );
  const getAcc = useCallback(
    (id: string) => accounts.find(a => a.id === id) ?? FALLBACK_ACCOUNT(id),
    [accounts],
  );

  return (
    <SettingsContext.Provider value={{ categories, accounts, theme, includeInvestments, enableInvestments, insightDepth, aiEnabled, getCat, getAcc, saveCategories, saveAccounts, saveTheme, saveIncludeInvestments, saveEnableInvestments, saveInsightDepth, saveAiEnabled }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
