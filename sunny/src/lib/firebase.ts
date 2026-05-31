import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
} from 'firebase/firestore';
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
