import { describe, it, expect } from 'vitest';
import { expandRecurringOnCreate, catchUpRecurring, isPending, isExpiredTemplate, shouldExpandOnSave, seriesInstanceUpdates, dissolveSeries, addPeriod, monthlyEquivalent, nthOccurrenceDate, buildSeriesSummary } from './recurrence';
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

  it('shared recurring: every instance keeps the groupId (the storno series advances in lockstep)', () => {
    // Shared expense (storni group g1) that is also a monthly series, back-dated.
    // The storno transfer is ITS OWN series expanded the same way, so month N's
    // expense and storno instances share groupId + date; edit-time grouping only
    // matches same-date siblings, so months can't cross-contaminate.
    const t = base({ date: '2026-04-04', recurring: { freq: 'monthly' }, seriesId: 's', groupId: 'g1' });
    const out = expandRecurringOnCreate(t, TODAY);
    out.forEach(d => expect(d.groupId).toBe('g1'));
  });

  it('shared recurring pair: expense and storno expand in lockstep (same dates, same groupId)', () => {
    const exp = base({ date: '2026-04-04', recurring: { freq: 'monthly' }, seriesId: 'se', groupId: 'g1' });
    const sto = base({ type: 'transfer', category: 'trasferimento', toAccount: 'altro', amount: 50,
      date: '2026-04-04', recurring: { freq: 'monthly' }, seriesId: 'st', groupId: 'g1' });
    const expOut = expandRecurringOnCreate(exp, TODAY).filter(d => !d.recurring);
    const stoOut = expandRecurringOnCreate(sto, TODAY).filter(d => !d.recurring);
    expect(stoOut.map(d => d.date)).toEqual(expOut.map(d => d.date)); // lockstep dates
    stoOut.forEach(d => { expect(d.groupId).toBe('g1'); expect(d.type).toBe('transfer'); });
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

  it('leaves an orphan template past its until untouched (non-destructive, no delete)', () => {
    // until=2026-05-31 but the template still sits at 2026-07-04 (past until) →
    // nothing to materialize; the expired template is left as-is, never removed.
    const txs = [t({ id: 'orph', date: '2026-07-04', recurring: { freq: 'monthly', until: '2026-05-31' }, seriesId: 's' })];
    const { creates, advance } = catchUpRecurring(txs, TODAY);
    expect(creates).toHaveLength(0);
    expect(advance).toHaveLength(0);
  });

  it('advances the template past until (expired, hidden) when a series ends — never deletes', () => {
    // Due Apr 4, until May 31: materialize Apr & May, then advance the template to
    // Jun 4 (> until). It becomes an expired (hidden) template, but is NOT deleted.
    const txs = [t({ id: 'tpl', date: '2026-04-04', recurring: { freq: 'monthly', until: '2026-05-31' }, seriesId: 's' })];
    const { creates, advance } = catchUpRecurring(txs, TODAY);
    expect(creates.map(c => c.date)).toEqual(['2026-04-04', '2026-05-04']);
    expect(advance).toEqual([{ id: 'tpl', date: '2026-06-04', seriesId: 's' }]);
  });

  it('shared recurring pair: expense + storno templates materialize in lockstep with the groupId', () => {
    // Both templates share the groupId and the same rule/date; catch-up creates
    // both months' pairs with matching date + groupId, so each month's expense
    // folds ITS OWN storno at edit time (same-date grouping in App).
    const txs = [
      t({ id: 'tplE', date: '2026-05-04', recurring: { freq: 'monthly' }, seriesId: 'se', groupId: 'g1' }),
      t({ id: 'tplS', date: '2026-05-04', type: 'transfer', toAccount: 'x', amount: 50,
          recurring: { freq: 'monthly' }, seriesId: 'st', groupId: 'g1' }),
    ];
    const { creates } = catchUpRecurring(txs, TODAY);
    const expenses = creates.filter(c => c.type === 'expense');
    const storni = creates.filter(c => c.type === 'transfer');
    expect(expenses.map(c => c.date)).toEqual(['2026-05-04', '2026-06-04']);
    expect(storni.map(c => c.date)).toEqual(['2026-05-04', '2026-06-04']); // lockstep
    creates.forEach(c => expect(c.groupId).toBe('g1'));
  });
});

describe('seriesInstanceUpdates', () => {
  const t = (over: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(36).slice(2), date: '2026-06-04', description: 'X', amount: 10,
    type: 'expense', category: 'casa', account: 'conto', ...over,
  });

  it('propagates edited fields to every recorded occurrence, keeping each own date/id/createdAt', () => {
    const all = [
      t({ id: 'tpl', date: '2026-07-04', recurring: { freq: 'monthly' }, seriesId: 's', description: 'Affitto', amount: 800 }),
      t({ id: 'i1', date: '2026-04-04', seriesId: 's', description: 'Affitto', amount: 800, createdAt: 111 }),
      t({ id: 'i2', date: '2026-05-04', seriesId: 's', description: 'Affitto', amount: 800, createdAt: 222 }),
    ];
    // Edited template payload: rename + bump the amount + new category.
    const payload: Omit<Transaction, 'id'> = {
      date: '2026-07-04', description: 'Affitto casa', amount: 850, type: 'expense',
      category: 'affitto', account: 'conto', recurring: { freq: 'monthly' }, seriesId: 's', createdAt: 999,
    };
    const updates = seriesInstanceUpdates(all, { id: 'tpl', seriesId: 's' }, payload);

    expect(updates.map(u => u.id).sort()).toEqual(['i1', 'i2']);
    const u1 = updates.find(u => u.id === 'i1')!;
    expect(u1.data.description).toBe('Affitto casa');   // content propagated
    expect(u1.data.amount).toBe(850);
    expect(u1.data.category).toBe('affitto');
    expect(u1.data.date).toBe('2026-04-04');            // occurrence keeps its own date
    expect(u1.data.createdAt).toBe(111);                // and its own createdAt
    expect(u1.data.seriesId).toBe('s');                 // series link preserved
    expect(u1.data.recurring).toBeUndefined();          // rule stripped (instances aren't templates)
    expect(updates.find(u => u.id === 'i2')!.data.date).toBe('2026-05-04');
  });

  it('skips the template, projected rows, and other series', () => {
    const all = [
      t({ id: 'tpl', date: '2026-07-04', recurring: { freq: 'monthly' }, seriesId: 's' }),
      t({ id: 'i1', date: '2026-05-04', seriesId: 's' }),
      t({ id: 'proj', date: '2026-08-04', seriesId: 's', projected: true }),   // virtual row
      t({ id: 'other', date: '2026-05-04', seriesId: 'other' }),               // different series
      t({ id: 'oneoff', date: '2026-05-04' }),                                 // unrelated one-off
    ];
    const payload: Omit<Transaction, 'id'> = {
      date: '2026-07-04', description: 'X', amount: 10, type: 'expense',
      category: 'casa', account: 'conto', recurring: { freq: 'monthly' }, seriesId: 's',
    };
    const updates = seriesInstanceUpdates(all, { id: 'tpl', seriesId: 's' }, payload);
    expect(updates.map(u => u.id)).toEqual(['i1']);
  });

  it('returns nothing when the series has no recorded occurrences yet', () => {
    const all = [t({ id: 'tpl', date: '2026-07-04', recurring: { freq: 'monthly' }, seriesId: 's' })];
    const payload: Omit<Transaction, 'id'> = {
      date: '2026-07-04', description: 'X', amount: 10, type: 'expense',
      category: 'casa', account: 'conto', recurring: { freq: 'monthly' }, seriesId: 's',
    };
    expect(seriesInstanceUpdates(all, { id: 'tpl', seriesId: 's' }, payload)).toHaveLength(0);
  });
});

describe('shouldExpandOnSave', () => {
  it('expands a brand-new transaction (null editing)', () => {
    expect(shouldExpandOnSave(null, true)).toBe(true);
    expect(shouldExpandOnSave(undefined, false)).toBe(true);
  });

  it('expands when converting a plain one-off into a recurring series', () => {
    // old expense already inserted: no recurrence, no series link
    expect(shouldExpandOnSave({ }, true)).toBe(true);
    expect(shouldExpandOnSave({ recurring: undefined, seriesId: undefined }, true)).toBe(true);
  });

  it('does NOT expand when the edit is not (becoming) recurring', () => {
    expect(shouldExpandOnSave({ }, false)).toBe(false);
  });

  it('does NOT expand when editing an existing series template', () => {
    expect(shouldExpandOnSave({ recurring: { freq: 'monthly' } }, true)).toBe(false);
  });

  it('does NOT expand when editing an instance already linked to a series', () => {
    expect(shouldExpandOnSave({ seriesId: 's1' }, true)).toBe(false);
  });
});

describe('one-off → recurring conversion materializes past months', () => {
  it('expandRecurringOnCreate fills every month from the original date to today', () => {
    // User converts a Jan 15 one-off (id "A") into a monthly series on Jun 4.
    const converted: Omit<Transaction, 'id'> = {
      date: '2026-01-15', description: 'Netflix', amount: 15,
      type: 'expense', category: 'svago', account: 'conto',
      recurring: { freq: 'monthly' }, seriesId: 'A',
    };
    // TODAY = 2026-06-04, so the 15th of June is still in the future: only
    // Jan–May fall on/before today; the template lands on the next one (Jun 15).
    const out = expandRecurringOnCreate(converted, TODAY);
    const instances = out.filter(d => !d.recurring);
    const template = out.find(d => d.recurring);
    expect(instances.map(d => d.date)).toEqual([
      '2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15',
    ]);
    instances.forEach(d => expect(d.seriesId).toBe('A'));
    expect(template?.date).toBe('2026-06-15'); // next future occurrence
  });
});

describe('isExpiredTemplate / isPending', () => {
  const mk = (over: Partial<Transaction>): Transaction => ({
    id: 'x', date: '2026-07-04', description: 'X', amount: 10,
    type: 'expense', category: 'casa', account: 'conto', ...over,
  });

  it('flags a future recurring template dated past its until as expired (not pending)', () => {
    const tpl = mk({ date: '2026-07-04', recurring: { freq: 'monthly', until: '2026-05-31' } });
    expect(isExpiredTemplate(tpl)).toBe(true);
    expect(isPending(tpl, TODAY)).toBe(false); // no longer shown as "Programmato"
  });

  it('keeps a normal future template (within until) pending', () => {
    const tpl = mk({ date: '2026-07-04', recurring: { freq: 'monthly', until: '2026-12-31' } });
    expect(isExpiredTemplate(tpl)).toBe(false);
    expect(isPending(tpl, TODAY)).toBe(true);
  });

  it('ignores projected rows (display-only, never expired-template)', () => {
    const proj = mk({ projected: true, recurring: undefined });
    expect(isExpiredTemplate(proj)).toBe(false);
  });
});

describe('addPeriod (timezone-safe, no DST drift)', () => {
  it('keeps the day-of-month across 24 monthly steps', () => {
    let d = '2026-04-10';
    for (let i = 0; i < 24; i++) d = addPeriod(d, 'monthly');
    expect(d).toBe('2028-04-10'); // still the 10th, no roll-back to the 9th
  });
  it('yearly keeps month/day', () => {
    expect(addPeriod('2026-04-10', 'yearly')).toBe('2027-04-10');
    expect(addPeriod('2027-10-30', 'yearly')).toBe('2028-10-30');
  });
  it('daily/weekly advance correctly across a month boundary', () => {
    expect(addPeriod('2026-03-28', 'daily')).toBe('2026-03-29');
    expect(addPeriod('2026-03-28', 'weekly')).toBe('2026-04-04');
  });
});

describe('dissolveSeries', () => {
  const t = (over: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(36).slice(2), date: '2026-06-04', description: 'X', amount: 10,
    type: 'expense', category: 'casa', account: 'conto', ...over,
  });
  const TODAY = '2026-06-04';

  it('deletes future occurrences and unlinks past recorded ones (template skipped)', () => {
    const all = [
      t({ id: 'tpl', date: '2026-07-04', recurring: { freq: 'monthly' }, seriesId: 's' }), // caller handles
      t({ id: 'i1', date: '2026-04-04', seriesId: 's' }),                                   // past → unlink
      t({ id: 'i2', date: '2026-05-04', seriesId: 's' }),                                   // past → unlink
      t({ id: 'f1', date: '2026-08-04', seriesId: 's' }),                                   // future → delete
      t({ id: 'proj', date: '2026-09-04', seriesId: 's', projected: true }),                // virtual → ignore
      t({ id: 'other', date: '2026-05-04', seriesId: 'x' }),                                // other series → ignore
    ];
    const { unlink, remove } = dissolveSeries(all, { id: 'tpl', seriesId: 's' }, TODAY);
    expect(remove).toEqual(['f1']);
    expect(unlink.map(u => u.id).sort()).toEqual(['i1', 'i2']);
    const u1 = unlink.find(u => u.id === 'i1')!;
    expect(u1.data.seriesId).toBeUndefined();   // unlinked → no series link → no badge
    expect(u1.data.recurring).toBeUndefined();
    expect(u1.data.date).toBe('2026-04-04');    // keeps its own date/content
  });

  it('returns empty when the series has only the template', () => {
    const all = [t({ id: 'tpl', date: '2026-07-04', recurring: { freq: 'monthly' }, seriesId: 's' })];
    const { unlink, remove } = dissolveSeries(all, { id: 'tpl', seriesId: 's' }, TODAY);
    expect(unlink).toHaveLength(0);
    expect(remove).toHaveLength(0);
  });
});

describe('monthlyEquivalent / nthOccurrenceDate', () => {
  it('monthlyEquivalent uses the fixed-cost-load multipliers', () => {
    expect(monthlyEquivalent(10, 'monthly')).toBe(10);
    expect(monthlyEquivalent(120, 'yearly')).toBe(10);
    expect(monthlyEquivalent(10, 'weekly')).toBeCloseTo(43.3);
    expect(monthlyEquivalent(1, 'daily')).toBe(30);
  });

  it('nthOccurrenceDate is 1-based and consistent with addPeriod', () => {
    expect(nthOccurrenceDate('2026-01-15', 'monthly', 1)).toBe('2026-01-15');
    expect(nthOccurrenceDate('2026-01-15', 'monthly', 3)).toBe('2026-03-15');
    expect(nthOccurrenceDate('2026-01-15', 'monthly', 24)).toBe('2027-12-15');
    expect(nthOccurrenceDate('2026-01-15', 'weekly', 2)).toBe(addPeriod('2026-01-15', 'weekly'));
  });
});

describe('buildSeriesSummary', () => {
  const t = (over: Partial<Transaction>): Transaction => ({
    id: Math.random().toString(36).slice(2), date: '2026-06-04', description: 'X', amount: 10,
    type: 'expense', category: 'abbonamenti', account: 'conto', ...over,
  });

  it('monthly subscription: equivalents, next date, paid totals', () => {
    const all = [
      t({ id: 'tpl', date: '2026-07-01', amount: 10, recurring: { freq: 'monthly' }, seriesId: 's',
          seriesMeta: { kind: 'subscription' } }),
      t({ id: 'i1', date: '2026-04-01', amount: 10, seriesId: 's' }),
      t({ id: 'i2', date: '2026-05-01', amount: 10, seriesId: 's' }),
      t({ id: 'i3', date: '2026-06-01', amount: 10, seriesId: 's' }),
    ];
    const s = buildSeriesSummary(all, all[1], TODAY);
    expect(s.kind).toBe('subscription');
    expect(s.monthlyEquivalent).toBe(10);
    expect(s.annualEquivalent).toBe(120);
    expect(s.nextDate).toBe('2026-07-01');
    expect(s.ended).toBe(false);
    expect(s.paidCount).toBe(3);
    expect(s.paidAmount).toBe(30);
    expect(s.paidThisYear).toBe(30);
  });

  it('annual subscription: monthly equivalent = amount / 12', () => {
    const all = [
      t({ id: 'tpl', date: '2027-01-10', amount: 120, recurring: { freq: 'yearly' }, seriesId: 'y',
          seriesMeta: { kind: 'subscription' } }),
      t({ id: 'i1', date: '2026-01-10', amount: 120, seriesId: 'y' }),
    ];
    const s = buildSeriesSummary(all, all[0], TODAY);
    expect(s.monthlyEquivalent).toBeCloseTo(10);
    expect(s.annualEquivalent).toBeCloseTo(120);
    expect(s.paidCount).toBe(1);
  });

  it('installment 7/24: remaining, residual amount, progress', () => {
    const meta = { kind: 'installment' as const, installment: { totalAmount: 2400, totalInstallments: 24, firstDate: '2025-12-04' } };
    const paid = Array.from({ length: 7 }, (_, i) =>
      t({ id: `i${i}`, date: nthOccurrenceDate('2025-12-04', 'monthly', i + 1), amount: 100, seriesId: 'r', seriesMeta: meta }));
    const all = [
      t({ id: 'tpl', date: '2026-07-04', amount: 100, recurring: { freq: 'monthly', until: '2027-11-04' }, seriesId: 'r', seriesMeta: meta }),
      ...paid,
    ];
    const s = buildSeriesSummary(all, paid[3], TODAY);
    expect(s.kind).toBe('installment');
    expect(s.paidCount).toBe(7);
    expect(s.installment).toEqual({
      totalAmount: 2400,
      totalInstallments: 24,
      remainingInstallments: 17,
      remainingAmount: 2400 - 700,
      progress: 7 / 24,
    });
    expect(s.nextDate).toBe('2026-07-04');
  });

  it('legacy series without seriesMeta is treated as plain recurring', () => {
    const all = [
      t({ id: 'tpl', date: '2026-07-04', recurring: { freq: 'monthly' }, seriesId: 's' }),
      t({ id: 'i1', date: '2026-06-04', seriesId: 's' }),
    ];
    const s = buildSeriesSummary(all, all[1], TODAY);
    expect(s.kind).toBe('recurring');
    expect(s.monthlyEquivalent).toBeUndefined();
    expect(s.installment).toBeUndefined();
    expect(s.nextDate).toBe('2026-07-04');
  });

  it('ended series (until in the past / expired template) → ended, no nextDate', () => {
    const all = [
      t({ id: 'tpl', date: '2026-06-04', amount: 10, recurring: { freq: 'monthly', until: '2026-05-31' }, seriesId: 's' }),
      t({ id: 'i1', date: '2026-04-04', seriesId: 's' }),
      t({ id: 'i2', date: '2026-05-04', seriesId: 's' }),
    ];
    const s = buildSeriesSummary(all, all[1], TODAY);
    expect(s.ended).toBe(true);
    expect(s.nextDate).toBeNull();
    expect(s.paidCount).toBe(2);
  });
});
