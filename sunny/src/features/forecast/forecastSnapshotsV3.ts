/**
 * Persists backtest snapshots to Firestore as an immutable audit trail.
 *
 * Path:  users/{uid}/forecastSnapshots/{monthKey}_{day}
 * Write-once: existing documents are never overwritten (Firestore rule
 * allows `create` only, and the client guards with getDoc before writing).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { BacktestSnapshotV3 } from './forecastTypesV3';

/**
 * Saves all backtest snapshots that do not yet exist in Firestore.
 * Existing snapshots are skipped silently (write-once semantics).
 *
 * @returns Number of newly written documents.
 */
export async function saveBacktestSnapshotsV3(
  uid: string,
  snapshots: BacktestSnapshotV3[],
): Promise<number> {
  if (!uid || snapshots.length === 0) return 0;

  const refs = snapshots.map(s => {
    const id = `${s.monthKey}_${String(s.snapshotDay).padStart(2, '0')}`;
    return doc(db, 'users', uid, 'forecastSnapshots', id);
  });

  // Parallel existence check — skip all docs that are already saved.
  const existingDocs = await Promise.all(refs.map(r => getDoc(r)));

  const toWrite: Array<{ idx: number; snapshot: BacktestSnapshotV3 }> = [];
  for (let i = 0; i < snapshots.length; i++) {
    if (!existingDocs[i].exists()) {
      toWrite.push({ idx: i, snapshot: snapshots[i] });
    }
  }

  if (toWrite.length === 0) return 0;

  const savedAt = Date.now();
  await Promise.all(
    toWrite.map(({ idx, snapshot }) =>
      setDoc(refs[idx], { ...snapshot, savedAt }),
    ),
  );

  return toWrite.length;
}
