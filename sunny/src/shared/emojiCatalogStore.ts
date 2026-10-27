import { collection, doc, onSnapshot, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { EMOJI_CHOICES } from '../defaults';
import { emojiKey, validateEmojiInput } from './emojiCatalog';

/** Database-injected repository also runs against the local rules emulator. */
export async function insertCatalogEmojiInto(db: Firestore, value: string): Promise<void> {
  const emoji = validateEmojiInput(value, EMOJI_CHOICES);
  const id = Array.from(emojiKey(emoji), point => point.codePointAt(0)!.toString(16)).join('-');
  const ref = doc(db, 'emojiCatalog', id);
  await runTransaction(db, async transaction => {
    const current = await transaction.get(ref);
    if (current.exists()) throw new Error('Questa emoji è già presente nel catalogo.');
    transaction.set(ref, { emoji, createdAt: serverTimestamp() });
  });
}

export function subscribeCatalogFrom(db: Firestore, next: (emojis: string[]) => void, error: (error: Error) => void): () => void {
  return onSnapshot(collection(db, 'emojiCatalog'), snapshot => {
    next(snapshot.docs.map(item => item.data().emoji).filter((emoji): emoji is string => typeof emoji === 'string'));
  }, error);
}

// Resolve the application database only when used: importing the repository in
// emulator tests must never initialize the real application or its auth layer.
export function subscribeCatalog(next: (emojis: string[]) => void, error: (error: Error) => void): () => void {
  let active = true;
  let unsubscribe: (() => void) | undefined;
  void import('../lib/firebase').then(({ db }) => {
    if (active) unsubscribe = subscribeCatalogFrom(db, next, error);
  }).catch(reason => { if (active) error(reason instanceof Error ? reason : new Error(String(reason))); });
  return () => { active = false; unsubscribe?.(); };
}

export async function insertCatalogEmoji(emoji: string): Promise<void> {
  const { db } = await import('../lib/firebase');
  await insertCatalogEmojiInto(db, emoji);
}
