import { describe, it, expect } from 'vitest';
import { Transaction, AccountDef, CategoryDef } from '../../types';
import { buildWealthSnapshot, planWealthBackfill, WEALTH_SNAPSHOT_VERSION } from './wealthSnapshotCore';

const TODAY = '2026-07-10';

const accounts: AccountDef[] = [
  { id: 'cc', label: 'Conto', icon: '🏦', color: '#fff', initialBalance: 500 },
];

const categories: CategoryDef[] = [
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#fff', kind: 'expense' },
  { id: 'etf', label: 'ETF', icon: '📈', color: '#fff', kind: 'investment', currentValue: 700, lastValueUpdate: '2026-07-08' },
];

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-05-10', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

const fixture: Transaction[] = [
  tx({ date: '2026-05-10', type: 'income', amount: 1000 }),
  tx({ date: '2026-05-20', type: 'expense', amount: 300 }),
  tx({ date: '2026-06-05', type: 'investment', category: 'etf', amount: 500 }),
  tx({ date: '2026-07-03', type: 'expense', amount: 100 }),
];

describe('buildWealthSnapshot', () => {
  it('today: market values applied, totals coherent', () => {
    const s = buildWealthSnapshot(fixture, accounts, categories, TODAY, { todayKey: TODAY });
    expect(s.version).toBe(WEALTH_SNAPSHOT_VERSION);
    expect(s.dateKey).toBe(TODAY);
    expect(s.source).toBe('live');
    // cash: 500 + 1000 − 300 − 500 − 100 = 600
    expect(s.cash).toBe(600);
    expect(s.investments).toBe(700);        // market value
    expect(s.investedCapital).toBe(500);    // versato
    expect(s.marketGain).toBe(200);
    expect(s.totalNetWorth).toBe(1300);
    expect(s.liabilities).toBe(0);
    expect(s.staleValues).toEqual([]);      // updated 2 days ago
  });

  it('past day: never applies today\'s market value (no invented history)', () => {
    const s = buildWealthSnapshot(fixture, accounts, categories, '2026-06-30', { todayKey: TODAY });
    expect(s.source).toBe('backfill_real');
    // cash at 2026-06-30: 500 + 1000 − 300 − 500 = 700
    expect(s.cash).toBe(700);
    expect(s.investments).toBe(500);        // versato fallback
    expect(s.marketGain).toBe(0);
    expect(s.missing).toContain('market-value:etf');
  });

  it('is idempotent: same inputs → same snapshot (minus generatedAt)', () => {
    const a = buildWealthSnapshot(fixture, accounts, categories, TODAY, { todayKey: TODAY });
    const b = buildWealthSnapshot(fixture, accounts, categories, TODAY, { todayKey: TODAY });
    const { generatedAt: _a, ...restA } = a;
    const { generatedAt: _b, ...restB } = b;
    expect(restA).toEqual(restB);
  });

  it('negative balances become liabilities', () => {
    const s = buildWealthSnapshot(
      [tx({ date: '2026-05-01', type: 'expense', amount: 900 })],
      accounts, categories, TODAY, { todayKey: TODAY });
    expect(s.cash).toBe(0);
    expect(s.liabilities).toBe(400); // 500 − 900
  });
});

describe('planWealthBackfill (dry-run)', () => {
  it('plans month-end snapshots for complete months only, nothing before data', () => {
    const plan = planWealthBackfill(fixture, accounts, categories, { todayKey: TODAY });
    expect(plan.map(p => p.dateKey)).toEqual(['2026-05-31', '2026-06-30']);
    // The user tracks market values → past days are declared estimates.
    expect(plan.every(p => p.quality === 'estimated')).toBe(true);
    expect(plan.every(p => p.snapshot?.source === 'backfill_estimated')).toBe(true);
  });

  it('marks quality real when no market values are tracked', () => {
    const noMarket = categories.map(c => ({ ...c, currentValue: undefined }));
    const plan = planWealthBackfill(fixture, accounts, noMarket, { todayKey: TODAY });
    expect(plan.every(p => p.quality === 'real')).toBe(true);
  });

  it('returns an empty plan without transactions and caps the month range', () => {
    expect(planWealthBackfill([], accounts, categories, { todayKey: TODAY })).toEqual([]);
    const old = [tx({ date: '2020-01-15', type: 'income', amount: 10 })];
    const plan = planWealthBackfill(old, accounts, categories, { todayKey: TODAY, maxMonths: 6 });
    expect(plan.length).toBe(6);
    expect(plan[plan.length - 1].dateKey).toBe('2026-06-30');
  });
});
