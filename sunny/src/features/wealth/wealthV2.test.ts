import { describe, it, expect } from 'vitest';
import { Transaction, AccountDef, CategoryDef } from '../../types';
import { buildWealthV2Summary } from './wealthV2';

const NOW = new Date('2026-07-10T12:00:00Z');

const accounts: AccountDef[] = [
  { id: 'cc', label: 'Conto', icon: '🏦', color: '#fff', initialBalance: 1000 },
  { id: 'cash', label: 'Contanti', icon: '💶', color: '#fff' },
];

const categories: CategoryDef[] = [
  { id: 'spesa', label: 'Spesa', icon: '🛒', color: '#fff', kind: 'expense' },
  { id: 'stipendio', label: 'Stipendio', icon: '💰', color: '#fff', kind: 'income' },
  { id: 'etf', label: 'ETF', icon: '📈', color: '#fff', kind: 'investment', currentValue: 1200, lastValueUpdate: '2026-07-05' },
  { id: 'crypto', label: 'Crypto', icon: '🪙', color: '#fff', kind: 'investment' },
];

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-07-01', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

const fixture: Transaction[] = [
  tx({ date: '2026-06-15', type: 'income', category: 'stipendio', amount: 2000 }),
  tx({ date: '2026-06-20', type: 'expense', amount: 500 }),
  tx({ date: '2026-06-25', type: 'expense', amount: 100, shared: 40 }), // own 60
  tx({ date: '2026-06-28', type: 'investment', category: 'etf', amount: 1000 }),
  tx({ date: '2026-07-02', type: 'transfer', account: 'cc', toAccount: 'cash', amount: 200 }),
  tx({ date: '2026-07-05', type: 'investment', category: 'crypto', amount: 150 }),
];

describe('buildWealthV2Summary', () => {
  it('decomposition: delta = risparmio netto + rendimento + rettifiche', () => {
    const s = buildWealthV2Summary(fixture, accounts, categories, '3m', { now: NOW });
    const d = s.decomposition;
    expect(d.deltaTotal).toBeCloseTo(d.netSavings + d.investmentReturn + d.adjustments, 2);
    // Net savings over 3 months: 2000 − 500 − 60 = 1440.
    expect(d.netSavings).toBeCloseTo(1440, 2);
    // No snapshot history → realized return is never invented.
    expect(d.investmentReturn).toBe(0);
    // Clean fixture → no residual adjustments.
    expect(d.adjustments).toBeCloseTo(0, 2);
  });

  it('investment deposits and transfers do not change the total (no double counting)', () => {
    const s = buildWealthV2Summary(fixture, accounts, categories, '3m', { now: NOW });
    // Flows are reported separately and NOT added to the delta.
    expect(s.decomposition.investmentFlows).toBeCloseTo(1150, 2);
    expect(s.decomposition.deltaTotal).toBeCloseTo(1440, 2);
  });

  it('marketToday separates versato from latent gain', () => {
    const s = buildWealthV2Summary(fixture, accounts, categories, '1m', { now: NOW });
    expect(s.marketToday.investedCapital).toBeCloseTo(1150, 2); // 1000 etf + 150 crypto
    expect(s.marketToday.marketValue).toBeCloseTo(1350, 2);     // 1200 market + 150 versato fallback
    expect(s.marketToday.marketGain).toBeCloseTo(200, 2);
    expect(s.marketToday.marketGainPct).toBeCloseTo(17.39, 1);
  });

  it('composition lists accounts and investments with freshness', () => {
    const s = buildWealthV2Summary(fixture, accounts, categories, '1m', { now: NOW });
    const etf = s.composition.investments.find(e => e.id === 'etf')!;
    expect(etf.hasMarketValue).toBe(true);
    expect(etf.stale).toBe(false); // updated 5 days before NOW
    const crypto = s.composition.investments.find(e => e.id === 'crypto')!;
    expect(crypto.hasMarketValue).toBe(false);
    expect(crypto.stale).toBe(true);
    const cc = s.composition.accounts.find(e => e.id === 'cc')!;
    // 1000 iniziale + 2000 − 500 − 60 − 1000 − 200 − 150 = 1090
    expect(cc.value).toBeCloseTo(1090, 2);
    const cash = s.composition.accounts.find(e => e.id === 'cash')!;
    expect(cash.value).toBeCloseTo(200, 2);
  });

  it('provides 1M/3M/6M/1A comparisons with start/end values', () => {
    const s = buildWealthV2Summary(fixture, accounts, categories, 'all', { now: NOW });
    expect(s.comparisons.map(c => c.period)).toEqual(['1m', '3m', '6m', '1y']);
    for (const c of s.comparisons) {
      expect(c.total.endValue).toBeCloseTo(c.total.startValue + c.total.delta, 2);
    }
  });

  it('stale market value raises a warning', () => {
    const staleCats = categories.map(c =>
      c.id === 'etf' ? { ...c, lastValueUpdate: '2026-01-01' } : c);
    const s = buildWealthV2Summary(fixture, accounts, staleCats, '1m', { now: NOW });
    expect(s.warnings.some(w => w.includes('non è aggiornato'))).toBe(true);
  });
});
