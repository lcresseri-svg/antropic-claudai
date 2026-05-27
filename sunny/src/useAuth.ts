import { useState, useEffect } from 'react';
import {
  User, onAuthStateChanged, signInWithPopup, signInWithRedirect,
  getRedirectResult, signOut, browserPopupRedirectResolver,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

function friendlyError(code: string): string {
  if (code.includes('popup-blocked') || code.includes('cancelled-popup')) return '';
  if (code.includes('popup-closed')) return '';
  if (code.includes('network')) return 'Connessione assente. Riprova.';
  if (code.includes('operation-not-allowed')) return 'Accesso Google non attivo nel progetto Firebase.';
  if (code.includes('unauthorized-domain')) return 'Dominio non autorizzato in Firebase Auth.';
  return 'Accesso non riuscito. Riprova.';
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Resolve any pending redirect sign-in (Safari fallback path).
    getRedirectResult(auth).catch(() => {});
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const signIn = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    } catch (e) {
      const code = e instanceof Error ? (e as { code?: string }).code ?? e.message : '';
      // On mobile Safari popups are often blocked — fall back to redirect.
      if (code.includes('popup-blocked') || code.includes('operation-not-supported')) {
        try {
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch { /* ignore */ }
      }
      const msg = friendlyError(code);
      if (msg) setError(msg);
    }
  };

  const logOut = () => signOut(auth);

  return { user, loading, error, signIn, logOut };
}
