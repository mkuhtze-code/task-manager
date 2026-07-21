self.addEventListener('push', function(event) {
  var data = { title: 'Docket', body: 'You have a notification.', silent: false };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  var options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
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
        return clients.openWindow('/');
      }
    })
  );
});
