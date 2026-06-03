/* Firebase Cloud Messaging service worker.
 *
 * The page registers this SW with the (public) Firebase config passed as query
 * params, so it can initialize without access to the build-time env.
 *
 * We send messages with a `webpush.notification` payload; simply initializing
 * messaging here lets the FCM SDK auto-display them in the background. This is
 * the most reliable path across platforms, including iOS PWAs (where a custom
 * data-only handler + the Notification constructor are unreliable). Clicks are
 * handled by FCM via `webpush.fcmOptions.link`.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);
firebase.initializeApp({
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
});

// Initializing messaging registers the default background handler that
// auto-displays incoming `webpush.notification` messages.
firebase.messaging();
