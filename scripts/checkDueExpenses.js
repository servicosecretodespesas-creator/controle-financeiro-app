// scripts/checkDueExpenses.js
//
// Script standalone que roda via GitHub Actions para checar despesas vencidas
// e enviar push via FCM com o Firebase Admin SDK (100% gratuito, sem Blaze).

const admin = require('firebase-admin');

// Inicializa usando o JSON direto da variável de ambiente ou o padrão do sistema
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (e) {
    console.error('Erro ao fazer parse de FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
    process.exit(1);
  }
} else {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

// O AI Studio usa o banco nomeado "ai-studio-sistemadedespesa-bd0127a4-2025-42fa-ad78-0d0f3c31d3c3"
// Se não encontrar ou der erro, usa a instância padrão (default)
const databaseId = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-sistemadedespesa-bd0127a4-2025-42fa-ad78-0d0f3c31d3c3';

let db;
try {
  const { getFirestore } = require('firebase-admin/firestore');
  db = getFirestore(admin.app(), databaseId);
} catch {
  db = admin.firestore();
}

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

async function fetchWithFallback() {
  try {
    return await db.collection('users').get();
  } catch (err) {
    // Se o banco nomeado não existir na conta de serviço, tenta o banco (default)
    console.warn(`[checkDueExpenses] Aviso no banco "${databaseId}": ${err.message}. Tentando banco (default)...`);
    const defaultDb = admin.firestore();
    db = defaultDb;
    return await defaultDb.collection('users').get();
  }
}

async function main() {
  const todayStr = getLocalTodayStr();
  const tomorrowStr = addDays(todayStr, 1);

  console.log(`[checkDueExpenses] Conectando ao Firestore (banco: ${databaseId})...`);
  const usersSnap = await fetchWithFallback();
  console.log(`[checkDueExpenses] Verificando ${usersSnap.size} usuário(s) em ${todayStr}...`);

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data() || {};
    const tokens = userData.fcmTokens || [];
    if (!tokens || tokens.length === 0) continue;

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

    try {
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
    } catch (pushErr) {
      console.error(`[checkDueExpenses] Erro ao enviar push para usuário ${userId}:`, pushErr.message);
    }
  }

  console.log('[checkDueExpenses] Concluído com sucesso!');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[checkDueExpenses] Erro fatal:', err);
    process.exit(1);
  });
