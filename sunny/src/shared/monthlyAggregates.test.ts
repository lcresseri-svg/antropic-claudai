import { describe, it, expect } from 'vitest';
import { Transaction } from '../types';
import { buildMonthlyAggregates, needsRegeneration, MONTHLY_AGGREGATES_VERSION } from './monthlyAggregates';

const NOW_ISO = '2026-07-10';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-06-01', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

describe('buildMonthlyAggregates', () => {
  const fixture: Transaction[] = [
    tx({ date: '2026-05-05', type: 'income', amount: 2000 }),
    tx({ date: '2026-05-10', amount: 300 }),
    tx({ date: '2026-05-12', amount: 100, shared: 40, category: 'ristoranti' }), // own 60
    tx({ date: '2026-05-20', type: 'investment', amount: 200 }),
    tx({ date: '2026-05-25', type: 'investment', amount: 50, direction: 'out' }),
    tx({ date: '2026-05-28', type: 'transfer', amount: 500, toAccount: 'risp' }),
    tx({ date: '2026-06-03', amount: 150 }),
    // Mese corrente e template: mai aggregati.
    tx({ date: '2026-07-05', amount: 999 }),
    tx({ id: 'tpl', date: '2026-08-01', amount: 50, recurring: { freq: 'monthly' } }),
  ];

  it('aggregates complete months only, with net flows and per-category detail', () => {
    const doc = buildMonthlyAggregates(fixture, NOW_ISO, 123);
    expect(doc.version).toBe(MONTHLY_AGGREGATES_VERSION);
    expect(doc.lastMonth).toBe('2026-06');
    expect(doc.months.map(m => m.month)).toEqual(['2026-05', '2026-06']);
    const may = doc.months[0];
    expect(may.income).toBe(2000);
    expect(may.expenses).toBe(360);           // 300 + quota propria 60
    expect(may.investments).toBe(150);        // 200 − 50 (direction out)
    expect(may.expensesByCategory).toEqual({ spesa: 300, ristoranti: 60 });
    expect(may.txCount).toBe(6);              // transfer conta come movimento
  });

  it('is deterministic / regenerable', () => {
    const a = buildMonthlyAggregates(fixture, NOW_ISO, 1);
    const b = buildMonthlyAggregates(fixture, NOW_ISO, 1);
    expect(a).toEqual(b);
  });

  it('returns an empty doc without history', () => {
    const doc = buildMonthlyAggregates([], NOW_ISO);
    expect(doc.months).toEqual([]);
    expect(doc.lastMonth).toBeNull();
  });
});

describe('needsRegeneration (fallback ai dati originali)', () => {
  const fresh = buildMonthlyAggregates([tx({ date: '2026-06-03', amount: 10 })], NOW_ISO);

  it('missing or wrong-version docs must be regenerated', () => {
    expect(needsRegeneration(null, NOW_ISO)).toBe(true);
    expect(needsRegeneration({ ...fresh, version: 999 }, NOW_ISO)).toBe(true);
  });

  it('a doc current through the previous month is valid', () => {
    expect(needsRegeneration(fresh, NOW_ISO)).toBe(false);
  });

  it('a doc that stops before the last complete month is stale', () => {
    const stale = buildMonthlyAggregates([tx({ date: '2026-04-03', amount: 10 })], NOW_ISO);
    expect(stale.lastMonth).toBe('2026-04');
    expect(needsRegeneration(stale, NOW_ISO)).toBe(true);
  });
});
