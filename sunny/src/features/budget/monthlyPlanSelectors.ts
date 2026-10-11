import { CategoryDef, Transaction, ownShare } from '../../types';
import { flowParts } from '../../shared/financialFlow';
import { applyRefunds } from '../../shared/refunds';
import { buildProjectedOccurrences, isExpiredTemplate } from '../../shared/recurrence';
import { MonthlyBudget, monthKeyOf } from './monthlyBudget';

export const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);
export const localDay = (date: Date) => `${monthKeyOf(date)}-${String(date.getDate()).padStart(2, '0')}`;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
export type PlanCategoryState = 'spent-over' | 'committed-over' | 'forecast-risk' | 'within' | 'unlimited';
export interface PlanCategory {
  id: string; label: string; icon: string; archived: boolean;
  spent: number; scheduled: number; limit: number | null; remaining: number | null;
  forecast: number | null; state: PlanCategoryState;
}
export interface PlanDecision { id: string; priority: number; text: string; amount?: number; category?: string }
export interface PlanForecast { total: number; byCategory: Record<string, number> }
export interface MonthlyPlanInput {
  month: string; now: Date; plan?: MonthlyBudget | null; transactions: Transaction[];
  categories: CategoryDef[]; forecast?: PlanForecast | null;
}

/** Raw or pre-annotated transactions accepted. Rebuild refund annotation at the
 * boundary with today's cutoff, never subtract it again in the aggregates. */
export function planTransactions(transactions: Transaction[], now: Date) {
  return applyRefunds(transactions.filter(t => !t.projected && !isExpiredTemplate(t))
    .map(({ refundedTotal: _derived, ...t }) => t), localDay(now));
}

/** Deduplicate series/date; actual documents win over a template or projection.
 * Project only the selected window (daily series are not capped by earlier months). */
export function monthOccurrences(transactions: Transaction[], month: string, now: Date) {
  const today = localDay(now);
  const [y, m] = month.split('-').map(Number);
  const end = `${month}-${new Date(y, m, 0).getDate()}`;
  const start = month > monthKeyOf(now) ? `${month}-01` : today;
  const templates = new Map<string, Transaction>();
  for (const t of transactions) if (t.recurring) {
    const id = t.seriesId ?? t.id;
    if (!templates.has(id) || t.date > templates.get(id)!.date) templates.set(id, t);
  }
  const key = (t: Transaction) => t.seriesId || t.recurring ? `${t.seriesId ?? t.id}|${t.date}` : t.id;
  const actual = transactions.filter(t => !t.recurring && !t.projected);
  const have = new Set(actual.map(key));
  const future = new Map<string, Transaction>();
  for (const t of [...actual, ...templates.values(), ...buildProjectedOccurrences([...templates.values()], start, end, { cap: 400 })]) {
    if (t.date <= today || !t.date.startsWith(month) || isExpiredTemplate(t)) continue;
    if ((t.recurring || t.projected) && have.has(key(t))) continue;
    if (!future.has(key(t))) future.set(key(t), t);
  }
  return { realized: actual.filter(t => t.date <= today && t.date.startsWith(month)),
    scheduled: [...future.values()].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) };
}

/** All newly aggregated money is in integer cents. Forecast input is already a
 * total, never an incremental amount to add to realized/committed expenses. */
export function selectMonthlyPlan(input: MonthlyPlanInput) {
  const { month, now, plan, categories } = input;
  const currentMonth = monthKeyOf(now);
  const period = month < currentMonth ? 'past' : month > currentMonth ? 'future' : 'current';
  const transactions = planTransactions(input.transactions, now);
  const { realized, scheduled } = monthOccurrences(transactions, month, now);
  const forecast = period === 'current' ? input.forecast ?? null : null;
  const expense = realized.filter(t => t.type === 'expense');
  const upcoming = scheduled.filter(t => t.type === 'expense');
  const A = sum(expense.map(t => cents(ownShare(t))));
  const C = sum(upcoming.map(t => cents(ownShare(t))));
  const Ia = sum(realized.map(t => cents(flowParts(t).investedFromAccounts)));
  const Ic = sum(scheduled.map(t => cents(flowParts(t).investedFromAccounts)));
  const It = sum(Object.values(plan?.planningV3?.cashInvestmentBudgets ?? {}).map(cents));
  const Ir = Math.max(It, Ia + Ic);
  const E = sum(Object.values(plan?.incomeBudgets ?? {}).map(cents));
  const S = cents(plan?.savingsTarget ?? 0);
  const reviewed = !!plan?.planningV3?.inputsReviewedAt;
  const P = reviewed ? E - S - Ir : null;
  const M = P === null ? null : P - A - C;
  const receivedIncome = sum(realized.filter(t => t.type === 'income').map(t => cents(t.amount)));
  const pendingIncome = Math.max(0, E - receivedIncome);
  const predictedIds = Object.entries(forecast?.byCategory ?? {}).filter(([,amount])=>amount>0).map(([id])=>id);
  const ids = new Set([...Object.keys(plan?.categoryBudgets ?? {}), ...expense.map(t=>t.category), ...upcoming.map(t=>t.category), ...predictedIds]);
  const rows: PlanCategory[] = [...ids].map(id => {
    const cat = categories.find(c=>c.id===id);
    const limit = (plan?.categoryBudgets[id] ?? 0) > 0 ? cents(plan!.categoryBudgets[id]) : null;
    const spent = sum(expense.filter(t=>t.category===id).map(t=>cents(ownShare(t))));
    const scheduled = sum(upcoming.filter(t=>t.category===id).map(t=>cents(ownShare(t))));
    const predicted = forecast?.byCategory[id] === undefined ? null : cents(forecast.byCategory[id]);
    const state: PlanCategoryState = limit === null ? 'unlimited' : spent > limit ? 'spent-over' :
      spent + scheduled > limit ? 'committed-over' : predicted !== null && predicted > limit ? 'forecast-risk' : 'within';
    return { id, label: cat?.label ?? `Categoria ${id || 'non disponibile'}`, icon: cat?.icon ?? '📁', archived: !!cat?.archived,
      limit, spent, scheduled, remaining: limit === null ? null : limit-spent-scheduled, forecast: predicted, state };
  });
  const rank = { 'spent-over':0, 'committed-over':1, 'forecast-risk':2, within:3, unlimited:3 };
  rows.sort((a,b)=>rank[a.state]-rank[b.state] || (b.spent+b.scheduled)-(a.spent+a.scheduled) || a.id.localeCompare(b.id));
  const U = P === null ? null : P - sum(rows.map(r=>Math.max(r.limit ?? 0,r.spent+r.scheduled)));
  const forecastGap = P === null || !forecast ? null : P - cents(forecast.total);
  const decisions: PlanDecision[] = [];
  if (!reviewed) decisions.push({id:'review',priority:0,text:'Completa le entrate e rivedi gli obiettivi del piano.'});
  else if (plan?.status !== 'confirmed' && period !== 'past') decisions.push({id:'draft',priority:0,text:'Il piano è ancora una bozza da confermare.'});
  if (M !== null && M < 0) decisions.push({id:'deficit',priority:1,text:'Mancano risorse al tuo piano.',amount:-M});
  else if (U !== null && U < 0) decisions.push({id:'allocation',priority:1,text:'I limiti impegnano più della capacità di spesa.',amount:-U});
  for (const row of rows) if (row.state !== 'within' && row.state !== 'unlimited') decisions.push({
    id:row.id,category:row.id,priority:row.state==='forecast-risk'?3:2,
    text:`${row.label}: ${row.state==='forecast-risk'?'sforamento stimato':row.state==='spent-over'?'limite superato':'oltre il limite con le spese programmate'}`,
    amount:row.state==='forecast-risk'?row.forecast! - row.limit!: -row.remaining!,
  });
  if (forecastGap !== null && forecastGap < 0) decisions.push({id:'forecast',priority:3,text:'La spesa stimata supera la capacità del piano.',amount:-forecastGap});
  if (reviewed && receivedIncome > E) decisions.push({id:'income',priority:4,text:'Incassi superiori al piano: puoi aggiornare le entrate.',amount:receivedIncome-E});
  decisions.sort((a,b)=>a.priority-b.priority);
  return { month, period, reviewed, E,S,It,Ia,Ic,Ir,A,C,P,M,U,receivedIncome,pendingIncome,forecast,forecastGap,
    categories:rows, upcoming, realized, scheduled, decisions };
}
export type MonthlyPlanView = ReturnType<typeof selectMonthlyPlan>;
