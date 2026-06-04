import { describe, it, expect } from 'vitest';
import { expandRecurringOnCreate, catchUpRecurring, isPending } from './recurrence';
import { Transaction } from '../types';

const TODAY = '2026-06-04';
const base = (over: Partial<Omit<Transaction, 'id'>>): Omit<Transaction, 'id'> => ({
  date: '2026-03-04', description: 'Affitto', amount: 500,
  type: 'expense', category: 'casa', account: 'conto', ...over,
});

describe('expandRecurringOnCreate', () => {
  it('returns a non-recurring movement unchanged', () => {
    const t = base({ recurring: undefined });
    expect(expandRecurringOnCreate(t, TODAY)).toEqual([t]);
  });

  it('materializes every past occurrence of a back-dated monthly series as realized', () => {
    // Started 3 months ago (Mar 4); today is Jun 4 → Mar, Apr, May, Jun are due.
    const t = base({ date: '2026-03-04', recurring: { freq: 'monthly' }, seriesId: 's1' });
    const out = expandRecurringOnCreate(t, TODAY);

    const instances = out.filter(d => !d.recurring);
    const template = out.find(d => d.recurring);

    // Four realized instances (Mar, Apr, May, Jun), all dated in the past/today.
    expect(instances.map(d => d.date)).toEqual(['2026-03-04', '2026-04-04', '2026-05-04', '2026-06-04']);
    instances.forEach(d => {
      expect(isPending(d as Transaction, TODAY)).toBe(false); // counts as done
      expect(d.seriesId).toBe('s1');
    });
    // Template advanced to the next FUTURE occurrence (July).
    expect(template?.date).toBe('2026-07-04');
    expect(template?.recurring).toEqual({ freq: 'monthly' });
  });

  it('works for any type, not just expenses (income example)', () => {
    const t = base({ type: 'income', category: 'stipendio', date: '2026-04-04', recurring: { freq: 'monthly' }, seriesId: 'inc' });
    const out = expandRecurringOnCreate(t, TODAY);
    const instances = out.filter(d => !d.recurring);
    expect(instances.length).toBe(3); // Apr, May, Jun
    instances.forEach(d => expect(d.type).toBe('income'));
  });

  it('keeps a future-starting series as a single previsto (no instances)', () => {
    const t = base({ date: '2026-08-04', recurring: { freq: 'monthly' }, seriesId: 'fut' });
    const out = expandRecurringOnCreate(t, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].recurring).toEqual({ freq: 'monthly' });
    expect(isPending(out[0] as Transaction, TODAY)).toBe(true); // still a previsto
  });

  it('respects the series end date (until)', () => {
    const t = base({ date: '2026-03-04', recurring: { freq: 'monthly', until: '2026-04-30' }, seriesId: 'cap' });
    const out = expandRecurringOnCreate(t, TODAY);
    const instances = out.filter(d => !d.recurring);
    // Only Mar and Apr fall on/before the until date; series ends, no template kept.
    expect(instances.map(d => d.date)).toEqual(['2026-03-04', '2026-04-04']);
    expect(out.find(d => d.recurring)).toBeUndefined();
  });
});

describe('catchUpRecurring', () => {
  const t = (over: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(36).slice(2), date: '2026-06-04', description: 'X', amount: 10,
    type: 'expense', category: 'casa', account: 'conto', ...over,
  });

  it('does nothing when every template is in the future', () => {
    const txs = [t({ date: '2026-07-01', recurring: { freq: 'monthly' }, seriesId: 's' })];
    const { creates, advance } = catchUpRecurring(txs, TODAY);
    expect(creates).toHaveLength(0);
    expect(advance).toHaveLength(0);
  });

  it('materializes overdue occurrences and advances the template', () => {
    // Template's next occurrence pointer fell behind: due Apr 4, today Jun 4.
    const txs = [t({ id: 'tpl', date: '2026-04-04', recurring: { freq: 'monthly' }, seriesId: 's' })];
    const { creates, advance } = catchUpRecurring(txs, TODAY);
    expect(creates.map(c => c.date)).toEqual(['2026-04-04', '2026-05-04', '2026-06-04']);
    creates.forEach(c => { expect(c.recurring).toBeUndefined(); expect(c.seriesId).toBe('s'); });
    expect(advance).toEqual([{ id: 'tpl', date: '2026-07-04', seriesId: 's' }]);
  });

  it('skips occurrences already materialized (no duplicates with the Cloud Function)', () => {
    const txs = [
      t({ id: 'tpl', date: '2026-04-04', recurring: { freq: 'monthly' }, seriesId: 's' }),
      t({ id: 'i1', date: '2026-04-04', seriesId: 's' }), // already created by the CF
      t({ id: 'i2', date: '2026-05-04', seriesId: 's' }),
    ];
    const { creates } = catchUpRecurring(txs, TODAY);
    expect(creates.map(c => c.date)).toEqual(['2026-06-04']); // only the missing one
  });
});
