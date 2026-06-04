import { useState, useCallback, useRef } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { APP_VERSION } from '../../appInfo';
import { FeedbackType } from './feedbackTypes';

/**
 * Submits user feedback to the top-level `feedback` collection. Each document
 * carries `userId` so the admin can read them (and a Cloud Function notifies the
 * admin on create). Failures never throw to the UI — they surface as `error`.
 */
export function useFeedback(user: User | null) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSentAt = useRef(0); // simple local rate-limit (no double-tap)

  const submit = useCallback(async (type: FeedbackType, text: string) => {
    if (!user || submitting) return;
    if (Date.now() - lastSentAt.current < 2000) return;
    setSubmitting(true);
    setError(null);
    try {
      await addDoc(collection(db, 'feedback'), {
        userId: user.uid,
        userEmail: user.email ?? null,
        type,
        text: text.trim() || null,
        appVersion: APP_VERSION,
        createdAt: Date.now(),
        createdAtServer: serverTimestamp(),
      });
      lastSentAt.current = Date.now();
      setDone(true);
    } catch {
      setError('Invio non riuscito. Controlla la connessione e riprova.');
    } finally {
      setSubmitting(false);
    }
  }, [user, submitting]);

  const reset = useCallback(() => { setDone(false); setError(null); }, []);

  return { submit, submitting, done, error, reset };
}
