import { describe, it, expect } from 'vitest';
import {
  formatSeriesPrimaryAmount, formatSeriesSecondaryAmount,
  buildSeriesEquivalents, buildEquivalentRows, installmentPaidLabel, seriesKindOf,
} from './seriesDisplay';
import { Transaction } from '../../types';
import { formatCurrency } from '../../utils';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 't1', date: '2026-07-01', description: 'test', amount: 49.9,
  type: 'expense', category: 'abbonamenti', account: 'conto', ...over,
});

describe('formatSeriesPrimaryAmount', () => {
  it('yearly template → "49,90 € / anno"', () => {
    const t = tx({ recurring: { freq: 'yearly' } });
    expect(formatSeriesPrimaryAmount(t)).toBe(`${formatCurrency(49.9)} / anno`);
  });
  it('instance resolves the freq from the parameter', () => {
    const t = tx({ seriesId: 's1', seriesMeta: { kind: 'subscription' } });
    expect(formatSeriesPrimaryAmount(t, 'monthly')).toBe(`${formatCurrency(49.9)} / mese`);
  });
  it('unknown freq → plain amount', () => {
    const t = tx({ seriesId: 's1', seriesMeta: { kind: 'subscription' } });
    expect(formatSeriesPrimaryAmount(t)).toBe(formatCurrency(49.9));
  });
});

describe('formatSeriesSecondaryAmount — equivalence rules', () => {
  it('yearly → monthly equivalent ("≈ 4,16 € / mese")', () => {
    const t = tx({ recurring: { freq: 'yearly' }, seriesMeta: { kind: 'subscription' } });
    expect(formatSeriesSecondaryAmount(t)).toBe(`≈ ${formatCurrency(4.16)} / mese`);
  });
  it('daily → monthly equivalent (×30)', () => {
    const t = tx({ amount: 2, recurring: { freq: 'daily' } });
    expect(formatSeriesSecondaryAmount(t)).toBe(`≈ ${formatCurrency(60)} / mese`);
  });
  it('weekly → monthly equivalent (×4,33)', () => {
    const t = tx({ amount: 10, recurring: { freq: 'weekly' } });
    expect(formatSeriesSecondaryAmount(t)).toBe(`≈ ${formatCurrency(43.3)} / mese`);
  });
  it('monthly → ANNUAL equivalent (×12)', () => {
    const t = tx({ amount: 12.99, recurring: { freq: 'monthly' }, seriesMeta: { kind: 'subscription' } });
    expect(formatSeriesSecondaryAmount(t)).toBe(`≈ ${formatCurrency(155.88)} / anno`);
  });
  it('legacy series without seriesMeta still gets the equivalent (kind = recurring)', () => {
    const t = tx({ amount: 100, recurring: { freq: 'monthly' } });
    expect(seriesKindOf(t)).toBe('recurring');
    expect(formatSeriesSecondaryAmount(t)).toBe(`≈ ${formatCurrency(1200)} / anno`);
  });
  it('installment → null (progress is shown instead, never a monthly equivalent)', () => {
    const t = tx({
      recurring: { freq: 'monthly' },
      seriesMeta: { kind: 'installment', installment: { totalAmount: 1200, totalInstallments: 24, firstDate: '2026-01-01' } },
    });
    expect(formatSeriesSecondaryAmount(t)).toBeNull();
  });
  it('instance with unresolvable freq → null', () => {
    const t = tx({ seriesId: 's1', seriesMeta: { kind: 'subscription' } });
    expect(formatSeriesSecondaryAmount(t)).toBeNull();
  });
  it('non-series transaction → null', () => {
    expect(formatSeriesSecondaryAmount(tx({}))).toBeNull();
  });
});

describe('buildEquivalentRows — detail sheet section', () => {
  it('yearly: Mensile + Giornaliero', () => {
    const rows = buildEquivalentRows(49.9, 'yearly');
    expect(rows.map(r => r.label)).toEqual(['Mensile', 'Giornaliero']);
    expect(rows[0].value).toBe(`≈ ${formatCurrency(4.16)}`);
    expect(rows[1].value).toBe(`≈ ${formatCurrency(0.14)}`);
  });
  it('daily: Giornaliero (exact) + Mensile + Annuale', () => {
    const rows = buildEquivalentRows(2, 'daily');
    expect(rows.map(r => r.label)).toEqual(['Giornaliero', 'Mensile', 'Annuale']);
    expect(rows[0].value).toBe(formatCurrency(2));
    expect(rows[1].value).toBe(`≈ ${formatCurrency(60)}`);
    expect(rows[2].value).toBe(`≈ ${formatCurrency(720)}`);
  });
  it('weekly: Settimanale (exact) + Mensile + Annuale', () => {
    const rows = buildEquivalentRows(10, 'weekly');
    expect(rows.map(r => r.label)).toEqual(['Settimanale', 'Mensile', 'Annuale']);
    expect(rows[1].value).toBe(`≈ ${formatCurrency(43.3)}`);
  });
  it('monthly: Mensile (exact) + Annuale', () => {
    const rows = buildEquivalentRows(12.99, 'monthly');
    expect(rows.map(r => r.label)).toEqual(['Mensile', 'Annuale']);
    expect(rows[0].value).toBe(formatCurrency(12.99));
    expect(rows[1].value).toBe(`≈ ${formatCurrency(155.88)}`);
  });
});

describe('buildSeriesEquivalents', () => {
  it('bundles primary + secondary + equivalents for a yearly subscription', () => {
    const t = tx({ recurring: { freq: 'yearly' }, seriesMeta: { kind: 'subscription' } });
    const d = buildSeriesEquivalents(t);
    expect(d.primary).toBe(`${formatCurrency(49.9)} / anno`);
    expect(d.secondary).toBe(`≈ ${formatCurrency(4.16)} / mese`);
    expect(d.equivalents.map(e => e.label)).toEqual(['Mensile', 'Giornaliero']);
  });
  it('installment: no secondary, no equivalents', () => {
    const t = tx({
      recurring: { freq: 'monthly' },
      seriesMeta: { kind: 'installment', installment: { totalAmount: 1200, totalInstallments: 24, firstDate: '2026-01-01' } },
    });
    const d = buildSeriesEquivalents(t);
    expect(d.primary).toBe(`${formatCurrency(49.9)} / mese`);
    expect(d.secondary).toBeNull();
    expect(d.equivalents).toEqual([]);
  });
});

describe('installmentPaidLabel', () => {
  it('formats the plan progress', () => {
    expect(installmentPaidLabel(7, 24)).toBe('7 / 24 rate pagate');
  });
  it('caps at the plan size (over-materialized edge)', () => {
    expect(installmentPaidLabel(25, 24)).toBe('24 / 24 rate pagate');
  });
});
