// sw.js - 라임스킨 Service Worker
var CACHE = 'limeskin-v5';

self.addEventListener('install', function(e) {
  self.skipWaiting();
  // 기존 캐시 모두 삭제
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        return caches.delete(key);
      }));
    })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

// 캐시 안 쓰고 항상 네트워크에서 최신 버전 가져오기
self.addEventListener('fetch', function(e) {
  e.respondWith(
    fetch(e.request).catch(function() {
      return caches.match(e.request);
    })
  );
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
