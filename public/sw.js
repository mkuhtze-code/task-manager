// Dokkit PWA Service Worker.
//
// This worker serves the web app shell (caching), the legacy web-push
// delivery path (plain VAPID subscriptions), and — since FCM background
// messages are only ever delivered to the single active worker for the
// /app/ scope — the FCM web push path. The FCM parts are fully guarded:
// if the CDN SDK or the Firebase configuration is unavailable the worker
// degrades to the pre-existing caching + legacy-push behaviour instead of
// failing to install.

// ── Firebase Messaging SDK (loaded from the gstatic CDN) ──────────
// Matches the client-side `firebase@10.12.2` package. Wrapped so a CDN
// outage never prevents the PWA worker from installing.
try {
  self.importScripts(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
  );
} catch (e) {
  console.error('[dokkit:fcm] Firebase SDK failed to load', e);
}

// ── FCM background-message handling ───────────────────────────────
// The configuration arrives as a JS file emitted by
// /app/api/firebase-config (importScripts is synchronous, so the config
// is available before any message can arrive; a null config simply skips
// FCM entirely). Marked as 'fcm' via dokkit_source and rendered here so
// the legacy push handler can ignore these messages and we never raise a
// duplicate notification.
(function initFcm() {
  if (typeof firebase === 'undefined') return;
  try {
    self.importScripts('/app/api/firebase-config');
  } catch (e) {
    console.error('[dokkit:fcm] Config load failed', e);
    return;
  }
  var cfg = self.DOKKIT_FIREBASE_CONFIG;
  if (!cfg) return;

  try {
    firebase.initializeApp(cfg);
    firebase.messaging().onBackgroundMessage(function (payload) {
      // Only render genuine Dokkit FCM messages (stamped by
      // lib/fcm/send.ts). The FCM SDK dispatches every non-notification
      // push to this callback — including the legacy web-push payloads,
      // which must keep flowing to the plain push handler below instead of
      // producing a duplicate default notification here.
      var d = (payload && payload.data) || null;
      if (!d || d.dokkit_source !== 'fcm') return;
      var title = d.title || 'Dokkit';
      var options = {
        body: d.body || 'You have a notification.',
        icon: '/app/android-chrome-192.png',
        badge: '/app/android-chrome-192.png',
        silent: !!d.silent,
        data: {
          destination: d.destination || null,
          type: d.type || null,
          entityId: d.entityId || null,
        },
      };
      self.registration.showNotification(title, options).catch(function () {});
      if (self.registration.setAppBadge) {
        self.registration.setAppBadge(1).catch(function () {});
      }
    });
  } catch (e) {
    console.error('[dokkit:fcm] Initialization failed', e);
  }
})();

const CACHE_VERSION = 'dokkit-v2';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_URLS = [
  '/app',
  '/app/offline.html',
  '/app/manifest.json',
  '/app/android-chrome-192.png',
  '/app/android-chrome-512.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(function (cache) { return cache.addAll(APP_SHELL_URLS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key.indexOf('dokkit-') === 0 && key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE;
          })
          .map(function (key) { return caches.delete(key); })
      );
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return;
  if (url.pathname.indexOf('/app/') !== 0 && url.pathname !== '/app') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(function (res) {
          var copy = res.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(req, copy); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match('/app/offline.html');
          });
        })
    );
    return;
  }

  if (['image', 'style', 'script', 'font'].indexOf(req.destination) !== -1) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        var fetchPromise = fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(RUNTIME_CACHE).then(function (cache) { cache.put(req, copy); });
          return res;
        }).catch(function () { return cached; });
        return cached || fetchPromise;
      })
    );
  }
});

// Legacy web-push path (plain VAPID subscriptions registered via
// /api/subscribe). FCM messages carry dokkit_source='fcm' and are
// rendered by the onBackgroundMessage handler above, so those are skipped
// here to avoid duplicate notifications.
self.addEventListener('push', function (event) {
  var data = { title: 'Dokkit', body: 'You have a notification.', silent: false };
  var parsed = null;
  if (event.data) {
    try {
      parsed = event.data.json();
    } catch (e) {
      parsed = null;
    }
    if (!parsed) {
      data.body = event.data.text();
    } else {
      data = parsed;
    }
  }
  if (data && data.dokkit_source === 'fcm') return;

  var options = {
    body: data.body,
    icon: '/app/android-chrome-192.png',
    badge: '/app/android-chrome-192.png',
    silent: !!data.silent,
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      self.registration.setAppBadge ? self.registration.setAppBadge(1).catch(function () {}) : Promise.resolve(),
    ])
  );
});

function resolveClickUrl(destination) {
  var appUrl = self.location.origin + '/app';
  if (!destination) return appUrl;
  var d = String(destination);
  if (d.indexOf('/app') === 0) return self.location.origin + d;
  if (d.indexOf('/') === 0) return self.location.origin + '/app' + d;
  return self.location.origin + '/app/' + d;
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  if (self.registration.clearAppBadge) {
    self.registration.clearAppBadge().catch(function () {});
  }
  var destination = event.notification.data && event.notification.data.destination;
  var url = resolveClickUrl(destination);
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function (clientList) {
      var best = null;
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin + '/app') !== 0) continue;
        if (!best) best = client;
        if (url !== self.location.origin + '/app' && client.url.indexOf(url) === 0) {
          best = client;
          break;
        }
      }
      if (best && 'focus' in best) return best.focus();
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
