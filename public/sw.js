const CACHE_VERSION = 'dokkit-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_URLS = [
  '/app/',
  '/app/offline.html',
  '/app/manifest.json',
  '/app/icons/android-chrome-192.png',
  '/app/icons/android-chrome-512.png',
  '/app/icons/notification-badge-96.png',
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

// Only same-origin GET requests are touched at all. Supabase calls (a
// different origin) pass straight through, and /app/api/* routes are always
// skipped — this app's data must never come back stale from cache.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/app/api/') === 0) return;

  // Page navigations: network first, fall back to cached shell, then offline page
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

  // Static assets: cache-first, refresh in the background
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

self.addEventListener('push', function(event) {
  var data = { title: 'Dokkit', body: 'You have a notification.', silent: false };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  var options = {
    body: data.body,
    icon: '/app/icons/android-chrome-192.png',
    badge: '/app/icons/notification-badge-96.png',
    silent: !!data.silent,
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      self.registration.setAppBadge ? self.registration.setAppBadge(1).catch(function() {}) : Promise.resolve(),
    ])
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  if (self.registration.clearAppBadge) {
    self.registration.clearAppBadge().catch(function() {});
  }
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url.indexOf(self.location.origin) === 0 && 'focus' in clientList[i]) {
          return clientList[i].focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/app/');
      }
    })
  );
});
