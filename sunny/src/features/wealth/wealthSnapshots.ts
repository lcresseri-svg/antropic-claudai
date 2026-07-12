/**
 * Firestore I/O for wealth snapshots — kept separate from the pure builder
 * (wealthSnapshotCore.ts) so the logic stays unit-testable without Firebase.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { WealthSnapshot, BackfillPlanEntry } from './wealthSnapshotCore';

export * from './wealthSnapshotCore';

/** Idempotent write of one snapshot (same day → same doc, overwritten). */
export async function saveWealthSnapshot(uid: string, snapshot: WealthSnapshot): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'wealthSnapshots', snapshot.dateKey), snapshot);
}

/** True when a snapshot already exists for the given day. */
export async function hasWealthSnapshot(uid: string, dateKey: string): Promise<boolean> {
  return (await getDoc(doc(db, 'users', uid, 'wealthSnapshots', dateKey))).exists();
}

/** APPLY a reviewed backfill plan. Sequential writes, skips 'missing' entries. */
export async function applyWealthBackfill(uid: string, plan: BackfillPlanEntry[]): Promise<number> {
  let written = 0;
  for (const entry of plan) {
    if (!entry.snapshot) continue;
    await saveWealthSnapshot(uid, entry.snapshot);
    written++;
  }
  return written;
}
