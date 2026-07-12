import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
} from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

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

// App Check (reCAPTCHA v3) — NON-BLOCKING rollout: initialized only when a
// site key is configured, so environments without one (local dev included)
// keep working untouched. Server enforcement is a separate, later switch
// (functions: APPCHECK_ENFORCE). For local testing set
// VITE_APPCHECK_DEBUG_TOKEN (see .env.example).
const appCheckSiteKey = import.meta.env.VITE_APPCHECK_SITE_KEY as string | undefined;
if (appCheckSiteKey) {
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN as string | undefined;
  if (debugToken) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  // Dynamic import: the App Check bundle loads only where the key exists.
  import('firebase/app-check')
    .then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
      initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
    })
    .catch(() => { /* App Check unavailable: never block the app */ });
}

// Persistent IndexedDB cache: serves data instantly from local cache while
// the network refresh runs in the background.
// Single-tab manager avoids cross-tab locking issues that can prevent the
// listener from establishing on the first tab open.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
export const auth = getAuth(app);
export const functions = getFunctions(app, 'europe-west1');

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
