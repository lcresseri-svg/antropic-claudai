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
  return coachPlanFrom(buildSavingsContext(input), input.cost, input.targetDateISO);
}

/**
 * Come sopra, ma su un quadro già calcolato.
 *
 * La schermata il contesto ce l'ha già — lo usa per mostrare come è fatto il
 * mese senza chiamare nessuno — e ricostruirlo a ogni domanda sarebbe lavoro
 * doppio su dati identici.
 */
export function coachPlanFrom(ctx: SavingsContext, cost: number, targetDateISO?: string): CoachPlan {
  const plan = planPurchase(ctx, cost, targetDateISO);

  return {
    sustainableMonthly: ctx.sustainableMonthly,
    monthsOfHistory: ctx.monthsOfHistory,
    fixedMonthlyCost: ctx.fixedMonthlyCost,
    freeLiquidity: ctx.freeLiquidity,
    savingsTarget: ctx.savingsTarget,
    monthlyIncome: ctx.monthlyIncome,
    monthlyExpense: ctx.monthlyExpense,
    savingsRate: ctx.savingsRate,
    runwayMonths: ctx.runwayMonths,
    paceConfidence: ctx.paceConfidence,
    worstMonthNet: ctx.worstMonthNet,
    breakdown: {
      fixedMonthly: ctx.breakdown.fixedMonthly,
      periodicMonthly: ctx.breakdown.periodicMonthly,
      variableMonthly: ctx.breakdown.variableMonthly,
      reducibleMonthly: ctx.breakdown.reducibleMonthly,
    },
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
      .map(c => ({
        label: c.label,
        monthlyAvg: c.nature === 'periodic' ? c.monthlyReserve : c.monthlyAvg,
        nature: c.nature,
        reason: c.fixedReason,
      })),
    notes: plan.notes,
  };
}
