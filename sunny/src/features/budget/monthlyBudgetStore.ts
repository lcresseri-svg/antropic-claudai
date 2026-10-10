import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { BudgetState } from '../../types';
import { MonthlyBudget, initMonthlyBudget, monthKeyOf, prevMonthKey, monthlyToBudgetState, applyMonthlyBudgetEdit } from './monthlyBudget';
export const revisionOf = (plan?: MonthlyBudget | null): number | null => plan ? plan.revision ?? plan.updatedAt ?? 0 : null;
export class PlanConflictError extends Error {
  constructor() { super('Il piano è stato modificato altrove. Il tuo draft è conservato: ricarica il piano prima di riprovare.'); }
}
const validMoney = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e9;
export function validateMonthlyBudget(plan: MonthlyBudget) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(plan.month) || !validMoney(plan.savingsTarget)) throw new Error('Importi o mese non validi.');
  for (const map of [plan.categoryBudgets, plan.incomeBudgets, plan.investmentBudgets, plan.planningV3?.cashInvestmentBudgets ?? {}]) {
    if (!map || Array.isArray(map) || typeof map !== 'object' || Object.values(map).some(v=>!validMoney(v))) throw new Error('Importi non validi.');
  }
  if (plan.planningV3 && (plan.planningV3.schemaVersion !== 1 || !Number.isFinite(plan.planningV3.inputsReviewedAt) ||
    plan.planningV3.inputsReviewedAt < 0 || Object.keys(plan.planningV3.cashInvestmentBudgets).length > 50)) throw new Error('Revisione del piano non valida (massimo 50 obiettivi).');
}
const ref = (db: Firestore, uid: string, month: string) => doc(db,'users',uid,'budgetHistory',month);
const mirror = (db: Firestore, uid: string) => doc(db,'users',uid,'meta','budget');

/** All reads precede writes; preserve unknown fields in both documents. */
export async function saveMonthlyBudget(db: Firestore, uid: string, month: string, draft: MonthlyBudget,
  expectedRevision: number | null, now = new Date()): Promise<MonthlyBudget> {
  validateMonthlyBudget(draft);
  if (draft.month !== month) throw new Error('Il mese del draft non corrisponde.');
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref(db,uid,month));
    const previous = snap.exists() ? snap.data() as MonthlyBudget : null;
    if (revisionOf(previous) !== expectedRevision) throw new PlanConflictError();
    const isCurrent = month === monthKeyOf(now);
    const legacy = isCurrent ? await tx.get(mirror(db,uid)) : null;
    // Only fields owned by this editor may replace server data. An old draft
    // can carry foreign fields through its base; never replay those blindly.
    const next: MonthlyBudget = { ...previous, ...monthlyToBudgetState(draft), month,
      status:draft.status,source:draft.source,revision:(previous?.revision ?? 0)+1,updatedAt:now.getTime(),
      createdAt:previous?.createdAt??draft.createdAt??now.getTime(),
      ...(draft.planningV3?{planningV3:draft.planningV3}:{}),
      ...(draft.copiedFromMonth?{copiedFromMonth:draft.copiedFromMonth}:{}),
      ...(draft.confirmedAt!==undefined?{confirmedAt:draft.confirmedAt}:{}) };
    tx.set(ref(db,uid,month),next);
    if (isCurrent) tx.set(mirror(db,uid),{...(legacy?.data() ?? {}),...monthlyToBudgetState(next),
      ...(next.planningV3 ? {planningV3:next.planningV3} : {})});
    return next;
  });
}
/** Creation is safe when multiple hook instances/tabs race. */
export async function ensureMonthlyBudget(db: Firestore, uid: string, now = new Date()) {
  const month = monthKeyOf(now);
  return runTransaction(db, async tx => {
    const current = await tx.get(ref(db,uid,month));
    if (current.exists()) return;
    const previous = await tx.get(ref(db,uid,prevMonthKey(month)));
    const legacy = await tx.get(mirror(db,uid));
    const next = { ...initMonthlyBudget({month,now:now.getTime(),
      previous:previous.exists()?previous.data() as MonthlyBudget:null,
      legacy:legacy.exists()?legacy.data() as BudgetState:null}),revision:1 };
    tx.set(ref(db,uid,month),next);
    tx.set(mirror(db,uid),{...(legacy.data() ?? {}),...monthlyToBudgetState(next),
      ...(next.planningV3 ? {planningV3:next.planningV3} : {})});
  });
}
/** Rebase field-level UI2 edits on server data, invalidate review atomically. */
export async function editLegacyBudget(db: Firestore, uid: string, month: string,
  edit: (budget: BudgetState) => BudgetState, now = new Date(), action: 'edit' | 'confirm' | 'copy' = 'edit') {
  return runTransaction(db, async tx => {
    const snap = await tx.get(ref(db,uid,month));
    const legacy = month === monthKeyOf(now) ? await tx.get(mirror(db,uid)) : null;
    const previous = action==='copy' ? await tx.get(ref(db,uid,prevMonthKey(month))) : null;
    const base = snap.exists() ? snap.data() as MonthlyBudget : initMonthlyBudget({month,legacy:legacy?.data() as BudgetState | undefined});
    let next = action==='copy' && previous?.exists()
      ? {...base,...initMonthlyBudget({month,previous:previous.data() as MonthlyBudget}),status:'draft' as const}
      : applyMonthlyBudgetEdit(base,edit(monthlyToBudgetState(base)),now.getTime());
    if (action==='confirm') next={...next,status:'confirmed',confirmedAt:now.getTime()};
    if (action==='copy' && next.planningV3) next={...next,planningV3:{...next.planningV3,inputsReviewedAt:0}};
    next={...next,revision:(base.revision ?? 0)+1,updatedAt:now.getTime()};
    validateMonthlyBudget(next);
    tx.set(ref(db,uid,month),next);
    if (legacy) tx.set(mirror(db,uid),{...(legacy.data() ?? {}),...monthlyToBudgetState(next),
      ...(next.planningV3 ? {planningV3:next.planningV3} : {})});
    return next;
  });
}
