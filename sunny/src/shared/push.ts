import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteField, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db } from '../lib/firebase';

// Public Web Push (VAPID) key — generated in Firebase Console → Project
// settings → Cloud Messaging → "Web Push certificates". It's a public key,
// safe to ship. Provided at build time via VITE_FIREBASE_VAPID_KEY.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

const LOCAL_TOKEN_KEY = 'sunny:fcmToken';

export type EnableResult = { ok: true } | { ok: false; reason: 'unsupported' | 'no-vapid' | 'denied' | 'no-token' | 'error' };

/** True when the browser can actually do FCM web push. */
export async function pushSupported(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return false;
    return await isSupported();
  } catch {
    return false;
  }
}

export function hasLocalToken(): boolean {
  try { return !!localStorage.getItem(LOCAL_TOKEN_KEY); } catch { return false; }
}

const pushRef = (user: User) => doc(db, 'users', user.uid, 'meta', 'push');

// The messaging service worker can't read Vite env, so we pass the (public)
// Firebase config to it as query params and it initializes from those.
function swUrl(): string {
  const cfg: Record<string, string> = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  };
  return `/firebase-messaging-sw.js?${new URLSearchParams(cfg).toString()}`;
}

/** Request permission, register the SW, mint an FCM token and store it. */
export async function enablePush(user: User): Promise<EnableResult> {
  try {
    if (!(await pushSupported())) return { ok: false, reason: 'unsupported' };
    if (!VAPID_KEY) return { ok: false, reason: 'no-vapid' };

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, reason: 'denied' };

    const registration = await navigator.serviceWorker.register(swUrl(), { scope: '/' });
    const messaging = getMessaging();
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: 'no-token' };

    try { localStorage.setItem(LOCAL_TOKEN_KEY, token); } catch { /* ignore */ }
    await setDoc(pushRef(user), {
      tokens: { [token]: true },
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { ok: true };
  } catch (err) {
    console.error('enablePush failed:', err);
    return { ok: false, reason: 'error' };
  }
}

/** Invalidate this device's token and remove it from Firestore. */
export async function disablePush(user: User): Promise<void> {
  let token: string | null = null;
  try { token = localStorage.getItem(LOCAL_TOKEN_KEY); } catch { /* ignore */ }
  try {
    if (await pushSupported()) await deleteToken(getMessaging());
  } catch { /* ignore */ }
  try { localStorage.removeItem(LOCAL_TOKEN_KEY); } catch { /* ignore */ }
  if (token) {
    try {
      await setDoc(pushRef(user), { tokens: { [token]: deleteField() } }, { merge: true });
    } catch { /* ignore */ }
  }
}

const TEST_URL =
  `https://europe-west1-${import.meta.env.VITE_FIREBASE_PROJECT_ID as string}.cloudfunctions.net/sendTestPush`;

/** Ask the server to send a one-off test notification to this user's devices. */
export async function sendTestNotification(user: User): Promise<{ ok: boolean; reason?: string }> {
  try {
    const resp = await fetch(TEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: user.uid }),
    });
    if (resp.status === 404) return { ok: false, reason: 'not-deployed' };
    if (!resp.ok) return { ok: false, reason: `http-${resp.status}` };
    const data = (await resp.json()) as { ok?: boolean; error?: string };
    return data?.ok ? { ok: true } : { ok: false, reason: data?.error ?? 'error' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Show foreground messages (when the app/tab is in focus) as notifications. */
export function listenForeground(): () => void {
  try {
    const messaging = getMessaging();
    return onMessage(messaging, payload => {
      const d = payload.data ?? {};
      if (Notification.permission === 'granted' && d.title) {
        new Notification(d.title, { body: d.body, icon: '/icon.svg' });
      }
    });
  } catch {
    return () => {};
  }
}
