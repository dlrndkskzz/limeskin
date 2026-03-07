// 라임스킨 Service Worker
var CACHE_NAME = 'limeskin-v1';

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});

// Push notification handler
self.addEventListener('push', function(event) {
  var data = {};
  if (event.data) {
    try { data = event.data.json(); } catch(e) { data = { title: '라임스킨', body: event.data.text() }; }
  }
  var title = data.title || '🌿 라임스킨';
  var options = {
    body: data.body || '알림이 도착했습니다',
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: [200, 100, 200],
    tag: 'limeskin-notification',
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(url) >= 0 && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// Background sync for daily 9pm reminder
self.addEventListener('sync', function(event) {
  if (event.tag === 'daily-reminder') {
    event.waitUntil(sendDailyReminder());
  }
});

function sendDailyReminder() {
  return self.registration.showNotification('🌿 라임스킨 저녁 알림', {
    body: '오늘 예약을 확인하고 마감을 진행해주세요!',
    icon: '/icon.png',
    vibrate: [200, 100, 200],
    tag: 'daily-reminder'
  });
}
