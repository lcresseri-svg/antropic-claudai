import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAB6kObmbX9yrgkq8Hnr8D1CFvE0w4UScY",
  // Hosting domain as authDomain → OAuth handler runs same-origin as the app,
  // avoiding the iOS/Safari "missing initial state" error from storage
  // partitioning. Requires web.app/__/auth/handler authorized in Google OAuth.
  authDomain: "sunny-a2a98.web.app",
  projectId: "sunny-a2a98",
  storageBucket: "sunny-a2a98.firebasestorage.app",
  messagingSenderId: "1059291331006",
  appId: "1:1059291331006:web:f62698cd6f0c6da1caa1ef",
};

const app = initializeApp(firebaseConfig);

// Auto-detect long-polling: when the WebChannel streaming transport is blocked
// (some mobile networks, proxies, Safari/ITP), the SDK otherwise hangs ~30s
// before falling back. Auto-detect switches transports immediately.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
