/**
 * Firestore I/O for Piano mensile V2 — separate from the pure builders
 * (monthlyPlanV2.ts) so logic stays unit-testable without Firebase.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MonthlyPlanV2 } from './monthlyPlanV2';

const planDoc = (uid: string, month: string) => doc(db, 'users', uid, 'monthlyPlans', month);

export async function loadMonthlyPlan(uid: string, month: string): Promise<MonthlyPlanV2 | null> {
  const snap = await getDoc(planDoc(uid, month));
  return snap.exists() ? (snap.data() as MonthlyPlanV2) : null;
}

export async function saveMonthlyPlan(uid: string, plan: MonthlyPlanV2): Promise<void> {
  await setDoc(planDoc(uid, plan.month), plan);
}
