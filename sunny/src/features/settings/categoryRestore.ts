import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { CategoryDef } from '../../types';
import { restoreCategoryDef } from './softDelete';

/** Re-read server settings so restoring cannot overwrite newer investment
 * values or other category edits from another device. No optimistic success:
 * the provider's existing snapshot listener updates the UI after the write.
 */
export async function restoreArchivedCategory(userId: string, categoryId: string): Promise<void> {
  if (!userId) throw new Error('Accesso richiesto.');
  const ref = doc(db, 'users', userId, 'meta', 'settings');
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    const categories = snapshot.data()?.categories as CategoryDef[] | undefined;
    if (!snapshot.exists() || !Array.isArray(categories) || !categories.some(c => c.id === categoryId)) {
      throw new Error('Categoria non disponibile.');
    }
    const next = restoreCategoryDef(categories, categoryId);
    if (next !== categories) transaction.update(ref, { categories: next });
  });
}
