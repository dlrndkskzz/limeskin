/**
 * sw.js — Service Worker
 * 매일 오전 8시 오늘 예약 요약 푸시 알림
 */

const CACHE_NAME = 'limeskin-v1';

// ── 설치 ───────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ── 푸시 수신 ──────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title   = data.title   || '라임스킨 🌿';
  const body    = data.body    || '오늘 예약을 확인해주세요';
  const options = {
    body,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    tag:   'limeskin-daily',
    renotify: true,
    data: { url: '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── 알림 클릭 → 앱 열기 ────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// ── 매일 오전 8시 알림 스케줄 (앱에서 setInterval로 호출) ─────
self.addEventListener('message', event => {
  if (event.data?.type === 'SCHEDULE_DAILY') {
    const { title, body } = event.data;
    self.registration.showNotification(title || '라임스킨 🌿', {
      body:     body || '오늘 예약을 확인해주세요',
      icon:     '/icon-192.png',
      tag:      'limeskin-daily',
      renotify: true,
    });
  }
});
