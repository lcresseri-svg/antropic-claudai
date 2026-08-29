import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { CategoryDef, AccountDef, ApplePayCardMapping } from '../../types';
import {
  DEFAULT_CATEGORIES, DEFAULT_ACCOUNTS, FALLBACK_CATEGORY, FALLBACK_ACCOUNT,
  SYSTEM_CATEGORIES,
} from '../../defaults';
import { canUseDetailedInvestments } from '../featureFlags';

type Theme = 'dark' | 'light';
export type InsightDepth = 'minimal' | 'medium' | 'advanced';

interface SettingsValue {
  categories: CategoryDef[];           // full source of truth (incl. archived) — editing + getCat
  accounts: AccountDef[];              // full source of truth (incl. archived) — editing + getAcc
  applePayCardMappings: ApplePayCardMapping[];
  visibleCategories: CategoryDef[];    // non-archived — pickers / enumerations / planning
  visibleAccounts: AccountDef[];       // non-archived — pickers / enumerations / planning
  theme: Theme;
  includeInvestments: boolean; // count invested capital in net worth
  enableInvestments: boolean;  // show/hide entire investments feature
  // NB: the legacy Firestore field `countInvestmentsInExpenses` is intentionally
  // IGNORED (never read, never deleted): the cash flow always follows the real
  // movements now (see shared/financialFlow.ts).
  enableBudget: boolean;       // show/hide the budget feature
  insightDepth: InsightDepth;
  aiEnabled: boolean;
  aiCoachWidgetEnabled: boolean;
  /** Deposito di sicurezza (€) sottratto dalla liquidità libera. 0 = non impostato. */
  cashReserve: number;
  /** Ordine scelto per i blocchi della home (solo telefono). Vuoto = default. */
  homeOrder: string[];
  detailedInvestments: boolean; // per-user gated: fund-type classification + TFR
  settingsLoaded: boolean;      // true after first Firestore snapshot resolves
  getCat: (id: string) => CategoryDef;
  getAcc: (id: string) => AccountDef;
  saveCategories: (c: CategoryDef[]) => void;
  saveAccounts: (a: AccountDef[]) => void;
  saveApplePayCardMapping: (mapping: ApplePayCardMapping) => void;
  removeApplePayCardMapping: (cardKey: string) => void;
  saveTheme: (t: Theme) => void;
  saveIncludeInvestments: (v: boolean) => void;
  saveEnableInvestments: (v: boolean) => void;
  saveEnableBudget: (v: boolean) => void;
  saveInsightDepth: (v: InsightDepth) => void;
  saveAiEnabled: (v: boolean) => void;
  saveAiCoachWidgetEnabled: (v: boolean) => void;
  saveCashReserve: (v: number) => void;
  saveHomeOrder: (order: string[]) => void;
  /** Update an investment category's manually-entered market value (+ timestamp). */
  saveCurrentValue: (categoryId: string, value: number) => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

const MERGE = { merge: true } as const;

const THEME_KEY = 'sunny-theme';

/** Riserva di sicurezza pre-impostata, invariata rispetto al valore che la
 *  schermata Patrimonio V2 usava quando era solo uno stato locale. */
/** Deposito di sicurezza: **zero finché non lo imposti**. Da quando entra nel
 *  calcolo della liquidità libera in home, un default diverso da 0 toglierebbe
 *  soldi dalla headline di chi non l'ha mai chiesto. Chi l'aveva già impostato
 *  ha il valore su `meta/settings` e non è toccato. */
const DEFAULT_CASH_RESERVE = 0;

// Default theme follows the OS unless the user has saved an explicit preference.
function systemTheme(): Theme {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

// Last applied theme, cached locally so the next launch can paint the saved mode
// synchronously (before the cloud settings round-trip) — no light/dark flash.
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  return systemTheme();
}

export function SettingsProvider({ user, children }: { user: User | null; children: ReactNode }) {
  const [categories, setCategories] = useState<CategoryDef[]>(DEFAULT_CATEGORIES);
  const [accounts, setAccounts] = useState<AccountDef[]>(DEFAULT_ACCOUNTS);
  const [applePayCardMappings, setApplePayCardMappings] = useState<ApplePayCardMapping[]>([]);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [includeInvestments, setIncludeInvestments] = useState(true);
  const [enableInvestments, setEnableInvestments] = useState(true);
  const [enableBudget, setEnableBudget] = useState(true);
  const [insightDepth, setInsightDepth] = useState<InsightDepth>('medium');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiCoachWidgetEnabled, setAiCoachWidgetEnabled] = useState(false);
  const [cashReserve, setCashReserve] = useState(DEFAULT_CASH_RESERVE);
  const [homeOrder, setHomeOrder] = useState<string[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Apply theme class to <html> immediately when state changes, and cache it so
  // the boot script (index.html) can restore the saved mode on the next launch.
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    if (!user) {
      setCategories(DEFAULT_CATEGORIES);
      setAccounts(DEFAULT_ACCOUNTS);
      setApplePayCardMappings([]);
      setTheme(initialTheme());
      setIncludeInvestments(true);
      setEnableInvestments(true);
      setEnableBudget(true);
      setInsightDepth('medium');
      setAiEnabled(false);
      setAiCoachWidgetEnabled(false);
      setCashReserve(DEFAULT_CASH_RESERVE);
      setHomeOrder([]);
      setSettingsLoaded(false);
      return;
    }
    setSettingsLoaded(false);
    const ref = doc(db, 'users', user.uid, 'meta', 'settings');
    return onSnapshot(ref, snap => {
      if (!snap.exists()) {
        // CRITICAL: only seed defaults when the SERVER confirms the document is
        // missing. A cold/empty local cache also reports !exists() (fromCache),
        // and writing here would clobber a real user's settings. Also use merge
        // so we never blow away fields we didn't include.
        if (!snap.metadata.fromCache) {
          setDoc(ref, { categories: DEFAULT_CATEGORIES, accounts: DEFAULT_ACCOUNTS, theme: systemTheme() }, MERGE);
          setSettingsLoaded(true);
        }
        return;
      }
      const d = snap.data();
      setCategories((d.categories as CategoryDef[]) ?? DEFAULT_CATEGORIES);
      setAccounts((d.accounts as AccountDef[]) ?? DEFAULT_ACCOUNTS);
      setApplePayCardMappings(
        Array.isArray(d.applePayCardMappings)
          ? (d.applePayCardMappings as ApplePayCardMapping[]).filter(m =>
              !!m && typeof m.cardKey === 'string' && typeof m.cardLabel === 'string'
              && typeof m.accountId === 'string')
          : [],
      );
      setTheme((d.theme as Theme) ?? systemTheme());
      setIncludeInvestments(d.includeInvestments ?? true);
      setEnableInvestments(d.enableInvestments ?? true);
      setEnableBudget(d.enableBudget ?? true);
      setInsightDepth((d.insightDepth as InsightDepth) ?? 'medium');
      setAiEnabled(d.aiEnabled ?? false);
      setAiCoachWidgetEnabled(d.aiCoachWidgetEnabled ?? false);
      setCashReserve(typeof d.cashReserve === 'number' && d.cashReserve >= 0 ? d.cashReserve : DEFAULT_CASH_RESERVE);
      setHomeOrder(Array.isArray(d.homeOrder) ? (d.homeOrder as unknown[]).filter((x): x is string => typeof x === 'string') : []);
      setSettingsLoaded(true);
    });
  // uid, not user object — avoids listener recreation on every token refresh.
  }, [user?.uid]);

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

  const saveApplePayCardMapping = useCallback((mapping: ApplePayCardMapping) => {
    const next = [
      ...applePayCardMappings.filter(m => m.cardKey !== mapping.cardKey),
      mapping,
    ].slice(-50);
    setApplePayCardMappings(next);
    if (user) setDoc(settingsRef(), { applePayCardMappings: next }, MERGE);
  }, [applePayCardMappings, user, settingsRef]);

  const removeApplePayCardMapping = useCallback((cardKey: string) => {
    const next = applePayCardMappings.filter(m => m.cardKey !== cardKey);
    setApplePayCardMappings(next);
    if (user) setDoc(settingsRef(), { applePayCardMappings: next }, MERGE);
  }, [applePayCardMappings, user, settingsRef]);

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

  const saveEnableBudget = useCallback((v: boolean) => {
    setEnableBudget(v);
    if (user) setDoc(settingsRef(), { enableBudget: v }, MERGE);
  }, [user, settingsRef]);

  const saveInsightDepth = useCallback((v: InsightDepth) => {
    setInsightDepth(v);
    if (user) setDoc(settingsRef(), { insightDepth: v }, MERGE);
  }, [user, settingsRef]);

  const saveAiEnabled = useCallback((v: boolean) => {
    setAiEnabled(v);
    if (user) setDoc(settingsRef(), { aiEnabled: v }, MERGE);
  }, [user, settingsRef]);

  const saveAiCoachWidgetEnabled = useCallback((v: boolean) => {
    setAiCoachWidgetEnabled(v);
    if (user) setDoc(settingsRef(), { aiCoachWidgetEnabled: v }, MERGE);
  }, [user, settingsRef]);

  // Mai negativa (stessa clamp del modulo puro availableCash). Chi chiama
  // dovrebbe già farlo di suo: qui è la rete di sicurezza prima della scrittura.
  const saveHomeOrder = useCallback((order: string[]) => {
    setHomeOrder(order);
    if (user) setDoc(settingsRef(), { homeOrder: order }, MERGE);
  }, [user, settingsRef]);

  const saveCashReserve = useCallback((v: number) => {
    const next = Math.max(0, Number.isFinite(v) ? v : 0);
    setCashReserve(next);
    if (user) setDoc(settingsRef(), { cashReserve: next }, MERGE);
  }, [user, settingsRef]);

  // Non-archived subsets — what pickers, management lists, budget rows, the
  // investment allocation and the forecast/insight inputs should enumerate.
  // The full `categories`/`accounts` arrays stay the source of truth (editing +
  // getCat/getAcc, which must still resolve archived entries for history).
  const visibleCategories = useMemo(() => categories.filter(c => !c.archived), [categories]);
  const visibleAccounts = useMemo(() => accounts.filter(a => !a.archived), [accounts]);

  const detailedInvestments = canUseDetailedInvestments(user);

  const saveCurrentValue = useCallback((categoryId: string, value: number) => {
    const next = categories.map(c => c.id === categoryId
      ? { ...c, currentValue: value, lastValueUpdate: new Date().toISOString().slice(0, 10) }
      : c);
    setCategories(next);
    if (user) setDoc(settingsRef(), { categories: next }, MERGE);
  }, [categories, user, settingsRef]);

  // System categories (realized gain/loss) resolve for display everywhere but
  // never appear in user lists and are never persisted.
  const getCat = useCallback(
    (id: string) =>
      categories.find(c => c.id === id)
      ?? SYSTEM_CATEGORIES.find(c => c.id === id)
      ?? FALLBACK_CATEGORY(id),
    [categories],
  );
  const getAcc = useCallback(
    (id: string) => accounts.find(a => a.id === id) ?? FALLBACK_ACCOUNT(id),
    [accounts],
  );

  return (
    <SettingsContext.Provider value={{ categories, accounts, applePayCardMappings, visibleCategories, visibleAccounts, theme, includeInvestments, enableInvestments, enableBudget, insightDepth, aiEnabled, aiCoachWidgetEnabled, cashReserve, homeOrder, detailedInvestments, settingsLoaded, getCat, getAcc, saveCategories, saveAccounts, saveApplePayCardMapping, removeApplePayCardMapping, saveTheme, saveIncludeInvestments, saveEnableInvestments, saveEnableBudget, saveInsightDepth, saveAiEnabled, saveAiCoachWidgetEnabled, saveCashReserve, saveHomeOrder, saveCurrentValue }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
