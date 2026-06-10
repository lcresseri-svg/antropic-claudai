/**
 * Synthetic ledger with KNOWN GROUND TRUTH for Forecast Engine V3 tests.
 *
 * Reference date: June 15 2026 (mid-month). One category per behavior type:
 *
 *   affitto       → recurring         €800/month, seriesId, day 1
 *   abbonamenti   → recurring_bundle  Netflix €15 + Spotify €10, no flags, auto-detected
 *   palestra      → fixed_monthly     €50/month, single tx, unique merchant per month
 *   assicurazione → periodic_fixed    annual €300, paid in June 2024 and June 2025
 *   trasporti     → hybrid            €50/month pass (seriesId) + ~€30/month taxi
 *   giornali      → stale             €20/month for 21 months, stopped after Feb 2026
 *   medico        → rare_variable     2 sparse visits (Apr €40, May €400), wild amounts
 *   spesa         → variable_frequent 6 tx/month ≈ €150, stable
 *   ristoranti    → variable_sparse   2 tx/month, totals cycling 40–110 (CV ≈ 0.3)
 *   shopping      → volatile_mixed    1 tx/month, totals cycling 30–400 (CV > 0.5)
 *   nuova         → unknown           no transactions at all
 *
 * IMPORTANT (per project test policy): this fixture verifies that the engine
 * REACTS correctly to known patterns. It must NEVER be used to measure or
 * optimize forecast accuracy — accuracy metrics come from real data only.
 *
 * Merchant descriptions use unique three-letter tags ('q' + 2 letters) where
 * auto-recurring detection must NOT fire, and stable merchant names where it MUST.
 */
import { Transaction, CategoryDef } from '../../types';

export const FIXTURE_NOW = new Date(2026, 5, 15); // June 15 2026

export const FIXTURE_CATEGORIES: CategoryDef[] = [
  { id: 'affitto',       label: 'Affitto',       icon: '🏠', color: '#111', kind: 'expense' },
  { id: 'abbonamenti',   label: 'Abbonamenti',   icon: '📺', color: '#222', kind: 'expense' },
  { id: 'palestra',      label: 'Palestra',      icon: '🏋️', color: '#333', kind: 'expense' },
  { id: 'assicurazione', label: 'Assicurazione', icon: '🛡️', color: '#444', kind: 'expense' },
  { id: 'trasporti',     label: 'Trasporti',     icon: '🚌', color: '#555', kind: 'expense' },
  { id: 'giornali',      label: 'Giornali',      icon: '📰', color: '#666', kind: 'expense' },
  { id: 'medico',        label: 'Medico',        icon: '🩺', color: '#777', kind: 'expense' },
  { id: 'spesa',         label: 'Spesa',         icon: '🛒', color: '#888', kind: 'expense' },
  { id: 'ristoranti',    label: 'Ristoranti',    icon: '🍝', color: '#999', kind: 'expense' },
  { id: 'shopping',      label: 'Shopping',      icon: '🛍️', color: '#aaa', kind: 'expense' },
  { id: 'nuova',         label: 'Nuova',         icon: '✨', color: '#bbb', kind: 'expense' },
];

/** Month key for N months before June 2026 (0 = '2026-06', 1 = '2026-05', …). */
export function fixtureMonthKey(monthsAgo: number): string {
  const d = new Date(2026, 5 - monthsAgo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const onDay = (key: string, d: number) => `${key}-${String(d).padStart(2, '0')}`;

/** Unique 3-letter merchant tag, never a stop-word ('q' prefix guarantees it). */
function qtag(i: number): string {
  return 'q' + String.fromCharCode(97 + Math.floor(i / 26) % 26) + String.fromCharCode(97 + (i % 26));
}

let seq = 0;
export function fxTx(
  date: string,
  amount: number,
  category: string,
  description: string,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id: `fx-${++seq}`,
    date, description, amount,
    type: 'expense', category, account: 'conto',
    ...extra,
  };
}

/**
 * Build the full synthetic ledger. Deterministic: same transactions every call
 * (ids differ but ids are never used by the engine).
 */
export function buildFixtureV3(): Transaction[] {
  const txs: Transaction[] = [];
  let tagSeq = 0;

  // ── affitto: explicit recurring €800, day 1, Apr 2025 → Jun 2026 ────────────
  for (let i = 14; i >= 0; i--) {
    txs.push(fxTx(onDay(fixtureMonthKey(i), 1), 800, 'affitto', 'Affitto appartamento', { seriesId: 'rent' }));
  }

  // ── abbonamenti: Netflix + Spotify, NO flags, stable merchants ──────────────
  // Auto-recurring detection must fire on the June occurrences → bundle.
  for (let i = 14; i >= 0; i--) {
    txs.push(fxTx(onDay(fixtureMonthKey(i), 3), 15, 'abbonamenti', 'Netflix'));
    txs.push(fxTx(onDay(fixtureMonthKey(i), 5), 10, 'abbonamenti', 'Spotify'));
  }

  // ── palestra: €50/month, day 7, UNIQUE merchant per month ───────────────────
  // (unique tags prevent merchant auto-detection → classification must come
  // from the monthly-total stability → fixed_monthly)
  for (let i = 14; i >= 0; i--) {
    txs.push(fxTx(onDay(fixtureMonthKey(i), 7), 50, 'palestra', `palestra quota ${qtag(tagSeq++)}`));
  }

  // ── assicurazione: annual €300, June 2024 + June 2025, nothing in June 2026 yet
  txs.push(fxTx(onDay(fixtureMonthKey(24), 10), 300, 'assicurazione', 'assicurazione casa polizza'));
  txs.push(fxTx(onDay(fixtureMonthKey(12), 10), 300, 'assicurazione', 'assicurazione casa polizza'));

  // ── trasporti: hybrid = €50 pass (seriesId, day 2) + ~€30 taxi (variable) ──
  for (let i = 14; i >= 0; i--) {
    txs.push(fxTx(onDay(fixtureMonthKey(i), 2), 50, 'trasporti', 'Abbonamento bus mensile', { seriesId: 'bus-pass' }));
  }
  for (let i = 14; i >= 1; i--) {
    txs.push(fxTx(onDay(fixtureMonthKey(i), 18), 30, 'trasporti', `taxi corsa ${qtag(tagSeq++)}`));
  }
  txs.push(fxTx('2026-06-08', 12, 'trasporti', `taxi corsa ${qtag(tagSeq++)}`));

  // ── giornali: €20/month, Jun 2024 → Feb 2026 (21 months), then STOPPED ─────
  for (let i = 24; i >= 4; i--) {
    txs.push(fxTx(onDay(fixtureMonthKey(i), 4), 20, 'giornali', `edicola rivista ${qtag(tagSeq++)}`));
  }

  // ── medico: rare — 2 visits with wildly different amounts ───────────────────
  txs.push(fxTx('2026-04-12', 40, 'medico', 'visita oculista controllo'));
  txs.push(fxTx('2026-05-20', 400, 'medico', 'dentista impianto preventivo'));

  // ── spesa: 6 tx/month ≈ €150, Apr 2025 → May 2026, 3 tx so far in June ─────
  const SPESA_DAYS = [2, 6, 10, 14, 19, 24];
  const SPESA_AMOUNTS = [20, 30, 25, 22, 28, 25]; // sum 150
  for (let i = 14; i >= 1; i--) {
    for (let j = 0; j < 6; j++) {
      txs.push(fxTx(onDay(fixtureMonthKey(i), SPESA_DAYS[j]), SPESA_AMOUNTS[j], 'spesa', `mercato cibo ${qtag(tagSeq++)}`));
    }
  }
  txs.push(fxTx('2026-06-04', 24, 'spesa', `mercato cibo ${qtag(tagSeq++)}`));
  txs.push(fxTx('2026-06-09', 26, 'spesa', `mercato cibo ${qtag(tagSeq++)}`));
  txs.push(fxTx('2026-06-13', 25, 'spesa', `mercato cibo ${qtag(tagSeq++)}`));

  // ── ristoranti: 2 tx/month, totals cycling 40–110 (CV ≈ 0.3 → sparse) ──────
  const RIST_CYCLE = [40, 90, 60, 110, 70];
  for (let i = 14; i >= 1; i--) {
    const total = RIST_CYCLE[(14 - i) % RIST_CYCLE.length];
    txs.push(fxTx(onDay(fixtureMonthKey(i), 9), Math.round(total * 0.4), 'ristoranti', `ristoro cena ${qtag(tagSeq++)}`));
    txs.push(fxTx(onDay(fixtureMonthKey(i), 16), Math.round(total * 0.6), 'ristoranti', `ristoro cena ${qtag(tagSeq++)}`));
  }
  txs.push(fxTx('2026-06-11', 45, 'ristoranti', `ristoro cena ${qtag(tagSeq++)}`));

  // ── shopping: 1 tx/month, totals cycling 30–400 (CV > 0.5 → volatile) ──────
  const SHOP_CYCLE = [200, 30, 400, 120, 350];
  for (let i = 14; i >= 1; i--) {
    const total = SHOP_CYCLE[(14 - i) % SHOP_CYCLE.length];
    txs.push(fxTx(onDay(fixtureMonthKey(i), 12), total, 'shopping', `negozio acquisto ${qtag(tagSeq++)}`));
  }
  txs.push(fxTx('2026-06-06', 80, 'shopping', `negozio acquisto ${qtag(tagSeq++)}`));

  // ── nuova: deliberately empty (unknown) ─────────────────────────────────────

  return txs;
}
