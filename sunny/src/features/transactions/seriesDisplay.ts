// Centralized display helpers for series amounts: the PRIMARY figure is always
// the real recurrence amount ("49,90 € / anno"); the SECONDARY is a small
// equivalent in the most useful unit (yearly/daily/weekly → per month,
// monthly → per year). Installments never show equivalents — their secondary
// is plan progress ("7 / 24 rate pagate"). Pure functions, shared by the
// transaction rows and the series detail sheet so every screen shows identical
// numbers (all equivalences go through monthlyEquivalent / MONTHLY_EQUIV).
//
// NOTE on frequency: only the TEMPLATE carries the recurring rule; materialized
// instances don't. Callers that render instances resolve the freq from the
// series template and pass it via the `freq` parameter — when it can't be
// resolved (e.g. an ended series whose template is hidden) the secondary and
// the equivalents are simply omitted.

import { Transaction, Freq, SeriesKind } from '../../types';
import { monthlyEquivalent } from '../../shared/recurrence';
import { formatCurrency } from '../../utils';

const r2 = (n: number) => Math.round(n * 100) / 100;

const FREQ_UNIT: Record<Freq, string> = {
  daily: 'giorno', weekly: 'settimana', monthly: 'mese', yearly: 'anno',
};

export interface SeriesEquivalent { label: string; value: string; }

export interface SeriesAmountDisplay {
  primary: string;                 // "49,90 € / anno" — the real recurrence amount
  secondary: string | null;        // "≈ 4,16 € / mese" — null for installments / unknown freq
  equivalents: SeriesEquivalent[]; // rows for the detail sheet's "Equivalenti" section
}

/** Series flavour of a transaction; legacy series without meta = 'recurring'. */
export function seriesKindOf(tx: Transaction): SeriesKind | null {
  if (tx.seriesMeta?.kind) return tx.seriesMeta.kind;
  return tx.recurring || tx.seriesId ? 'recurring' : null;
}

const resolveFreq = (tx: Transaction, freq?: Freq): Freq | undefined => tx.recurring?.freq ?? freq;

/** "49,90 € / anno" — plain amount when the frequency can't be resolved. */
export function formatSeriesPrimaryAmount(tx: Transaction, freq?: Freq): string {
  const f = resolveFreq(tx, freq);
  const base = formatCurrency(tx.amount);
  return f ? `${base} / ${FREQ_UNIT[f]}` : base;
}

/**
 * The small equivalent line: yearly/daily/weekly → "≈ X € / mese",
 * monthly → "≈ X € / anno". Installments get NO equivalent (their secondary is
 * plan progress, see installmentPaidLabel).
 */
export function formatSeriesSecondaryAmount(tx: Transaction, freq?: Freq): string | null {
  const kind = seriesKindOf(tx);
  if (!kind || kind === 'installment') return null;
  const f = resolveFreq(tx, freq);
  if (!f) return null;
  const monthly = r2(monthlyEquivalent(tx.amount, f));
  if (f === 'monthly') return `≈ ${formatCurrency(r2(tx.amount * 12))} / anno`;
  return `≈ ${formatCurrency(monthly)} / mese`;
}

/** "7 / 24 rate pagate" — capped so an over-materialized plan never reads 25/24. */
export function installmentPaidLabel(paid: number, total: number): string {
  return `${Math.min(paid, total)} / ${total} rate pagate`;
}

/**
 * Rows for the "Equivalenti" section of the detail sheet:
 *   yearly  → Mensile, Giornaliero
 *   daily   → Giornaliero, Mensile, Annuale
 *   weekly  → Settimanale, Mensile, Annuale
 *   monthly → Mensile, Annuale
 * The row matching the series' own frequency shows the exact amount; the
 * others are ≈ conversions via the shared monthly base.
 */
export function buildEquivalentRows(amount: number, freq: Freq): SeriesEquivalent[] {
  const monthly = r2(monthlyEquivalent(amount, freq));
  const annual = r2(monthlyEquivalent(amount, freq) * 12);
  const daily = r2(monthlyEquivalent(amount, freq) / 30);
  const exact = formatCurrency(amount);
  const approx = (v: number) => `≈ ${formatCurrency(v)}`;
  switch (freq) {
    case 'yearly':
      return [
        { label: 'Mensile', value: approx(monthly) },
        { label: 'Giornaliero', value: approx(daily) },
      ];
    case 'daily':
      return [
        { label: 'Giornaliero', value: exact },
        { label: 'Mensile', value: approx(monthly) },
        { label: 'Annuale', value: approx(annual) },
      ];
    case 'weekly':
      return [
        { label: 'Settimanale', value: exact },
        { label: 'Mensile', value: approx(monthly) },
        { label: 'Annuale', value: approx(annual) },
      ];
    case 'monthly':
      return [
        { label: 'Mensile', value: exact },
        { label: 'Annuale', value: approx(annual) },
      ];
  }
}

/** One-stop display bundle for a series transaction. */
export function buildSeriesEquivalents(tx: Transaction, freq?: Freq): SeriesAmountDisplay {
  const kind = seriesKindOf(tx);
  const f = resolveFreq(tx, freq);
  return {
    primary: formatSeriesPrimaryAmount(tx, freq),
    secondary: formatSeriesSecondaryAmount(tx, freq),
    equivalents: kind && kind !== 'installment' && f ? buildEquivalentRows(tx.amount, f) : [],
  };
}
