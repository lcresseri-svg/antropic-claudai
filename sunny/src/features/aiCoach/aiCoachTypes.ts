export interface AffordabilityRequest {
  itemName: string;
  cost: number;
  targetDate?: string;
  priority?: 'low' | 'medium' | 'high';
  /**
   * Quadro e piano calcolati dal client con `savingsEngine.ts`.
   *
   * I numeri li fa il codice, non il modello: la funzione li usa come dati di
   * fatto e chiede al modello solo di spiegarli. Opzionale, così un client
   * vecchio continua a funzionare con il calcolo lato server di prima.
   */
  plan?: CoachPlan;
}

/** Come si legge una categoria di spesa: la natura la deduce il codice dai
 *  dati, non il modello dal nome. */
export type PlanNature = 'fixed' | 'periodic' | 'variable' | 'oneOff';

/** Sottoinsieme serializzabile di quello che `savingsEngine` sa. */
export interface CoachPlan {
  /** Ritmo di risparmio su cui contare (la più bassa delle medie 3/6/12,
   *  al netto degli accantonamenti periodici non ancora spesi). */
  sustainableMonthly: number;
  monthsOfHistory: number;
  fixedMonthlyCost: number;
  freeLiquidity: number;
  savingsTarget: number;
  /** Entrate e uscite mensili misurate, lette in modo prudente. */
  monthlyIncome: number;
  monthlyExpense: number;
  /** Quota del reddito che resta (0–1). */
  savingsRate: number;
  /** Mesi di spese coperti dalla liquidità libera. */
  runwayMonths: number | null;
  /** Quanto ci si può fidare del ritmo misurato. */
  paceConfidence: 'alta' | 'media' | 'bassa';
  /** Il mese chiuso peggiore osservato. */
  worstMonthNet: number;
  /** Il mese diviso per quello che si può davvero decidere. */
  breakdown: {
    fixedMonthly: number;
    periodicMonthly: number;
    variableMonthly: number;
    reducibleMonthly: number;
  };
  fitsThisMonth: boolean;
  affordableNow: boolean;
  monthsToAfford: number | null;
  readyByISO: string | null;
  requiredMonthly: number | null;
  feasible: boolean | null;
  gapMonthly: number;
  monthsWithCuts: number | null;
  cuts: { label: string; amount: number; currentMonthly: number }[];
  /** Categorie di spesa più pesanti, con natura e motivo: è così che il
   *  modello sa che l'affitto non si taglia senza doverlo dedurre dal nome. */
  topCategories: { label: string; monthlyAvg: number; nature: PlanNature; reason: string }[];
  /** Avvertenze già verificate: storico corto, stagionalità, rate in scadenza. */
  notes: string[];
}

export interface CutSuggestion {
  categoryId: string;
  label: string;
  amount: number;
}

export interface AffordabilityResult {
  monthlySaving: number;
  /** Projected monthly income / expenses / investments (cross-referenced). */
  monthlyIncome?: number;
  monthlyExpenses?: number;
  monthlyInvestments?: number;
  /** Already-committed outflows this month (recurring + planned). */
  upcomingCommitted?: number;
  /** User's monthly savings goal, if set. */
  savingsTarget?: number;
  /** Cost fits within a single month's saving (small purchase). */
  fitsThisMonth: boolean;
  /** If not fitting: how much buying it all now overshoots the month by. */
  monthOvershoot: number;
  /** If fitting: how much saving would be left this month after buying. */
  leftoverIfBought: number;
  /** Months to afford at current pace (null if no saving). */
  monthsToAfford: number | null;
  /** Months to afford with ~30% cuts on top categories. */
  monthsToAffordWithCuts: number | null;
  /** Italian month label you'd reach the goal by (e.g. "ottobre 2026"). */
  readyBy: string | null;
  /** If a deadline was given: required monthly saving to hit it. */
  requiredMonthly: number | null;
  /** If a deadline was given: whether it's feasible. */
  targetFeasible: boolean | null;
  daysLeft: number | null;
  topCuts: CutSuggestion[];
  advice: string;
  remaining: number;
}
