import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection, doc, onSnapshot, query, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ApplePayPendingPayment, Transaction } from '../../types';

type TxDraft = Omit<Transaction, 'id'>;

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)]),
    ) as T;
  }
  return value;
}

export function useApplePayPending(user: User | null) {
  const [payments, setPayments] = useState<ApplePayPendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPayments([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    // Equality-only query: no composite index is required. Sorting stays local.
    const q = query(
      collection(db, 'users', user.uid, 'applePayPending'),
      where('status', '==', 'pending'),
    );
    return onSnapshot(q,
      snap => {
        setPayments(snap.docs
          .map(d => ({ id: d.id, ...(d.data() as Omit<ApplePayPendingPayment, 'id'>) }))
          .sort((a, b) => b.receivedAt - a.receivedAt));
        setLoading(false);
        setError(null);
      },
      err => {
        console.error('Apple Pay inbox listen failed:', err.code, err.message);
        setLoading(false);
        setError('Pagamenti Apple Pay non disponibili. Riprova tra poco.');
      });
  }, [user?.uid]);

  /** Create every movement produced by TransactionModal and close the inbox
   *  item in one batch. Shared-expense settlement transfers are included. */
  const confirmPayment = useCallback(async (
    payment: ApplePayPendingPayment,
    drafts: TxDraft[],
  ): Promise<string[]> => {
    if (!user) throw new Error('not-authenticated');
    if (drafts.length === 0 || drafts.some(t => t.type === 'investment')) {
      throw new Error('invalid-apple-pay-confirmation');
    }
    const batch = writeBatch(db);
    const createdAt = Date.now();
    const ids: string[] = [];
    for (const draft of drafts) {
      const ref = doc(collection(db, 'users', user.uid, 'transactions'));
      ids.push(ref.id);
      const payload = stripUndefined({
        ...draft,
        createdAt,
        source: 'apple_pay' as const,
        sourceId: payment.id,
      });
      delete (payload as Partial<Transaction>).projected;
      delete (payload as Partial<Transaction>).refundedTotal;
      batch.set(ref, payload);
    }
    batch.update(doc(db, 'users', user.uid, 'applePayPending', payment.id), {
      status: 'confirmed',
      confirmedAt: createdAt,
      confirmedTransactionIds: ids,
    });
    await batch.commit();
    return ids;
  }, [user]);

  const ignorePayment = useCallback(async (id: string): Promise<void> => {
    if (!user) throw new Error('not-authenticated');
    await updateDoc(doc(db, 'users', user.uid, 'applePayPending', id), {
      status: 'ignored',
      ignoredAt: Date.now(),
    });
  }, [user]);

  return { payments, loading, error, confirmPayment, ignorePayment };
}
