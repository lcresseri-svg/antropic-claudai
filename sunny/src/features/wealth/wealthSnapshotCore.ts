/**
 * Wealth snapshots (admin-only, flag `wealth_v2`).
 *
 * users/{uid}/wealthSnapshots/{YYYY-MM-DD} — one document per Europe/Rome
 * calendar day. Idempotent by construction: regenerating the same day rewrites
 * the SAME doc (rules allow create+update, never delete).
 *
 * Sources:
 *  - 'live'                today's snapshot, market values from settings;
 *  - 'backfill_real'       a past day rebuilt from the full transaction log —
 *                          cash and invested capital are exact;
 *  - 'backfill_estimated'  reserved for a future estimation path. The current
 *                          backfill NEVER invents market values for past days:
 *                          past investments are valued at deposited capital and
 *                          the missing market data is declared in `missing`.
 *
 * No mass writes at app open: the caller (admin screen) triggers today's
 * snapshot at most once per session, and backfill always runs dry-run first.
 */
import { Transaction, AccountDef, CategoryDef, STALE_DAYS } from '../../types';
import { accountDelta, investedDelta } from '../../shared/financialFlow';

export const WEALTH_SNAPSHOT_VERSION = 1;

export type WealthSnapshotSource = 'live' | 'backfill_real' | 'backfill_estimated';

export interface WealthSnapshot {
  version: number;
  /** Europe/Rome calendar day this snapshot refers to (== doc id). */
  dateKey: string;
  totalNetWorth: number;      // cash + investments − liabilities
  cash: number;               // Σ positive account balances
  investments: number;        // market value where known, else deposited capital
  liabilities: number;        // Σ |negative account balances|
  investedCapital: number;    // versato (net deposits, floored per category)
  marketGain: number;         // investments − investedCapital
  accountBalances: Record<string, number>;
  investmentValues: Record<string, number>;
  /** Category ids whose market value is missing or older than STALE_DAYS. */
  staleValues: string[];
  /** What this snapshot could NOT know (declared, never invented). */
  missing: string[];
  source: WealthSnapshotSource;
  generatedAt: number;        // ms epoch
}

/** Europe/Rome calendar day for the given instant (fr-CA → ISO shape). */
export function romeDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Build the snapshot for `dateKey` from the in-memory transaction log.
 * Pure and deterministic: same inputs → same snapshot (minus generatedAt).
 *
 * Market values (CategoryDef.currentValue) are applied ONLY when the snapshot
 * day is the current day — for past days we cannot know the historical market
 * value, so investments fall back to deposited capital and the gap is declared
 * in `missing` (source becomes 'backfill_real').
 */
export function buildWealthSnapshot(
  transactions: Transaction[],
  accounts: AccountDef[],
  categories: CategoryDef[],
  dateKey: string,
  opts?: { todayKey?: string },
): WealthSnapshot {
  const todayKey = opts?.todayKey ?? romeDayKey();
  const isToday = dateKey === todayKey;

  const balances: Record<string, number> = {};
  for (const a of accounts) if (a.initialBalance) balances[a.id] = a.initialBalance;
  const bal = (id: string, d: number) => { if (!id) return; balances[id] = (balances[id] ?? 0) + d; };

  const invested: Record<string, number> = {};
  for (const c of categories) {
    if (c.kind === 'investment' && c.initialBalance) invested[c.id] = (invested[c.id] ?? 0) + c.initialBalance;
  }

  for (const t of transactions) {
    if (t.projected || t.date > dateKey) continue;
    // Shared accountDelta math: TFR share and source-less deposits never touch
    // any account; invested capital counts the FULL amount (direction-aware).
    bal(t.account, accountDelta(t, t.account));
    if (t.type === 'transfer' && t.toAccount) bal(t.toAccount, accountDelta(t, t.toAccount));
    if (t.type === 'investment') {
      invested[t.category] = (invested[t.category] ?? 0) + investedDelta(t);
    }
  }

  let cash = 0, liabilities = 0;
  const accountBalances: Record<string, number> = {};
  for (const [id, v] of Object.entries(balances)) {
    accountBalances[id] = r2(v);
    if (v >= 0) cash += v; else liabilities += -v;
  }

  const investmentValues: Record<string, number> = {};
  const staleValues: string[] = [];
  const missing: string[] = [];
  let investments = 0, investedCapital = 0;
  for (const c of categories) {
    if (c.kind !== 'investment') continue;
    const versato = Math.max(0, invested[c.id] ?? 0);
    if (versato <= 0 && !c.currentValue) continue;
    investedCapital += versato;

    const hasMarket = typeof c.currentValue === 'number';
    if (isToday && hasMarket) {
      investmentValues[c.id] = r2(c.currentValue as number);
      const age = c.lastValueUpdate
        ? Math.floor((Date.parse(dateKey) - Date.parse(c.lastValueUpdate)) / 86_400_000)
        : null;
      if (age === null || age > STALE_DAYS) staleValues.push(c.id);
    } else {
      investmentValues[c.id] = r2(versato);
      if (hasMarket) missing.push(`market-value:${c.id}`); // known today, unknowable for the past
      else staleValues.push(c.id);
    }
    investments += investmentValues[c.id];
  }

  return {
    version: WEALTH_SNAPSHOT_VERSION,
    dateKey,
    totalNetWorth: r2(cash + investments - liabilities),
    cash: r2(cash),
    investments: r2(investments),
    liabilities: r2(liabilities),
    investedCapital: r2(investedCapital),
    marketGain: r2(investments - investedCapital),
    accountBalances,
    investmentValues,
    staleValues,
    missing,
    source: isToday ? 'live' : 'backfill_real',
    generatedAt: Date.now(),
  };
}

// ── Backfill (dry-run first, bounded, month-end granularity) ─────────────────

export type BackfillDataQuality = 'real' | 'estimated' | 'missing';

export interface BackfillPlanEntry {
  dateKey: string;
  /** real = exact from the transaction log; estimated = market values unknown,
   *  valued at versato; missing = no data at all before the first movement. */
  quality: BackfillDataQuality;
  snapshot: WealthSnapshot | null; // null when quality === 'missing'
}

/**
 * DRY-RUN: plan month-end snapshots from the first transaction (or `fromKey`)
 * up to the last COMPLETE month. Nothing is written. Each entry declares its
 * data quality so the admin can review before applying:
 *  - days covered by the log → 'real' cash/capital, but since historical market
 *    values are unknowable the entry is marked 'estimated' whenever the user has
 *    market-valued categories (the value shown falls back to versato);
 *  - days before the first movement → 'missing' (never invented).
 */
export function planWealthBackfill(
  transactions: Transaction[],
  accounts: AccountDef[],
  categories: CategoryDef[],
  opts?: { fromKey?: string; todayKey?: string; maxMonths?: number },
): BackfillPlanEntry[] {
  const todayKey = opts?.todayKey ?? romeDayKey();
  const maxMonths = opts?.maxMonths ?? 24;
  const real = transactions.filter(t => !t.projected && t.date <= todayKey);
  if (real.length === 0) return [];

  const firstDate = real.reduce((a, t) => (t.date < a ? t.date : a), real[0].date);
  const from = opts?.fromKey && opts.fromKey > firstDate ? opts.fromKey : firstDate;
  const hasMarketCats = categories.some(c => c.kind === 'investment' && typeof c.currentValue === 'number');

  // Month-end keys from `from`'s month to the last complete month before today.
  const entries: BackfillPlanEntry[] = [];
  const [fy, fm] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = todayKey.slice(0, 7).split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm); // count of COMPLETE months before the current one
  let y = fy, m = fm;
  if (months > maxMonths) {
    const skip = months - maxMonths;
    m += skip; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12) + 1;
    months = maxMonths;
  }
  for (let i = 0; i < months; i++) {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    if (dateKey < from) {
      entries.push({ dateKey, quality: 'missing', snapshot: null });
    } else {
      const snapshot = buildWealthSnapshot(transactions, accounts, categories, dateKey, { todayKey });
      // Historical market values are unknowable: when the user tracks market
      // values, a past snapshot is an ESTIMATE (investments at versato).
      const quality: BackfillDataQuality = hasMarketCats ? 'estimated' : 'real';
      if (quality === 'estimated') snapshot.source = 'backfill_estimated';
      entries.push({ dateKey, quality, snapshot });
    }
    m++; if (m > 12) { m = 1; y++; }
  }
  return entries;
}
