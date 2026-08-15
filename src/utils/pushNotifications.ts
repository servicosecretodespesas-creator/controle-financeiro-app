import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../firebase';

// Obtenha esta chave em: Firebase Console > Configurações do Projeto >
// Cloud Messaging > "Certificados push da Web" (VAPID) > Gerar par de chaves.
export const VAPID_KEY = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || 'BNJLbG12BJAoKI3Xk6xQgGFXSVEhzdSD3rV6mX9vkkYlnsJ8E1p8QMT9VgZrsXKA0QQ6s-48PNV-wv-j6xqJdn8';

/**
 * Pede permissão de notificação ao usuário, obtém o token FCM do dispositivo
 * e salva esse token no documento do usuário no Firestore, para que a
 * Cloud Function / servidor agendado saiba para onde enviar o push em segundo plano.
 */
export async function requestPushPermissionAndSaveToken(userId: string): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return false;
    }

    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Push não suportado neste navegador (comum em iOS fora do modo instalado).');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Permissão de notificação negada pelo usuário.');
      return false;
    }

    // Garante que o Service Worker está ativo
    const registration = await navigator.serviceWorker.ready;

    const messaging = getMessaging(app);
    
    // Se a VAPID_KEY ainda for o placeholder padrão, tenta obter o token sem a chave explícita (se já configurado no projeto) ou passa
    const tokenOptions: { vapidKey?: string; serviceWorkerRegistration?: ServiceWorkerRegistration } = {
      serviceWorkerRegistration: registration,
    };
    if (VAPID_KEY && !VAPID_KEY.includes('YOUR_VAPID')) {
      tokenOptions.vapidKey = VAPID_KEY;
    }

    let token = '';
    try {
      token = await getToken(messaging, tokenOptions);
    } catch (tokenErr) {
      console.warn('[FCM] Falha ao obter token com VAPID configurada, tentando registro padrão:', tokenErr);
      try {
        token = await getToken(messaging, { serviceWorkerRegistration: registration });
      } catch (fallbackErr) {
        console.warn('[FCM] Registro padrão também falhou:', fallbackErr);
      }
    }

    if (!token) {
      console.warn('[FCM] Não foi possível gerar o token de push FCM.');
      return false;
    }

    // Salva o token no documento do usuário (array, pois um usuário pode ter múltiplos dispositivos)
    await setDoc(
      doc(db, 'users', userId),
      {
        fcmTokens: arrayUnion(token),
        fcmTokenUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    console.log('[FCM] Token push registrado com sucesso no Firestore para o usuário:', userId);

    // Enquanto o app está ABERTO em primeiro plano, exibe notificação pelo listener
    onMessage(messaging, (payload) => {
      console.log('[FCM] Mensagem em primeiro plano recebida:', payload);
      const title = payload.notification?.title || payload.data?.title || 'Serviço Secreto - Despesas 🔔';
      const body = payload.notification?.body || payload.data?.body || '';
      if (Notification.permission === 'granted') {
        new Notification(title, { 
          body, 
          icon: '/icon.svg',
          badge: '/icon.svg',
        });
      }
    });

    return true;
  } catch (err) {
    console.error('[FCM] Erro ao configurar push notifications:', err);
    return false;
  }
}

/**
 * Remove o token FCM deste dispositivo do usuário (ex: ao fazer logout ou
 * ao desativar notificações), para não continuar recebendo push depois.
 */
export async function removePushToken(userId: string, token: string): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', userId),
      { fcmTokens: arrayRemove(token) },
      { merge: true }
    );
  } catch (err) {
    console.error('[FCM] Erro ao remover token FCM:', err);
  }
}
