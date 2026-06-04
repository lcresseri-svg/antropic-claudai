export interface AffordabilityRequest {
  itemName: string;
  cost: number;
  targetDate?: string;
  priority?: 'low' | 'medium' | 'high';
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
