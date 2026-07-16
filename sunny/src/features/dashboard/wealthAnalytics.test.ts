import { describe, it, expect } from 'vitest';
import {
  buildWealthHistory, buildWealthPeriodSummary, buildWealthComparisons,
  buildWealthNote, shiftMonthsISO, WealthPeriodSummary,
} from './wealthAnalytics';
import { Transaction, AccountDef, CategoryDef } from '../../types';

// Fixed "now": 15 July 2026, mid-month, no DST edge. Anchored in UTC because
// the engine derives "today" with the dashboard's convention (toISOString).
const NOW = new Date('2026-07-15T12:00:00Z');
const TODAY = '2026-07-15';

const ACCOUNTS: AccountDef[] = [
  { id: 'conto', label: 'Conto', icon: '🏦', color: '#888', initialBalance: 1000 },
  { id: 'risparmio', label: 'Risparmio', icon: '💰', color: '#888', initialBalance: 500 },
];

const CATS: CategoryDef[] = [
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#888', kind: 'expense' },
  { id: 'stipendio', label: 'Stipendio', icon: '💼', color: '#888', kind: 'income' },
  { id: 'etf', label: 'ETF', icon: '📈', color: '#888', kind: 'investment' },
];

let seq = 0;
const tx = (over: Partial<Transaction>): Transaction => ({
  id: `t${++seq}`, date: '2026-07-01', description: 'test', amount: 100,
  type: 'expense', category: 'spesa', account: 'conto', ...over,
});

const lastPoint = (s: WealthPeriodSummary) => s.points[s.points.length - 1];

describe('buildWealthHistory — stock semantics', () => {
  it('starts from initial balances with no transactions (zero investments)', () => {
    const pts = buildWealthHistory([], ACCOUNTS, CATS, '1m', { now: NOW });
    expect(pts.length).toBeGreaterThan(2);
    for (const p of pts) {
      expect(p.liquidity).toBe(1500);
      expect(p.investments).toBe(0);
      expect(p.total).toBe(1500);
    }
    expect(pts[pts.length - 1].date).toBe(TODAY);
  });

  it('an expense reduces liquidity AND total from its date on (ownShare)', () => {
    const txs = [tx({ date: '2026-07-10', amount: 100, shared: 40 })]; // own part 60
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    const before = pts.find(p => p.date === '2026-07-09')!;
    const after = pts.find(p => p.date === '2026-07-10')!;
    expect(before.total).toBe(1500);
    expect(after.liquidity).toBe(1440);
    expect(after.total).toBe(1440);
  });

  it('an income increases liquidity AND total', () => {
    const txs = [tx({ date: '2026-07-10', type: 'income', category: 'stipendio', amount: 200 })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    expect(pts[pts.length - 1].liquidity).toBe(1700);
    expect(pts[pts.length - 1].total).toBe(1700);
  });

  it('a transfer between tracked accounts changes NOTHING (neither liquidity nor total)', () => {
    const txs = [tx({ date: '2026-07-10', type: 'transfer', category: 'spesa', amount: 300, account: 'conto', toAccount: 'risparmio' })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    for (const p of pts) {
      expect(p.liquidity).toBe(1500);
      expect(p.total).toBe(1500);
    }
  });

  it('an investment deposit moves liquidity → investments WITHOUT changing total', () => {
    const txs = [tx({ date: '2026-07-10', type: 'investment', category: 'etf', amount: 400 })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    const before = pts.find(p => p.date === '2026-07-09')!;
    const after = pts.find(p => p.date === '2026-07-10')!;
    expect(before).toMatchObject({ liquidity: 1500, investments: 0, total: 1500 });
    expect(after).toMatchObject({ liquidity: 1100, investments: 400, total: 1500 });
  });

  it('spec example — deposit 300 with TFR 200 FROM an account: conto −100, investito +300, patrimonio +200', () => {
    const txs = [tx({ date: '2026-07-10', type: 'investment', category: 'etf', amount: 300, tfr: 200 })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    const after = pts.find(p => p.date === '2026-07-10')!;
    expect(after).toMatchObject({ liquidity: 1400, investments: 300, total: 1700 });
  });

  it('spec example — deposit 300 with TFR 200 WITHOUT account: liquidità invariata, patrimonio +300', () => {
    const txs = [tx({ date: '2026-07-10', type: 'investment', category: 'etf', amount: 300, tfr: 200, account: '' })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    const after = pts.find(p => p.date === '2026-07-10')!;
    expect(after).toMatchObject({ liquidity: 1500, investments: 300, total: 1800 });
  });

  it('an investment withdrawal moves value back to liquidity, total unchanged', () => {
    const txs = [
      tx({ date: '2026-07-05', type: 'investment', category: 'etf', amount: 400 }),
      tx({ date: '2026-07-10', type: 'investment', category: 'etf', amount: 150, direction: 'out' }),
    ];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    const after = pts.find(p => p.date === '2026-07-10')!;
    expect(after).toMatchObject({ liquidity: 1250, investments: 250, total: 1500 });
  });

  it('investments are ALWAYS part of the total (no includeInvestments gate here)', () => {
    const cats = CATS.map(c => c.id === 'etf' ? { ...c, initialBalance: 2000 } : c);
    const pts = buildWealthHistory([], ACCOUNTS, cats, '1m', { now: NOW });
    expect(pts[pts.length - 1].investments).toBe(2000);
    expect(pts[pts.length - 1].total).toBe(3500);
  });

  it('ignores currentValue: investments are net deposited capital (al netto degli interessi)', () => {
    const cats = CATS.map(c => c.id === 'etf' ? { ...c, currentValue: 900 } : c);
    const txs = [tx({ date: '2026-07-05', type: 'investment', category: 'etf', amount: 400 })];
    const pts = buildWealthHistory(txs, ACCOUNTS, cats, '1m', { now: NOW });
    const mid = pts.find(p => p.date === '2026-07-10')!;
    const last = pts[pts.length - 1];
    expect(mid.investments).toBe(400);
    expect(last.investments).toBe(400);        // NOT 900: latent gains excluded
    expect(last.total).toBe(1500);             // matches the dashboard net worth
  });

  it('investments track the deposited capital when no currentValue exists', () => {
    const txs = [tx({ date: '2026-07-05', type: 'investment', category: 'etf', amount: 400 })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    expect(pts[pts.length - 1].investments).toBe(400);
  });

  it('forward-fills: points between movements carry the last value', () => {
    const txs = [tx({ date: '2026-06-20', amount: 100 })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    // Every point after the expense (all of them: period starts 15 June) up to
    // today holds steady at 1400.
    const after = pts.filter(p => p.date >= '2026-06-20');
    expect(after.length).toBeGreaterThan(5);
    for (const p of after) expect(p.total).toBe(1400);
  });

  it('excludes projected rows and future-dated movements', () => {
    const txs = [
      tx({ date: '2026-07-10', amount: 100, projected: true }),
      tx({ date: '2026-08-10', amount: 100 }), // future: beyond every sample date
    ];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    expect(pts[pts.length - 1].total).toBe(1500);
  });

  it('supports negative liquidity and negative totals', () => {
    const txs = [tx({ date: '2026-07-10', amount: 2000 })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    expect(pts[pts.length - 1].liquidity).toBe(-500);
    expect(pts[pts.length - 1].total).toBe(-500);
  });

  it('floors invested capital at 0 per category (over-withdrawal)', () => {
    const txs = [
      tx({ date: '2026-07-05', type: 'investment', category: 'etf', amount: 100 }),
      tx({ date: '2026-07-10', type: 'investment', category: 'etf', amount: 300, direction: 'out' }),
    ];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    const last = pts[pts.length - 1];
    expect(last.investments).toBe(0);
    expect(last.liquidity).toBe(1700); // −100 + 300 cash back
  });

  it('bucket sizes follow the period (daily / weekly / monthly)', () => {
    const p1m = buildWealthHistory([], ACCOUNTS, CATS, '1m', { now: NOW });
    const p3m = buildWealthHistory([], ACCOUNTS, CATS, '3m', { now: NOW });
    const p1y = buildWealthHistory([], ACCOUNTS, CATS, '1y', { now: NOW });
    expect(p1m.length).toBe(31);      // 15 Jun → 15 Jul, daily
    expect(p3m.length).toBe(14);      // 13 weeks + closing snapshot
    expect(p1y.length).toBe(13);      // 12 monthly steps + today
    // All series end exactly today.
    for (const pts of [p1m, p3m, p1y]) expect(pts[pts.length - 1].date).toBe(TODAY);
  });

  it('"today" follows the dashboard convention (UTC toISOString), so the two screens agree', () => {
    // Just after local midnight in Italy (UTC+2) the UTC date is still the 14th:
    // the last point must stop at the 14th — exactly like the dashboard's
    // realized filter — and NOT count movements dated the new local day.
    const lateNight = new Date('2026-07-14T22:30:00Z'); // 00:30 local (CEST) on the 15th
    const txs = [tx({ date: '2026-07-15', amount: 100 })]; // dated the new local day
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, '1m', { now: lateNight });
    expect(pts[pts.length - 1].date).toBe('2026-07-14');
    expect(pts[pts.length - 1].total).toBe(1500); // the 15th's expense NOT counted yet
  });

  it("'all' starts at the first movement", () => {
    const txs = [tx({ date: '2025-03-10', amount: 50 })];
    const pts = buildWealthHistory(txs, ACCOUNTS, CATS, 'all', { now: NOW });
    expect(pts[0].date).toBe('2025-03-10');
    expect(pts[pts.length - 1].date).toBe(TODAY);
  });
});

describe('buildWealthPeriodSummary', () => {
  it('computes per-metric start/end/delta/deltaPct', () => {
    const txs = [
      tx({ date: '2026-07-05', type: 'income', category: 'stipendio', amount: 500 }),
      tx({ date: '2026-07-10', type: 'investment', category: 'etf', amount: 400 }),
    ];
    const s = buildWealthPeriodSummary(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    expect(s.total.startValue).toBe(1500);
    expect(s.total.endValue).toBe(2000);
    expect(s.total.delta).toBe(500);
    expect(s.total.deltaPct).toBeCloseTo(33.33, 1);
    expect(s.liquidity.delta).toBe(100);     // +500 income − 400 invested
    expect(s.investments.delta).toBe(400);
    expect(lastPoint(s).total).toBe(2000);
  });

  it('deltaPct is null when the start value is ~0 — for every metric', () => {
    const accounts: AccountDef[] = [{ id: 'conto', label: 'Conto', icon: '🏦', color: '#888' }];
    const txs = [tx({ date: '2026-07-10', type: 'income', category: 'stipendio', amount: 500 })];
    const s = buildWealthPeriodSummary(txs, accounts, CATS, '1m', { now: NOW });
    expect(s.total.deltaPct).toBeNull();
    expect(s.liquidity.deltaPct).toBeNull();
    expect(s.investments.deltaPct).toBeNull();
    expect(s.total.delta).toBe(500);
  });

  it('deltaPct uses |start| so a negative start still yields a signed % of recovery', () => {
    const accounts: AccountDef[] = [{ id: 'conto', label: 'Conto', icon: '🏦', color: '#888', initialBalance: -1000 }];
    const txs = [tx({ date: '2026-07-10', type: 'income', category: 'stipendio', amount: 500 })];
    const s = buildWealthPeriodSummary(txs, accounts, CATS, '1m', { now: NOW });
    expect(s.total.startValue).toBe(-1000);
    expect(s.total.endValue).toBe(-500);
    expect(s.total.deltaPct).toBe(50);
  });

  it('min/max/average per metric + best/worst total movement', () => {
    const txs = [
      tx({ date: '2026-06-20', type: 'income', category: 'stipendio', amount: 1000 }),
      tx({ date: '2026-07-01', amount: 400 }),
    ];
    const s = buildWealthPeriodSummary(txs, ACCOUNTS, CATS, '1m', { now: NOW });
    expect(s.minTotal).toBe(1500);
    expect(s.maxTotal).toBe(2500);
    expect(s.averageTotal).toBeGreaterThan(1500);
    expect(s.averageTotal).toBeLessThan(2500);
    expect(s.bestTotalDay?.date).toBe('2026-06-20');
    expect(s.worstTotalDay?.date).toBe('2026-07-01');
    expect(s.minInvestments).toBe(0);
    expect(s.maxInvestments).toBe(0);
  });

  it('no best/worst day when the series is flat', () => {
    const s = buildWealthPeriodSummary([], ACCOUNTS, CATS, '1m', { now: NOW });
    expect(s.bestTotalDay).toBeUndefined();
    expect(s.worstTotalDay).toBeUndefined();
  });
});

describe('buildWealthComparisons', () => {
  it('returns the four trailing windows with per-metric summaries', () => {
    const txs = [
      tx({ date: '2026-07-01', type: 'income', category: 'stipendio', amount: 300 }), // in ALL windows
      tx({ date: '2026-03-01', amount: 200 }),                                        // only in 6m/1y
    ];
    const cmp = buildWealthComparisons(txs, ACCOUNTS, CATS, { now: NOW });
    expect(cmp.map(c => c.period)).toEqual(['1m', '3m', '6m', '1y']);
    expect(cmp.map(c => c.label)).toEqual(['Mese', '3 mesi', '6 mesi', '1 anno']);
    const m1 = cmp[0], m6 = cmp[2];
    expect(m1.total.delta).toBe(300);          // the March expense predates the 1m window
    expect(m6.total.delta).toBe(100);          // +300 − 200
    expect(m1.liquidity.delta).toBe(300);
    expect(m1.investments.delta).toBe(0);
  });
});

describe('buildWealthNote (deterministic)', () => {
  const mk = (t: number, l: number, i: number): WealthPeriodSummary => ({
    period: '1m', label: 'Ultimo mese', startDate: '2026-06-15', endDate: TODAY, points: [],
    total: { metric: 'total', label: 'Patrimonio totale', startValue: 0, endValue: t, delta: t, deltaPct: null },
    liquidity: { metric: 'liquidity', label: 'Liquidità', startValue: 0, endValue: l, delta: l, deltaPct: null },
    investments: { metric: 'investments', label: 'Investimenti', startValue: 0, endValue: i, delta: i, deltaPct: null },
    minTotal: 0, maxTotal: 0, averageTotal: 0,
    minLiquidity: 0, maxLiquidity: 0, averageLiquidity: 0,
    minInvestments: 0, maxInvestments: 0, averageInvestments: 0,
  });

  it('growth funded by investments while liquidity drops', () => {
    expect(buildWealthNote(mk(500, -200, 700))).toContain('arriva dagli investimenti');
  });
  it('flat total with an internal liquidity→investments shift', () => {
    expect(buildWealthNote(mk(0, -400, 400))).toContain('spostata verso gli investimenti');
  });
  it('everything stable', () => {
    expect(buildWealthNote(mk(0, 0, 0))).toContain('stabile');
  });
  it('decline on both fronts', () => {
    expect(buildWealthNote(mk(-500, -300, -200))).toContain('sia la liquidità sia gli investimenti');
  });
});

describe('shiftMonthsISO', () => {
  it('clamps the day at month end', () => {
    expect(shiftMonthsISO('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('crosses years', () => {
    expect(shiftMonthsISO('2026-01-15', -3)).toBe('2025-10-15');
  });
});
