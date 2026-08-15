// Firebase Cloud Messaging Service Worker
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

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Mensagem em segundo plano recebida:', payload);

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
