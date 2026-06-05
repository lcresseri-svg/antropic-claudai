/**
 * Transaction classification for Forecast Engine V2.
 *
 * Determines how each expense should be treated:
 *   - variable_normal     → feeds amount/count curves
 *   - scheduled_recurring → added explicitly, never double-predicted
 *   - planned_normal      → reduces predictedVariableRemaining (already in baseline)
 *   - planned_one_off     → added on top; excluded from baseline
 *   - one_off_extra       → auto-detected extra; excluded from baseline
 *   - transfer_excluded   → ignored
 */
import { Transaction, ownShare } from '../../types';
import { median } from './forecastStats';
import { ForecastTreatment, ForecastRule, PlannedBudgetItem } from './forecastTypes';

// ── Merchant normalisation ────────────────────────────────────────────────────

const NOISE_WORDS = new Set([
  // payment verbs / instrument
  'pagamento', 'pag', 'pos', 'carta', 'bonifico', 'addebito', 'accredito', 'ricarica',
  'mav', 'rid', 'sepa', 'sct',
  // legal forms
  'spa', 'srl', 'srls', 'snc', 'sas', 'ss', 'onlus', 'soc', 'coop',
  'ltd', 'plc', 'gmbh', 'bv', 'nv', 'inc', 'llc', 'corp',
  // geographic / address
  'via', 'viale', 'piazza', 'pza', 'str', 'corso', 'italy', 'italia',
  // conjunctions / prepositions (short words already filtered by length, kept for safety)
  'di', 'e', 'il', 'la', 'le', 'lo', 'gli', 'del', 'della', 'dei', 'degli',
  'dal', 'dalla', 'al', 'alla', 'da', 'a', 'in', 'su', 'per', 'con', 'presso',
  // finance / bank
  'banca', 'bank', 'gruppo', 'group', 'holding', 'finance', 'financial',
]);

/**
 * Normalise a free-text merchant description to a comparable key.
 * Strips noise words, numbers, punctuation; keeps first 3 meaningful tokens.
 */
export function normalizeMerchant(description: string): string {
  if (!description) return '';
  return description
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')          // punctuation → space
    .replace(/\b\d{2,}\b/g, ' ')        // standalone numbers (≥2 digits) → space
    .split(/\s+/)
    .filter(w => w.length > 1 && !NOISE_WORDS.has(w))
    .slice(0, 3)
    .join(' ')
    .trim();
}

// ── Merchant history ──────────────────────────────────────────────────────────

export interface MerchantOccurrence {
  date: string;      // YYYY-MM-DD
  amount: number;
  category: string;
}

/**
 * Build an index of normalized merchant → all its occurrences across the
 * full transaction history. Used by detectRecurringTreatment.
 */
export function buildMerchantHistory(
  transactions: Transaction[],
): Record<string, MerchantOccurrence[]> {
  const result: Record<string, MerchantOccurrence[]> = {};
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const norm = normalizeMerchant(t.description);
    if (!norm) continue;
    (result[norm] ??= []).push({ date: t.date, amount: ownShare(t), category: t.category });
  }
  return result;
}

/**
 * Count how many distinct months in `recentKeys` had at least one occurrence
 * of each normalized merchant. Used for the one-off score (rare merchant signal).
 */
export function buildMerchantRecentMonths(
  transactions: Transaction[],
  recentKeys: string[],
): Record<string, number> {
  const recentSet = new Set(recentKeys);
  const pairs = new Set<string>();
  for (const t of transactions) {
    if (t.type !== 'expense') continue;
    const key = t.date.slice(0, 7);
    if (!recentSet.has(key)) continue;
    const norm = normalizeMerchant(t.description);
    if (!norm) continue;
    pairs.add(`${norm}::${key}`);
  }
  const out: Record<string, number> = {};
  for (const pair of pairs) {
    const [norm] = pair.split('::');
    out[norm] = (out[norm] ?? 0) + 1;
  }
  return out;
}

// ── Recurring detection ───────────────────────────────────────────────────────

const CADENCE_RANGES = [
  { name: 'weekly',  min: 5,   max: 9   },
  { name: 'monthly', min: 21,  max: 45  },
  { name: 'yearly',  min: 300, max: 420 },
] as const;

/**
 * Returns true when the transaction belongs to a recurring series.
 * Checks: explicit flags, then auto-detection from merchant history
 * (≥3 occurrences, same category, ±10% amount consistency, regular cadence).
 */
export function detectRecurringTreatment(
  tx: Transaction,
  merchantOccurrences: MerchantOccurrence[],
): boolean {
  // Explicit recurring flags always win
  if (tx.seriesId || tx.recurring) return true;

  // Filter to same category
  const sameCat = merchantOccurrences.filter(o => o.category === tx.category);
  if (sameCat.length < 3) return false;

  // Amount consistency: ≥3 occurrences within ±10% of their median
  const amounts = sameCat.map(o => o.amount);
  const medAmt = median(amounts);
  if (medAmt <= 0) return false;
  const consistent = sameCat.filter(o => Math.abs(o.amount - medAmt) / medAmt <= 0.10);
  if (consistent.length < 3) return false;

  // Require ≥2 distinct calendar months (3 same-month hits is not a cadence)
  const distinctMonths = new Set(sameCat.map(o => o.date.slice(0, 7)));
  if (distinctMonths.size < 2) return false;

  // Cadence: compute gaps between consecutive occurrences
  const sorted = [...sameCat].sort((a, b) => a.date.localeCompare(b.date));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime();
    gaps.push(Math.round(diff / 86400000));
  }
  if (gaps.length === 0) return false;

  const medGap = median(gaps);
  const matchesCadence = CADENCE_RANGES.some(r => medGap >= r.min && medGap <= r.max);
  if (!matchesCadence) return false;

  // ≥60% of gaps must be within 30% of the median gap (consistent rhythm)
  const stableGaps = gaps.filter(g => Math.abs(g - medGap) / medGap <= 0.30);
  return stableGaps.length >= Math.ceil(gaps.length * 0.60);
}

// ── Planned budget item matching ──────────────────────────────────────────────

/**
 * Returns the first PlannedBudgetItem that matches the transaction, or null.
 * Matching criteria: same category, amount within 15%, optional merchant and date range.
 */
export function matchPlannedBudgetItem(
  tx: Transaction,
  plannedItems: PlannedBudgetItem[],
): PlannedBudgetItem | null {
  const amt = ownShare(tx);
  const txMerchant = normalizeMerchant(tx.description);

  for (const item of plannedItems) {
    if (item.categoryId !== tx.category) continue;
    // Month filter: item.month must be the same as tx month
    if (item.month && !tx.date.startsWith(item.month)) continue;

    // Amount: within 15%
    if (item.expectedAmount > 0) {
      if (Math.abs(amt - item.expectedAmount) / item.expectedAmount > 0.15) continue;
    }

    // Merchant: if item has a pattern, tx must contain it (or vice-versa)
    if (item.merchantPattern) {
      const patternNorm = normalizeMerchant(item.merchantPattern);
      if (patternNorm && !txMerchant.includes(patternNorm) && !patternNorm.includes(txMerchant)) continue;
    }

    // Date range
    if (item.expectedDateRange) {
      if (tx.date < item.expectedDateRange.from || tx.date > item.expectedDateRange.to) continue;
    } else if (item.expectedDate) {
      const txMs  = new Date(tx.date).getTime();
      const expMs = new Date(item.expectedDate).getTime();
      if (Math.abs(txMs - expMs) > 3 * 86400000) continue;  // ±3 days
    }

    return item;
  }
  return null;
}

// ── One-off score ─────────────────────────────────────────────────────────────

export interface OneOffScore { score: number; reasons: string[] }

/**
 * Score ∈ [0,1]. A transaction is classified as one_off_extra when score ≥ 0.70.
 * Only called after explicit recurring detection has returned false.
 */
export function calculateOneOffScore(
  tx: Transaction,
  ctx: {
    medianTicket: number;
    recentActiveMonths: number;
    merchantRecentMonths: number;
    plannedItems: PlannedBudgetItem[];
    forecastRules: ForecastRule[];
  },
): OneOffScore {
  let score = 0;
  const reasons: string[] = [];
  const amt = ownShare(tx);

  // +0.30 — amount much higher than the typical ticket for this category
  if (ctx.medianTicket > 0 && amt > ctx.medianTicket * 3) {
    score += 0.30;
    reasons.push(`Importo molto più alto del solito (€${Math.round(amt)} vs ticket medio €${Math.round(ctx.medianTicket)})`);
  }

  // +0.25 — merchant is rare (appeared in ≤1 of the last 3 months)
  if (ctx.merchantRecentMonths <= 1) {
    score += 0.25;
    reasons.push('Merchant raro o mai visto di recente');
  }

  // +0.20 — category is historically irregular (active in <2 of last 3 months)
  if (ctx.recentActiveMonths < 2) {
    score += 0.20;
    reasons.push('Categoria storicamente irregolare');
  }

  // +0.20 — no recurring cadence detected (always true here since we're called after that check)
  score += 0.20;
  reasons.push('Nessuna periodicità regolare rilevata');

  // +0.30 — matches a planned one-off budget item
  const matched = matchPlannedBudgetItem(tx, ctx.plannedItems);
  if (matched?.kind === 'one_off') {
    score += 0.30;
    reasons.push('Corrisponde a una voce pianificata straordinaria');
  }

  // +0.40 — user-confirmed rule marks this as one-off
  const txMerchant = normalizeMerchant(tx.description);
  const rule = ctx.forecastRules.find(r =>
    r.treatment === 'one_off_extra' &&
    r.source === 'user_confirmed' &&
    (!r.categoryId || r.categoryId === tx.category) &&
    (!r.merchantPattern || txMerchant.includes(normalizeMerchant(r.merchantPattern))),
  );
  if (rule) {
    score += 0.40;
    reasons.push('Confermata dall\'utente come spesa straordinaria');
  }

  return { score: Math.min(1, score), reasons };
}

// ── Main inference function ───────────────────────────────────────────────────

export interface TreatmentContext {
  /** All occurrences of this tx's normalized merchant across the full history. */
  merchantOccurrences: MerchantOccurrence[];
  /** Median ticket (€) for this category from recent variable transactions. */
  medianTicket: number;
  /** How many of the last 3 months had any variable spend in this category. */
  recentActiveMonths: number;
  /** How many of the last 3 months had at least one transaction from this merchant. */
  merchantRecentMonths: number;
  plannedItems: PlannedBudgetItem[];
  forecastRules: ForecastRule[];
}

/**
 * Classify a transaction using the priority order:
 * 1. transfer       → transfer_excluded
 * 2. user rule      → rule.treatment
 * 3. planned item   → planned_normal | planned_one_off
 * 4. explicit recur → scheduled_recurring
 * 5. auto recur     → scheduled_recurring
 * 6. one-off score  → one_off_extra (if ≥ 0.70)
 * 7. fallback       → variable_normal
 */
export function inferForecastTreatment(
  tx: Transaction,
  ctx: TreatmentContext,
): ForecastTreatment {
  // 1. Transfers are always excluded
  if (tx.type === 'transfer') return 'transfer_excluded';

  const txMerchant = normalizeMerchant(tx.description);

  // 2. User-confirmed rule overrides everything
  const userRule = ctx.forecastRules.find(r =>
    r.source === 'user_confirmed' &&
    (!r.categoryId || r.categoryId === tx.category) &&
    (!r.merchantPattern || txMerchant.includes(normalizeMerchant(r.merchantPattern))) &&
    (!r.amountRange || (ownShare(tx) >= r.amountRange.min && ownShare(tx) <= r.amountRange.max)),
  );
  if (userRule) return userRule.treatment;

  // 3. Planned budget item match
  const planned = matchPlannedBudgetItem(tx, ctx.plannedItems);
  if (planned) return planned.kind === 'one_off' ? 'planned_one_off' : 'planned_normal';

  // 4. Explicit recurring flag
  if (tx.seriesId || tx.recurring) return 'scheduled_recurring';

  // 5. Auto-detected recurring pattern
  if (detectRecurringTreatment(tx, ctx.merchantOccurrences)) return 'scheduled_recurring';

  // 6. One-off score
  const { score } = calculateOneOffScore(tx, {
    medianTicket: ctx.medianTicket,
    recentActiveMonths: ctx.recentActiveMonths,
    merchantRecentMonths: ctx.merchantRecentMonths,
    plannedItems: ctx.plannedItems,
    forecastRules: ctx.forecastRules,
  });
  if (score >= 0.70) return 'one_off_extra';

  // 7. Default: normal variable spend
  return 'variable_normal';
}
