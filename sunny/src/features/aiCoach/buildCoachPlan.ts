/**
 * Dal quadro finanziario al payload per il modello.
 *
 * Sta fra `savingsEngine` (che calcola) e la Cloud Function (che racconta):
 * prende il contesto e il piano deterministici e ne estrae il minimo
 * serializzabile, perché la richiesta resti piccola e la validazione lato
 * server semplice.
 */
import { Transaction, CategoryDef } from '../../types';
import { buildSavingsContext, planPurchase, SavingsContext } from './savingsEngine';
import { CoachPlan } from './aiCoachTypes';

/** Quante categorie di contesto passare: oltre, il prompt si diluisce. */
const TOP_CATEGORIES = 5;

export interface CoachPlanInput {
  transactions: Transaction[];
  categories: CategoryDef[];
  todayISO: string;
  liquidity: number;
  freeLiquidity?: number;
  savingsTarget?: number;
  fixedMonthlyCost?: number;
  endingInstallments?: SavingsContext['endingInstallments'];
  cost: number;
  targetDateISO?: string;
}

export function buildCoachPlan(input: CoachPlanInput): CoachPlan {
  const ctx = buildSavingsContext(input);
  const plan = planPurchase(ctx, input.cost, input.targetDateISO);

  return {
    sustainableMonthly: ctx.sustainableMonthly,
    monthsOfHistory: ctx.monthsOfHistory,
    fixedMonthlyCost: ctx.fixedMonthlyCost,
    freeLiquidity: ctx.freeLiquidity,
    savingsTarget: ctx.savingsTarget,
    fitsThisMonth: plan.fitsThisMonth,
    affordableNow: plan.affordableNow,
    monthsToAfford: plan.monthsToAfford,
    readyByISO: plan.readyByISO,
    requiredMonthly: plan.requiredMonthly,
    feasible: plan.feasible,
    gapMonthly: plan.gapMonthly,
    monthsWithCuts: plan.monthsWithCuts,
    cuts: plan.cuts.map(c => ({ label: c.label, amount: c.amount, currentMonthly: c.currentMonthly })),
    topCategories: ctx.categories.slice(0, TOP_CATEGORIES)
      .map(c => ({ label: c.label, monthlyAvg: c.monthlyAvg })),
    notes: plan.notes,
  };
}
