/**
 * Decision Coach (admin-only, flag `decision_coach`) — pure, DETERMINISTIC
 * scenario engine. The AI layer (generateAffordabilityAdvice) may only PHRASE
 * these numbers; it never produces them.
 *
 * For a purchase it compares three scenarios:
 *  - acquisto immediato     pay the full cost now;
 *  - riduzione spese        keep the purchase but fund it by trimming a slice
 *                           of variable spending over the following months;
 *  - rinvio                 save at the current pace and buy when covered.
 *
 * Every scenario reports residual liquidity, whether the safety reserve stays
 * intact, months of autonomy after, impact on the monthly savings goal, the
 * commitments due in the next 30 days, a coarse risk level and the data the
 * computation could NOT rely on (declared, not guessed).
 */

export interface DecisionCoachInput {
  itemName: string;
  cost: number;
  /** Current total liquidity (from the dashboard). */
  liquidity: number;
  /** Safety reserve the user wants untouched. */
  reserve: number;
  /** Projected net monthly savings at the current pace (may be ≤ 0). */
  monthlySavings: number;
  /** Committed outflows in the next 30 days (recurring + planned). */
  upcomingCommitted30d: number;
  /** Median monthly total expenses (autonomy denominator); null = unknown. */
  medianMonthlyExpenses: number | null;
  /** Monthly savings goal (0 = none set). */
  savingsTarget: number;
  /** Realistic monthly amount recoverable by trimming variable spending. */
  monthlyCutPotential: number;
}

export type RiskLevel = 'basso' | 'medio' | 'alto';

export interface DecisionScenario {
  kind: 'acquisto_immediato' | 'riduzione_spese' | 'rinvio';
  label: string;
  /** Liquidity left right after the purchase (rinvio: at purchase time). */
  residualLiquidity: number;
  reserveIntact: boolean;
  /** Months of autonomy AFTER the purchase; null when expenses are unknown. */
  autonomyMonthsAfter: number | null;
  /** Months before the purchase can happen (0 = immediately). */
  monthsToPurchase: number | null;
  /** Effect on the savings goal during the funding period (€/month, ≤ 0). */
  savingsGoalImpact: number;
  risk: RiskLevel;
  notes: string[];
}

export interface DecisionAnalysis {
  itemName: string;
  cost: number;
  scenarios: DecisionScenario[];
  /** Data the analysis could not rely on. */
  missingData: string[];
  /** Deterministic recommendation: the lowest-risk scenario that works. */
  recommended: DecisionScenario['kind'];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function autonomyAfter(liquidity: number, medianExpenses: number | null): number | null {
  if (medianExpenses == null || medianExpenses <= 0) return null;
  return r2(Math.max(0, liquidity) / medianExpenses);
}

function riskOf(residual: number, reserveIntact: boolean, autonomy: number | null): RiskLevel {
  if (residual < 0) return 'alto';
  if (!reserveIntact) return 'alto';
  if (autonomy !== null && autonomy < 1) return 'alto';
  if (autonomy !== null && autonomy < 3) return 'medio';
  return 'basso';
}

export function evaluatePurchase(input: DecisionCoachInput): DecisionAnalysis {
  const cost = Math.max(0, input.cost);
  const reserve = Math.max(0, input.reserve);
  const missingData: string[] = [];
  if (input.medianMonthlyExpenses == null) missingData.push('Storico spese insufficiente: autonomia non calcolabile.');
  if (input.monthlySavings <= 0) missingData.push('Il mese non genera risparmio al ritmo attuale: i tempi di rientro sono indicativi.');
  if (input.savingsTarget <= 0) missingData.push('Nessun obiettivo di risparmio impostato: impatto sull\'obiettivo non valutabile.');

  // ── Acquisto immediato ──────────────────────────────────────────────────────
  const resNow = r2(input.liquidity - cost - input.upcomingCommitted30d);
  const buyNow: DecisionScenario = {
    kind: 'acquisto_immediato',
    label: 'Compra subito',
    residualLiquidity: resNow,
    reserveIntact: resNow >= reserve,
    autonomyMonthsAfter: autonomyAfter(resNow, input.medianMonthlyExpenses),
    monthsToPurchase: 0,
    savingsGoalImpact: input.savingsTarget > 0 ? r2(-Math.min(cost, input.savingsTarget)) : 0,
    risk: 'basso',
    notes: [
      `Liquidità dopo l'acquisto e gli impegni dei prossimi 30 giorni: ${resNow} €.`,
    ],
  };
  buyNow.risk = riskOf(resNow, buyNow.reserveIntact, buyNow.autonomyMonthsAfter);
  if (!buyNow.reserveIntact) buyNow.notes.push(`La riserva di ${reserve} € verrebbe intaccata.`);

  // ── Riduzione spese ────────────────────────────────────────────────────────
  const acceleratedPace = Math.max(0, input.monthlySavings) + Math.max(0, input.monthlyCutPotential);
  const monthsWithCuts = acceleratedPace > 0 ? Math.ceil(cost / acceleratedPace) : null;
  const cut: DecisionScenario = {
    kind: 'riduzione_spese',
    label: 'Riduci le spese e compra',
    residualLiquidity: r2(input.liquidity - input.upcomingCommitted30d),
    reserveIntact: true,
    autonomyMonthsAfter: autonomyAfter(input.liquidity, input.medianMonthlyExpenses),
    monthsToPurchase: monthsWithCuts,
    savingsGoalImpact: 0, // il taglio finanzia l'acquisto senza toccare l'obiettivo
    risk: monthsWithCuts === null ? 'alto' : 'basso',
    notes: monthsWithCuts === null
      ? ['Senza margine di risparmio né tagli possibili, l\'acquisto non si autofinanzia.']
      : [`Tagliando ~${r2(input.monthlyCutPotential)} €/mese di spese variabili, copri il costo in ~${monthsWithCuts} mesi senza toccare riserva e obiettivo.`],
  };

  // ── Rinvio ─────────────────────────────────────────────────────────────────
  const pace = Math.max(0, input.monthlySavings);
  const monthsToSave = pace > 0 ? Math.ceil(cost / pace) : null;
  const postpone: DecisionScenario = {
    kind: 'rinvio',
    label: 'Rimanda e accumula',
    residualLiquidity: r2(input.liquidity - input.upcomingCommitted30d),
    reserveIntact: true,
    autonomyMonthsAfter: autonomyAfter(input.liquidity, input.medianMonthlyExpenses),
    monthsToPurchase: monthsToSave,
    savingsGoalImpact: 0,
    risk: monthsToSave === null ? 'alto' : 'basso',
    notes: monthsToSave === null
      ? ['Al ritmo attuale non si accumula: servono tagli o entrate extra.']
      : [`Al ritmo attuale (${r2(pace)} €/mese) il costo è coperto in ~${monthsToSave} mesi, senza toccare la liquidità di oggi.`],
  };

  const scenarios = [buyNow, cut, postpone];

  // Recommendation: buy now only when low-risk; otherwise the faster of the
  // two funded paths; ties favour cutting (keeps the purchase sooner).
  let recommended: DecisionScenario['kind'];
  if (buyNow.risk === 'basso') recommended = 'acquisto_immediato';
  else if (cut.monthsToPurchase !== null &&
    (postpone.monthsToPurchase === null || cut.monthsToPurchase <= postpone.monthsToPurchase)) recommended = 'riduzione_spese';
  else recommended = 'rinvio';

  return { itemName: input.itemName, cost: r2(cost), scenarios, missingData, recommended };
}
