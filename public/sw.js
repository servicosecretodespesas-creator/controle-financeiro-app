// ==========================================================================
// FIREBASE CLOUD MESSAGING (Push real - funciona com app/navegador fechado)
// ==========================================================================
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDZgYOt7OHj2_UKNbW05DKbtOww1Ll0Rs4",
  authDomain: "controle-financeiro-facd7.firebaseapp.com",
  projectId: "controle-financeiro-facd7",
  storageBucket: "controle-financeiro-facd7.firebasestorage.app",
  messagingSenderId: "761482666055",
  appId: "1:761482666055:web:53f115f32a3817e5dcd162"
});

const messaging = firebase.messaging();

// Disparado quando chega uma push message e o app está FECHADO ou em background.
// O FCM gerencia a entrega de dados mesmo em background.
messaging.onBackgroundMessage((payload) => {
  console.log('[SW][FCM] Mensagem em segundo plano recebida:', payload);

  const title = payload.notification?.title || payload.data?.title || 'Serviço Secreto - Despesas 🔔';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'Alerta de contas a pagar.',
    icon: '/icon.svg',
    badge: '/icon.svg',
    vibrate: [200, 100, 200],
    requireInteraction: true,
    data: { url: payload.fcmOptions?.link || payload.data?.url || '/' }
  };

  self.registration.showNotification(title, options);
});

// ==========================================================================
// CACHE / PWA OFFLINE
// ==========================================================================
const CACHE_NAME = 'despesas-pwa-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline app shell');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('firebase') ||
    url.origin.includes('googleapis') ||
    url.pathname.startsWith('/api/') ||
    request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic' &&
          url.origin === self.location.origin
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});

// ==========================================================================
// Mensagens do cliente (mantido para testes manuais no dispositivo)
// ==========================================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SCHEDULE_TEST_NOTIFICATION') {
    const delayMs = event.data.delayMs || 10000;
    console.log(`[SW] Agendando notificação de teste em ${delayMs / 1000}s`);

    setTimeout(() => {
      self.registration.showNotification('Teste Local! 🔔', {
        body: event.data.body || 'Esta é uma notificação de teste local (executada pelo Service Worker no dispositivo).',
        icon: '/icon.svg',
        badge: '/icon.svg',
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data: { url: '/' }
      });
    }, delayMs);
  }
});

// ==========================================================================
// Clique na notificação
// ==========================================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
