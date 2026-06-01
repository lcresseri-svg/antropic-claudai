import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  // Hosting domain as authDomain → OAuth handler runs same-origin as the app,
  // avoiding the iOS/Safari "missing initial state" error from storage
  // partitioning. Requires web.app/__/auth/handler authorized in Google OAuth.
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Persistent IndexedDB cache: serves data instantly from local cache while
// the network refresh runs in the background.
// Single-tab manager avoids cross-tab locking issues that can prevent the
// listener from establishing on the first tab open.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
