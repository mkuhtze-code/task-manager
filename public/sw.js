// Dokkit PWA Service Worker v7.
// Shell caching + web-push + FCM + ongoing active-task timer notification.

try {
  self.importScripts(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
  );
} catch (e) {
  console.error('[dokkit:fcm] Firebase SDK failed to load', e);
}

var TIMER_TAG = 'dokkit-active-timer';

function safeText(v, fallback) {
  if (v == null) return fallback;
  var s = String(v);
  if (!s || s === 'undefined' || s === 'null') return fallback;
  return s;
}

function fmtMins(mins) {
  var m = Math.max(0, Math.round(Number(mins) || 0));
  if (m < 60) return m + 'm';
  var h = Math.floor(m / 60);
  var r = m % 60;
  return r === 0 ? h + 'h' : h + 'h ' + r + 'm';
}

function elapsedFromPayload(p) {
  var started = p.startedAt ? new Date(p.startedAt).getTime() : Date.now();
  var logged = Number(p.loggedMins) || 0;
  var session = (Date.now() - started) / 60000;
  return logged + Math.max(0, session);
}

function buildTimerNotification(p) {
  var elapsed = elapsedFromPayload(p);
  var estimate = Number(p.estimateMins) || 0;
  var body;
  if (estimate > 0) {
    if (elapsed > estimate) {
      body = fmtMins(elapsed) + ' elapsed · over by ' + fmtMins(elapsed - estimate);
    } else {
      body = fmtMins(elapsed) + ' elapsed · ' + fmtMins(estimate - elapsed) + ' left';
    }
  } else {
    body = fmtMins(elapsed) + ' elapsed';
  }
  return {
    title: safeText(p.text, 'Dokkit timer'),
    options: {
      body: body,
      icon: '/app/favicon-192.png',
      badge: '/app/favicon-192.png',
      tag: TIMER_TAG,
      requireInteraction: true,
      silent: true,
      data: {
        type: 'active_timer',
        taskId: p.taskId || null,
        startedAt: p.startedAt || null,
        estimateMins: estimate,
        loggedMins: Number(p.loggedMins) || 0,
        text: p.text || '',
        destination: '/app',
      },
      actions: [
        { action: 'stop', title: 'Stop' },
        { action: 'open', title: 'Open' },
      ],
    },
  };
}

function showTimerNotification(p) {
  var built = buildTimerNotification(p);
  return self.registration.showNotification(built.title, built.options);
}

function clearTimerNotification() {
  return self.registration.getNotifications({ tag: TIMER_TAG }).then(function (list) {
    list.forEach(function (n) { n.close(); });
  });
}

var fcmReady = false;
function ensureFcm() {
  if (fcmReady) return true;
  if (typeof firebase === 'undefined') return false;
  try {
    self.importScripts('/app/api/firebase-config');
  } catch (e) {
    console.error('[dokkit:fcm] Config load failed', e);
    return false;
  }
  var cfg = self.DOKKIT_FIREBASE_CONFIG;
  if (!cfg) return false;
  try {
    firebase.initializeApp(cfg);
    firebase.messaging().onBackgroundMessage(function (payload) {
      var d = (payload && payload.data) || null;
      if (!d || d.dokkit_source !== 'fcm') return;

      if (d.type === 'active_timer') {
        showTimerNotification({
          taskId: d.entityId || d.taskId,
          text: safeText(d.title || d.text, 'Dokkit timer'),
          startedAt: d.startedAt,
          estimateMins: Number(d.estimateMins) || 0,
          loggedMins: Number(d.loggedMins) || 0,
        }).catch(function () {});
        return;
      }

      if (d.type === 'active_timer_clear') {
        clearTimerNotification().catch(function () {});
        return;
      }

      var title = safeText(d.title, 'Dokkit');
      var body = safeText(d.body, 'You have a notification.');
      var options = {
        body: body,
        icon: '/app/favicon-192.png',
        badge: '/app/favicon-192.png',
        silent: d.silent === true || d.silent === '1' || d.silent === 'true',
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
    fcmReady = true;
    return true;
  } catch (e) {
    console.error('[dokkit:fcm] Initialization failed', e);
    return false;
  }
}

const CACHE_VERSION = 'dokkit-v7';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL_URLS = [
  '/app',
  '/app/offline.html',
  '/app/manifest.json',
  '/app/android-chrome-192.png',
  '/app/android-chrome-512.png',
  '/app/favicon-192.png',
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE)
      .then(function (cache) {
        return Promise.all(
          APP_SHELL_URLS.map(function (url) {
            return cache.add(url).catch(function (err) {
              console.warn('[dokkit:sw] cache skip', url, err);
            });
          })
        );
      })
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
    }).then(function () {
      try { ensureFcm(); } catch (e) {}
      return self.clients.claim();
    })
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

self.addEventListener('message', function (event) {
  var data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'TIMER_SHOW') {
    var p = showTimerNotification(data);
    if (event.waitUntil) event.waitUntil(p);
    else p.catch(function () {});
    return;
  }
  if (data.type === 'TIMER_CLEAR') {
    var c = clearTimerNotification();
    if (event.waitUntil) event.waitUntil(c);
    else c.catch(function () {});
  }
});

self.addEventListener('push', function (event) {
  try { ensureFcm(); } catch (e) {}
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

  if (data && data.dokkit_source === 'fcm') {
    var fcmTitle = safeText(data.title, 'Dokkit');
    var fcmBody = safeText(data.body, 'You have a notification.');
    if (data.type === 'active_timer') {
      event.waitUntil(
        showTimerNotification({
          taskId: data.taskId || data.entityId,
          text: fcmTitle,
          startedAt: data.startedAt,
          estimateMins: data.estimateMins,
          loggedMins: data.loggedMins,
        })
      );
      return;
    }
    event.waitUntil(
      self.registration.showNotification(fcmTitle, {
        body: fcmBody,
        icon: '/app/favicon-192.png',
        badge: '/app/favicon-192.png',
        silent: data.silent === true || data.silent === '1' || data.silent === 'true',
        data: {
          destination: data.destination || null,
          type: data.type || null,
          entityId: data.entityId || null,
        },
      })
    );
    return;
  }

  if (data && data.type === 'active_timer') {
    event.waitUntil(
      showTimerNotification({
        taskId: data.taskId || data.entityId,
        text: data.title || data.text,
        startedAt: data.startedAt,
        estimateMins: data.estimateMins,
        loggedMins: data.loggedMins,
      })
    );
    return;
  }

  var options = {
    body: safeText(data.body, 'You have a notification.'),
    icon: '/app/favicon-192.png',
    badge: '/app/favicon-192.png',
    silent: !!data.silent,
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(safeText(data.title, 'Dokkit'), options),
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
  var n = event.notification;
  var data = n.data || {};
  n.close();

  if (self.registration.clearAppBadge) {
    self.registration.clearAppBadge().catch(function () {});
  }

  var url;
  if (data.type === 'active_timer' || n.tag === TIMER_TAG) {
    if (event.action === 'stop') {
      var id = data.taskId ? encodeURIComponent(data.taskId) : '';
      url = self.location.origin + '/app?stopActive=1' + (id ? '&taskId=' + id : '');
    } else {
      url = self.location.origin + '/app';
    }
  } else {
    url = resolveClickUrl(data.destination);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(function (clientList) {
      var best = null;
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin + '/app') !== 0) continue;
        if (!best) best = client;
      }
      if (best && 'focus' in best) {
        return best.focus().then(function () {
          if (event.action === 'stop' && best.postMessage) {
            best.postMessage({ type: 'STOP_ACTIVE_TIMER', taskId: data.taskId });
          }
        });
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
