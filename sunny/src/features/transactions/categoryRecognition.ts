// Admin-only category recognition for the transaction form.
//
// Two layers, evaluated in order by `recognizeCategory`:
//
//  L1 — historical memory: an index merchant→category built from the user's OWN
//       past transactions. If a merchant has a strong, consistent history that
//       falls among the candidate categories, suggest it with a confidence based
//       on how dominant that category is for the merchant.
//
//  L2 — corrected keyword fallback: when there's no reliable history, score
//       EVERY candidate (no first-match-by-order) using word-boundary token
//       matching (no raw `includes`, so "barbiere" ≠ "bar" and "gasata" ≠ "gas")
//       over semantic tags that are decoupled from concrete category ids — tags
//       resolve to a candidate by DEFAULT id OR by label, so custom / renamed
//       categories benefit too.
//
// Everything here is pure and deterministic (no network, no Date.now in the
// scoring path): the only time reference is the dataset's own date range, used
// for the recency bonus, so results are reproducible and unit-testable.

import { CATEGORY_KEYWORDS } from '../../utils';
import { DEFAULT_CATEGORIES } from '../../defaults';

/** A category a recognition may resolve to (the form passes its visible chips). */
export interface Candidate {
  id: string;
  label: string;
}

/** Minimal shape the index builder needs from a transaction. */
export interface IndexableTransaction {
  description: string;
  category: string;
  date?: string;       // YYYY-MM-DD — drives the recency bonus
  projected?: boolean; // virtual future occurrences are skipped
}

/** merchantKey → (categoryId → weight). Plain object so it's easy to memoize. */
export type MerchantIndex = Record<string, Record<string, number>>;

export interface Recognition {
  categoryId: string;
  confidence: number; // 0..1
}

/** Auto-apply only at or above this confidence. Shared with the form. */
export const RECOGNITION_THRESHOLD = 0.5;

// Recency bonus added on top of the base frequency (1 per occurrence) for the
// most recent transaction; the oldest gets 0. Keeps frequency dominant while
// letting a recent re-categorization tip a close call.
const RECENCY_BONUS = 0.5;

// L1 fires only when the dominant historical category owns at least this share
// of the merchant's (candidate-eligible) weight — otherwise the history is too
// mixed to be reliable and we fall through to L2.
const L1_MIN_SHARE = 0.6;

// Prefix matching is allowed only for keywords at least this long, so short,
// collision-prone stems ("gas", "bar", "pub") match whole tokens ONLY.
const MIN_PREFIX_LEN = 5;

// Smoothing term in the L2 confidence ratio best/(best+second+SMOOTH): a lone
// hit clears the threshold, while a tie between two categories does not.
const L2_SMOOTH = 0.6;

// ── Merchant normalisation ───────────────────────────────────────────────────

// Payment / banking noise that is never part of the merchant name.
const NOISE_TOKENS = new Set([
  'pagamento', 'pag', 'pos', 'carta', 'bancomat', 'addebito', 'acquisto',
  'acquisti', 'operazione', 'prelievo', 'bonifico', 'sepa', 'ricarica',
  'contactless', 'presso', 'causale', 'rif', 'riferimento', 'data', 'ore',
  'del', 'visa', 'mastercard', 'maestro', 'spa', 'srl', 'sas', 'snc',
]);

// Street descriptors — drop so "Esselunga via Roma" keys to the merchant.
const STREET_TOKENS = new Set([
  'via', 'viale', 'corso', 'piazza', 'piazzale', 'largo', 'vicolo', 'strada',
]);

// Common Italian cities — location noise on card statements.
const GEO_TOKENS = new Set([
  'milano', 'roma', 'torino', 'napoli', 'palermo', 'genova', 'bologna',
  'firenze', 'bari', 'catania', 'venezia', 'verona', 'messina', 'padova',
  'trieste', 'brescia', 'parma', 'modena', 'reggio', 'perugia', 'livorno',
  'cagliari', 'rimini', 'salerno', 'ferrara', 'sassari', 'latina', 'monza',
  'bergamo', 'pescara', 'vicenza', 'bolzano', 'novara', 'ancona', 'como',
  'lecce', 'varese', 'pisa', 'cremona', 'pavia',
]);

/**
 * Normalise a free-text description into a stable merchant key: lowercase, drop
 * payment noise, dates, numbers and short card sigles, then collapse to the
 * significant tokens (location/street words removed when something survives).
 */
export function normalizeMerchant(description: string): string {
  const tokens = (description.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    // drop pure numbers (dates split into 12 / 06, amounts, card digits),
    // very short sigles, and payment noise
    .filter(t => !/^\d+$/.test(t) && t.length >= 3 && !NOISE_TOKENS.has(t));

  const merchant = tokens.filter(t => !STREET_TOKENS.has(t) && !GEO_TOKENS.has(t));
  // If stripping geo/street emptied it, keep the broader significant tokens
  // rather than returning nothing.
  return (merchant.length ? merchant : tokens).join(' ');
}

// ── L1 — historical index ────────────────────────────────────────────────────

/**
 * Build the merchant→category index from the user's own transactions. Weight is
 * the occurrence count plus a small recency bonus, computed relative to the
 * dataset's own date span (no wall-clock dependency → deterministic).
 */
export function buildMerchantIndex(transactions: IndexableTransaction[]): MerchantIndex {
  const usable = transactions.filter(t => !t.projected && t.category && t.description);

  let minT = Infinity, maxT = -Infinity;
  for (const t of usable) {
    const ms = t.date ? Date.parse(t.date) : NaN;
    if (!Number.isNaN(ms)) { if (ms < minT) minT = ms; if (ms > maxT) maxT = ms; }
  }
  const span = maxT > minT ? maxT - minT : 0;

  const index: MerchantIndex = {};
  for (const t of usable) {
    const key = normalizeMerchant(t.description);
    if (!key) continue;
    const ms = t.date ? Date.parse(t.date) : NaN;
    const recency = span && !Number.isNaN(ms) ? (ms - minT) / span : 0;
    const weight = 1 + RECENCY_BONUS * recency;
    const bucket = index[key] ?? (index[key] = {});
    bucket[t.category] = (bucket[t.category] ?? 0) + weight;
  }
  return index;
}

// ── L2 — keyword scoring ─────────────────────────────────────────────────────

const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normLabel = (s: string) => stripAccents(s.toLowerCase()).replace(/[^a-z0-9]+/g, '');

// Default category id → its default label, so a renamed/custom category can be
// matched to a semantic tag by label when its id is no longer the default one.
const DEFAULT_LABEL_BY_ID: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.map(c => [c.id, normLabel(c.label)]),
);

/** Resolve which candidate a semantic tag points to: by default id, else label. */
function resolveCandidate(tagId: string, candidates: Candidate[]): Candidate | undefined {
  const byId = candidates.find(c => c.id === tagId);
  if (byId) return byId;
  const wantLabel = DEFAULT_LABEL_BY_ID[tagId];
  if (!wantLabel) return undefined;
  return candidates.find(c => normLabel(c.label) === wantLabel);
}

/** Does a single keyword match the token set / phrase string? */
function keywordStrength(kw: string, tokens: string[], phrase: string): number {
  if (kw.includes(' ')) return phrase.includes(` ${kw} `) ? 1.5 : 0;
  if (tokens.includes(kw)) return 1;
  if (kw.length >= MIN_PREFIX_LEN && tokens.some(t => t.startsWith(kw))) return 0.8;
  return 0;
}

/** Score every candidate from keyword tags + the candidate's own label. */
function scoreCandidates(description: string, candidates: Candidate[]): Map<string, number> {
  const tokens = description.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const phrase = ` ${tokens.join(' ')} `;
  const scores = new Map<string, number>();
  const add = (id: string, w: number) => scores.set(id, (scores.get(id) ?? 0) + w);

  // Semantic tags → resolved candidate (id or label) → keyword strength.
  for (const [tagId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const target = resolveCandidate(tagId, candidates);
    if (!target) continue;
    let s = 0;
    for (const kw of keywords) s += keywordStrength(kw, tokens, phrase);
    if (s > 0) add(target.id, s);
  }

  // The candidate's own label as an implicit keyword (helps custom categories).
  const tokenSet = new Set(tokens);
  for (const c of candidates) {
    const label = c.label.toLowerCase();
    if (label.length < 3 || label === 'altro') continue;
    if (tokenSet.has(label)) add(c.id, 1.2);
  }

  return scores;
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Recognise the most likely category for a description, restricted to the given
 * candidates (already filtered by type → no cross-type leakage). L1 history wins
 * when reliable; otherwise the corrected L2 keyword scoring decides. Returns null
 * when nothing scores.
 */
export function recognizeCategory(
  { description, candidates, index }: { description: string; candidates: Candidate[]; index: MerchantIndex },
): Recognition | null {
  if (!description.trim() || candidates.length === 0) return null;
  const candidateIds = new Set(candidates.map(c => c.id));

  // L1 — restrict the historical bucket to the candidate categories only.
  const key = normalizeMerchant(description);
  const bucket = key ? index[key] : undefined;
  if (bucket) {
    let topId: string | null = null, topW = 0, totalW = 0;
    for (const [catId, w] of Object.entries(bucket)) {
      if (!candidateIds.has(catId)) continue; // ignore cross-type / removed cats
      totalW += w;
      if (w > topW) { topW = w; topId = catId; }
    }
    if (topId && totalW > 0) {
      const share = topW / totalW;
      if (share >= L1_MIN_SHARE) {
        return { categoryId: topId, confidence: Math.min(0.99, share) };
      }
    }
  }

  // L2 — corrected keyword scoring across ALL candidates.
  const scores = scoreCandidates(description, candidates);
  let bestId: string | null = null, best = 0, second = 0;
  for (const [id, s] of scores) {
    if (s > best) { second = best; best = s; bestId = id; }
    else if (s > second) { second = s; }
  }
  if (!bestId || best <= 0) return null;
  return { categoryId: bestId, confidence: best / (best + second + L2_SMOOTH) };
}
