import { useState, useEffect } from 'react';
import {
  User, onAuthStateChanged, signInWithPopup, signOut,
  deleteUser, reauthenticateWithPopup,
} from 'firebase/auth';
import {
  collection, getDocs, doc, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { auth, googleProvider, db } from '../../lib/firebase';

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

/** Delete every Firestore document belonging to a user while still authenticated. */
async function purgeUserData(uid: string) {
  const txCol = collection(db, 'users', uid, 'transactions');
  const snap = await getDocs(txCol);
  const ids = snap.docs.map(d => d.id);
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db);
    ids.slice(i, i + 450).forEach(id => batch.delete(doc(db, 'users', uid, 'transactions', id)));
    await batch.commit();
  }
  // Settings doc + the user root doc (root deletion also triggers the
  // onUserDeleted Cloud Function as a server-side safety net).
  await deleteDoc(doc(db, 'users', uid, 'meta', 'settings')).catch(() => {});
  await deleteDoc(doc(db, 'users', uid)).catch(() => {});
}

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

  /**
   * Permanently delete the account: purges all Firestore data, then removes
   * the Firebase Auth user. If Firebase requires a fresh login, re-authenticate
   * via popup and retry. Throws on unexpected failure so the caller can surface it.
   */
  const deleteAccount = async () => {
    const u = auth.currentUser;
    if (!u) return;
    await purgeUserData(u.uid);
    try {
      await deleteUser(u);
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/requires-recent-login') {
        await reauthenticateWithPopup(u, googleProvider);
        await deleteUser(u);
      } else {
        throw e;
      }
    }
  };

  return { user, loading, error, signIn, logOut, deleteAccount };
}
