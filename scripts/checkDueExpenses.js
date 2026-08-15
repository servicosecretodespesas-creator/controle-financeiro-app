// scripts/checkDueExpenses.js
//
// Script standalone (NÃO é uma Cloud Function) que:
//  1. Se conecta ao Firestore usando uma Service Account (não precisa de Blaze)
//  2. Verifica despesas vencidas / vencendo hoje / vencendo amanhã de cada usuário
//  3. Envia push via FCM (Admin SDK) para os tokens salvos em users/{uid}.fcmTokens
//
// Roda localmente (`node scripts/checkDueExpenses.js`) ou via GitHub Actions,
// que dispara este script todo dia no horário agendado. 100% gratuito.

const admin = require('firebase-admin');

// A credencial vem de uma variável de ambiente (GOOGLE_APPLICATION_CREDENTIALS)
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();
const messaging = admin.messaging();

function getLocalTodayStr() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function main() {
  const todayStr = getLocalTodayStr();
  const tomorrowStr = addDays(todayStr, 1);

  const usersSnap = await db.collection('users').get();
  console.log(`[checkDueExpenses] Verificando ${usersSnap.size} usuário(s) em ${todayStr}...`);

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const tokens = userDoc.data().fcmTokens || [];
    if (tokens.length === 0) continue;

    const expensesSnap = await db
      .collection('expenses')
      .where('userId', '==', userId)
      .where('isPaid', '==', false)
      .get();

    let overdueCount = 0;
    let dueSoonCount = 0;
    const detailLines = [];

    expensesSnap.docs.forEach((doc) => {
      const exp = doc.data();
      if (exp.recurringActive === false) return;

      if (exp.dueDate < todayStr) {
        overdueCount++;
        detailLines.push(`⚠️ ${exp.description} — atrasada`);
      } else if (exp.dueDate === todayStr) {
        dueSoonCount++;
        detailLines.push(`🔔 ${exp.description} — vence hoje`);
      } else if (exp.dueDate === tomorrowStr) {
        dueSoonCount++;
        detailLines.push(`🔔 ${exp.description} — vence amanhã`);
      }
    });

    if (overdueCount === 0 && dueSoonCount === 0) continue;

    const title =
      overdueCount > 0
        ? `⚠️ ${overdueCount} despesa(s) vencida(s)`
        : `🔔 ${dueSoonCount} despesa(s) vencendo`;

    const body = detailLines.slice(0, 3).join('\n') + (detailLines.length > 3 ? '\n...' : '');

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: {
        fcmOptions: { link: '/' },
        notification: {
          icon: '/icon.svg',
          badge: '/icon.svg',
          requireInteraction: true
        }
      }
    });

    console.log(
      `[checkDueExpenses] Usuário ${userId}: ${response.successCount} enviada(s), ${response.failureCount} falha(s).`
    );

    // Remove tokens inválidos/expirados
    const invalidTokens = [];
    response.responses.forEach((r, idx) => {
      if (
        !r.success &&
        (r.error?.code === 'messaging/registration-token-not-registered' ||
          r.error?.code === 'messaging/invalid-registration-token')
      ) {
        invalidTokens.push(tokens[idx]);
      }
    });

    if (invalidTokens.length > 0) {
      await userDoc.ref.update({
        fcmTokens: tokens.filter((t) => !invalidTokens.includes(t))
      });
    }
  }

  console.log('[checkDueExpenses] Concluído.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[checkDueExpenses] Erro fatal:', err);
    process.exit(1);
  });
