/**
 * Insight ranking V2 (admin-only, flag `insight_ranking_v2`) — pure module.
 *
 * Scores the insights produced by the existing engine on five deterministic
 * dimensions — impact, urgency, confidence, novelty, actionability — and
 * assigns each one a DOMAIN (cashflow / budget / patrimonio / investimenti /
 * ricorrenti / qualità dati) so future work can physically split the engine
 * along the same lines without changing the ranking contract.
 *
 * The home shows exactly ONE top insight (topInsight). Repetitions are removed
 * (same family / same title), and contradictions can't survive because at most
 * one insight per family is kept. All mappings are static lookup tables — no
 * randomness, no AI, no false precision (scores are coarse 0–3 steps).
 */
import { Insight, InsightCategory } from './insightsEngine';

export type InsightDomain =
  | 'cashflow' | 'budget' | 'patrimonio' | 'investimenti' | 'ricorrenti' | 'qualita_dati';

export interface RankedInsight {
  insight: Insight;
  domain: InsightDomain;
  scores: {
    impact: number;        // 0–3: how much money/risk is at stake
    urgency: number;       // 0–3: how soon acting matters
    confidence: number;    // 0–3: how solid the underlying signal is
    novelty: number;       // 0–2: unseen insights beat repeated ones
    actionability: number; // 0–3: is there a concrete next step
  };
  total: number;
}

const IMPACT: Record<InsightCategory, number> = {
  alert: 3, forecast: 2.5, trend: 2, seasonal: 1.5, habit: 1, highlight: 1,
};
const ACTIONABILITY: Record<InsightCategory, number> = {
  alert: 3, forecast: 2, seasonal: 2, habit: 1.5, trend: 1, highlight: 0.5,
};

/** Static keyword → domain table (checked in order; first match wins). */
const DOMAIN_KEYWORDS: [InsightDomain, RegExp][] = [
  ['investimenti', /invest|portafoglio|controvalore|versat|pac\b|etf/i],
  ['patrimonio', /patrimonio|net\s?worth|liquidit|autonomia|salvadanaio/i],
  ['ricorrenti', /ricorrent|abbonament|rat[ae]\b|scadenz|pagamento|canone/i],
  ['budget', /budget|obiettivo|limite|tetto|piano/i],
  ['qualita_dati', /registr|aggiorn|dat[oi] mancant|censis|import/i],
];

export function classifyDomain(i: Insight): InsightDomain {
  const text = `${i.title} ${i.detail}`;
  for (const [domain, re] of DOMAIN_KEYWORDS) {
    if (re.test(text)) return domain;
  }
  return 'cashflow'; // default: month money-in/money-out insights
}

export interface RankOptions {
  /** Titles the user has already seen recently (novelty penalty). */
  seenTitles?: ReadonlySet<string>;
}

export function rankInsights(insights: Insight[], opts: RankOptions = {}): RankedInsight[] {
  const seen = opts.seenTitles ?? new Set<string>();

  // Deduplicate: at most one insight per family, first occurrence wins (the
  // engine already orders within a family by priority); then by exact title.
  const takenFamilies = new Set<string>();
  const takenTitles = new Set<string>();
  const unique: Insight[] = [];
  for (const i of insights) {
    if (i._family && takenFamilies.has(i._family)) continue;
    if (takenTitles.has(i.title)) continue;
    if (i._family) takenFamilies.add(i._family);
    takenTitles.add(i.title);
    unique.push(i);
  }

  const ranked = unique.map((insight): RankedInsight => {
    const impact = IMPACT[insight.category];
    const urgency = insight.urgent ? 3 : insight.category === 'alert' ? 2 : insight.category === 'forecast' ? 1.5 : 1;
    // Confidence: an insight with a full explanation (explain) is backed by a
    // computed breakdown; cautionary tones on sparse categories rank lower.
    const confidence = (insight.explain ? 2 : 1) + (insight.category === 'habit' ? 0 : 1);
    const novelty = seen.has(insight.title) ? 0 : 2;
    const actionability = ACTIONABILITY[insight.category];
    const total = impact + urgency + confidence + novelty + actionability;
    return {
      insight,
      domain: classifyDomain(insight),
      scores: { impact, urgency, confidence, novelty, actionability },
      total: Math.round(total * 10) / 10,
    };
  });

  ranked.sort((a, b) => b.total - a.total);
  return ranked;
}

/** The single insight the home should show (null when there's nothing). */
export function topInsight(insights: Insight[], opts: RankOptions = {}): RankedInsight | null {
  const ranked = rankInsights(insights, opts);
  return ranked.length > 0 ? ranked[0] : null;
}
