export const registerPeriodicSync = async (registration: ServiceWorkerRegistration) => {
  try {
    if ('periodicSync' in registration) {
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync' as any,
      });
      if (status.state === 'granted') {
        await (registration as any).periodicSync.register('check-due-expenses', {
          minInterval: 12 * 60 * 60 * 1000, // Check every 12 hours
        });
        console.log('[SW] PeriodicSync registrado com sucesso!');
      }
    }
  } catch (err) {
    console.warn('[SW] PeriodicSync não ativado ou não suportado:', err);
  }
};

export const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[SW] ServiceWorker registrado com sucesso:', registration.scope);
      await registerPeriodicSync(registration);
      return registration;
    } catch (err) {
      console.warn('[SW] Falha ao registrar ServiceWorker:', err);
      return null;
    }
  }
  return null;
};

/**
  * Salva o estado atual das despesas próximas no IndexedDB / LocalStorage / ServiceWorker
  * para que o ServiceWorker possa disparar a notificação em segundo plano (background).
  */
export const syncExpensesToServiceWorker = async (upcomingCount: number, details: string) => {
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && registration.active) {
        registration.active.postMessage({
          type: 'SYNC_UPCOMING_EXPENSES',
          upcomingCount,
          details,
          updatedAt: new Date().toISOString()
        });
      }
    }
    localStorage.setItem('sw_upcoming_details', details);
    localStorage.setItem('sw_upcoming_count', String(upcomingCount));
  } catch (err) {
    console.warn('Erro ao sincronizar despesas com ServiceWorker:', err);
  }
};

/**
 * Envia notificação de forma segura sem travar ou quebrar o React em nenhuma plataforma.
 * Suporta Desktop (new Notification) e Mobile Android (ServiceWorker showNotification).
 */
export const scheduleBackgroundTestNotification = async (delayMs = 10000, customBody?: string): Promise<boolean> => {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return false;
    }

    let registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      registration = (await registerServiceWorker()) || undefined;
    }

    if (registration && registration.active) {
      registration.active.postMessage({
        type: 'SCHEDULE_TEST_NOTIFICATION',
        delayMs,
        body: customBody || 'Notificação em segundo plano! O app enviou este alerta mesmo com a tela/navegador fechado.'
      });
      return true;
    } else if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_TEST_NOTIFICATION',
        delayMs,
        body: customBody || 'Notificação em segundo plano! O app enviou este alerta mesmo com a tela/navegador fechado.'
      });
      return true;
    }
    return false;
  } catch (err) {
    console.error('Erro ao agendar notificação em segundo plano:', err);
    return false;
  }
};

export const sendSafeNotification = async (title: string, options?: NotificationOptions): Promise<boolean> => {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.log('Notificações não suportadas neste ambiente.');
      return false;
    }

    if (Notification.permission !== 'granted') {
      console.log('Permissão de notificação não concedida.');
      return false;
    }

    // 1. Prioriza o ServiceWorker showNotification (exigido no Android Chrome / Mobile)
    if ('serviceWorker' in navigator) {
      try {
        let registration = await navigator.serviceWorker.getRegistration();
        if (!registration) {
          registration = (await registerServiceWorker()) || undefined;
        }

        if (registration && registration.active && typeof registration.showNotification === 'function') {
          await registration.showNotification(title, {
            icon: '/icon.svg',
            badge: '/icon.svg',
            vibrate: [200, 100, 200],
            ...options,
          } as NotificationOptions);
          return true;
        }
      } catch (swErr) {
        console.warn('Falha no showNotification via ServiceWorker, tentando construtor direto:', swErr);
      }
    }

    // 2. Fallback para construtor direto new Notification (Desktop Chrome, Safari, Firefox)
    try {
      new Notification(title, {
        icon: '/icon.svg',
        ...options,
      });
      return true;
    } catch (constructErr) {
      console.warn('Construtor new Notification não suportado neste navegador mobile:', constructErr);
      return false;
    }
  } catch (err) {
    console.error('Erro ao enviar notificação com segurança:', err);
    return false;
  }
};
