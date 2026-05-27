import { useState, useEffect } from 'react';
import {
  User, onAuthStateChanged, signInWithPopup,
  getRedirectResult, signOut,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

function friendlyError(code: string): string {
  if (code.includes('popup-blocked') || code.includes('operation-not-supported') || code.includes('popup-closed-by-user')) {
    return 'I popup sono bloccati. In Safari vai su Impostazioni → Safari → attiva "Blocco popup" OFF, poi riprova.';
  }
  if (code.includes('cancelled-popup')) return '';
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
    getRedirectResult(auth).catch(() => {});
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const signIn = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = e instanceof Error ? (e as { code?: string }).code ?? e.message : '';
      const msg = friendlyError(code);
      if (msg) setError(msg);
    }
  };

  const logOut = () => signOut(auth);

  return { user, loading, error, signIn, logOut };
}
