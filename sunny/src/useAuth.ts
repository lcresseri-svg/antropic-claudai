import { useState, useEffect } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const signIn = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Errore di accesso';
      // Ignore user-cancelled popup
      if (!msg.includes('popup-closed')) setError(msg);
    }
  };

  const logOut = () => signOut(auth);

  return { user, loading, error, signIn, logOut };
}
