/* Firebase Cloud Messaging service worker.
 *
 * The page registers this SW with the (public) Firebase config passed as query
 * params, so it can initialize without access to the build-time env. We send
 * data-only messages from the server and build the notification here, to avoid
 * the double-display you get when a payload carries a top-level `notification`.
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

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'Sunny', {
    body: d.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: d.tag || 'sunny',
    data: { link: d.link || '/' },
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) { client.navigate(link); return client.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
    }),
  );
});
