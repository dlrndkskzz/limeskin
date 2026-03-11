// sw.js - Service Worker: 오전 8시 오늘 예약 푸시 알림
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// 푸시 수신
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || '라임스킨', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-96.png',
      data: data.url || '/'
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data || '/'));
});

// 매일 오전 8시 로컬 예약 알림 (클라이언트가 메시지로 스케줄 전달)
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_NOTIFICATION') {
    const { title, body, delay } = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, { body, icon: '/icon-192.png' });
    }, delay);
  }
});
