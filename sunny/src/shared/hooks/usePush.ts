import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import {
  pushSupported, enablePush, disablePush, hasLocalToken, listenForeground,
  sendTestNotification, getDiagnostics, EnableResult, PushDiagnostics,
} from '../push';

export interface ReminderPrefs {
  logExpenses: boolean;       // midday + evening "log your expenses" nudges
  recurring: boolean;         // a recurring entry was auto-recorded today
  monthly: boolean;           // start-of-month summary of the previous month
  upcomingPayments: boolean;  // pagamenti programmati/ricorrenti il giorno prima
  inactivityReminder: boolean; // nessun movimento da 5+ giorni
}

const DEFAULT_PREFS: ReminderPrefs = { logExpenses: true, recurring: true, monthly: true, upcomingPayments: true, inactivityReminder: true };

export function usePush(user: User | null) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [reminders, setReminders] = useState<ReminderPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { pushSupported().then(setSupported); }, []);

  useEffect(() => {
    setEnabled(
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      hasLocalToken(),
    );
  // uid, not user object — avoids spurious resets on token refresh.
  }, [user?.uid]);

  // Reminder preferences live in Firestore so they apply server-side.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid, 'meta', 'push'), snap => {
      const d = snap.data();
      if (d?.reminders) setReminders({ ...DEFAULT_PREFS, ...(d.reminders as Partial<ReminderPrefs>) });
    });
  // uid, not user object — avoids listener recreation on every token refresh.
  }, [user?.uid]);

  // Foreground notifications while the app is open.
  useEffect(() => {
    if (!enabled || !supported) return;
    return listenForeground();
  }, [enabled, supported]);

  const enable = useCallback(async (): Promise<EnableResult> => {
    if (!user) return { ok: false, reason: 'error' };
    setBusy(true); setError(null);
    const res = await enablePush(user);
    setBusy(false);
    if (res.ok) setEnabled(true);
    else setError(res.reason);
    return res;
  }, [user]);

  const disable = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    await disablePush(user);
    setEnabled(false);
    setBusy(false);
  }, [user]);

  const setReminder = useCallback((key: keyof ReminderPrefs, val: boolean) => {
    if (!user) return;
    const next = { ...reminders, [key]: val };
    setReminders(next);
    setDoc(doc(db, 'users', user.uid, 'meta', 'push'), { reminders: next }, { merge: true });
  }, [user, reminders]);

  const test = useCallback(async (): Promise<{ ok: boolean; reason?: string; tokens?: number }> => {
    if (!user) return { ok: false, reason: 'error' };
    return sendTestNotification(user);
  }, [user]);

  const diagnose = useCallback((): Promise<PushDiagnostics> => getDiagnostics(), []);

  return { supported, enabled, reminders, busy, error, enable, disable, setReminder, test, diagnose };
}
