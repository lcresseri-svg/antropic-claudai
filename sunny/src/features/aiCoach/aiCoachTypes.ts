export interface AffordabilityRequest {
  itemName: string;
  cost: number;
  targetDate?: string;
  alreadySaved?: number;
  priority?: 'low' | 'medium' | 'high';
}

export interface CutSuggestion {
  categoryId: string;
  amount: number;
}

export interface AffordabilityResult {
  verdict: 'yes' | 'maybe' | 'no';
  projectedMonthlySaving: number;
  requiredMonthly: number | null;
  gap: number | null;
  daysLeft: number | null;
  topCuts: CutSuggestion[];
  advice: string;
  remaining: number;
}
