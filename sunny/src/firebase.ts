import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAB6kObmbX9yrgkq8Hnr8D1CFvE0w4UScY",
  authDomain: "sunny-a2a98.firebaseapp.com",
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
