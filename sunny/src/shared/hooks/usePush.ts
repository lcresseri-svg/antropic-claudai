import { useCallback, useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../../lib/firebase';
import {
  pushSupported, enablePush, disablePush, hasLocalToken, listenForeground,
  sendTestNotification, EnableResult,
} from '../push';

export interface ReminderPrefs {
  logExpenses: boolean;  // midday + evening "log your expenses" nudges
  recurring: boolean;    // a recurring entry was auto-recorded today
  monthly: boolean;      // start-of-month summary of the previous month
}

const DEFAULT_PREFS: ReminderPrefs = { logExpenses: true, recurring: true, monthly: true };

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
  }, [user]);

  // Reminder preferences live in Firestore so they apply server-side.
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid, 'meta', 'push'), snap => {
      const d = snap.data();
      if (d?.reminders) setReminders({ ...DEFAULT_PREFS, ...(d.reminders as Partial<ReminderPrefs>) });
    });
  }, [user]);

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

  const test = useCallback(async (): Promise<{ ok: boolean; reason?: string }> => {
    if (!user) return { ok: false, reason: 'error' };
    return sendTestNotification(user);
  }, [user]);

  return { supported, enabled, reminders, busy, error, enable, disable, setReminder, test };
}
