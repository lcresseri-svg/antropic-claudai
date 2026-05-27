import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAB6kObmbX9yrgkq8Hnr8D1CFvE0w4UScY",
  // Use the hosting domain as authDomain so the OAuth handler runs same-origin
  // as the app. This avoids the iOS/Safari "missing initial state" error caused
  // by storage partitioning when redirecting to the *.firebaseapp.com domain.
  authDomain: "sunny-a2a98.web.app",
  projectId: "sunny-a2a98",
  storageBucket: "sunny-a2a98.firebasestorage.app",
  messagingSenderId: "1059291331006",
  appId: "1:1059291331006:web:f62698cd6f0c6da1caa1ef",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
