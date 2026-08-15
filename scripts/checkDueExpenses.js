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

function formatBRL(amount) {
  const val = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  return `R$ ${val.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function getDaysDiff(dateStr, todayStr) {
  const target = new Date(dateStr + 'T12:00:00').getTime();
  const today = new Date(todayStr + 'T12:00:00').getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

async function fetchUsersWithFallback() {
  try {
    return await db.collection('users').get();
  } catch (err) {
    console.warn(`[checkDueExpenses] Aviso no banco "${databaseId}": ${err.message}. Tentando banco (default)...`);
    const defaultDb = admin.firestore();
    db = defaultDb;
    return await defaultDb.collection('users').get();
  }
}

async function main() {
  const todayStr = getLocalTodayStr();

  console.log(`[checkDueExpenses] Conectando ao Firestore (banco: ${databaseId})...`);
  const usersSnap = await fetchUsersWithFallback();
  console.log(`[checkDueExpenses] Verificando ${usersSnap.size} usuário(s) em ${todayStr}...`);

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data() || {};
    const tokens = userData.fcmTokens || [];
    if (!tokens || tokens.length === 0) continue;

    // 1. Busca os membros para saber de quem é a conta dividida
    const membersMap = new Map();
    try {
      const membersSnap = await db.collection('members').where('userId', '==', userId).get();
      membersSnap.docs.forEach((doc) => {
        const m = doc.data();
        membersMap.set(doc.id, m.name || 'Membro');
      });
    } catch (mErr) {
      console.warn(`[checkDueExpenses] Não foi possível carregar membros para ${userId}:`, mErr.message);
    }

    // 2. Busca todas as despesas não pagas do usuário
    const expensesSnap = await db
      .collection('expenses')
      .where('userId', '==', userId)
      .where('isPaid', '==', false)
      .get();

    const overdueLines = [];
    const upcomingLines = [];
    let overdueCount = 0;
    let upcomingCount = 0;

    expensesSnap.docs.forEach((doc) => {
      const exp = doc.data();
      if (exp.recurringActive === false) return;
      if (!exp.dueDate) return;

      const diffDays = getDaysDiff(exp.dueDate, todayStr);

      // Considera atrasada se diffDays < 0
      // Considera vencendo em breve se diffDays entre 0 e 3 (hoje, amanhã ou até 3 dias)
      if (diffDays > 3) return;

      // Descobre de quem é a conta
      let ownerName = 'Pessoal (Você)';
      if (exp.type === 'third_party') {
        if (exp.responsibleMemberId === 'all') {
          ownerName = 'Todos (Dividido)';
        } else if (exp.responsibleMemberId && membersMap.has(exp.responsibleMemberId)) {
          ownerName = membersMap.get(exp.responsibleMemberId);
        } else {
          ownerName = 'Terceiros';
        }
      }

      // Detalhe de parcelamento / tipo
      let parcelText = '';
      if (exp.isInstallments) {
        const curr = exp.currentInstallment || 1;
        const total = exp.installmentsCount || '?';
        parcelText = ` [Parc. ${curr}/${total}]`;
      } else if (exp.isRecurring) {
        parcelText = ' [Recorrente]';
      } else {
        parcelText = ' [À vista]';
      }

      const formattedVal = formatBRL(exp.amount);

      if (diffDays < 0) {
        overdueCount++;
        const daysPast = Math.abs(diffDays);
        const dueText = daysPast === 1 ? 'Venceu ONTEM!' : `Venceu há ${daysPast} dias!`;
        overdueLines.push(`• ⚠️ ${exp.description} : ${formattedVal} - ${ownerName}${parcelText} [${dueText}]`);
      } else {
        upcomingCount++;
        let dueText = '';
        if (diffDays === 0) {
          dueText = 'Vence HOJE!';
        } else if (diffDays === 1) {
          dueText = 'Vence AMANHÃ!';
        } else {
          dueText = `Vence em ${diffDays} dias`;
        }
        upcomingLines.push(`• 🔔 ${exp.description} : ${formattedVal} - ${ownerName}${parcelText} [${dueText}]`);
      }
    });

    if (overdueCount === 0 && upcomingCount === 0) continue;

    // Monta o título do Push
    let title = '';
    if (overdueCount > 0) {
      title = `⚠️ Alerta: ${overdueCount} Conta(s) Vencida(s)! 🔔`;
    } else {
      title = `Contas Vencendo em Breve! 🔔`;
    }

    // Monta o corpo da mensagem com seções organizadas
    const bodySections = [];
    if (overdueCount > 0) {
      bodySections.push(`⚠️ CONTAS VENCIDAS:\n` + overdueLines.join('\n'));
    }
    if (upcomingCount > 0) {
      bodySections.push(`🔔 VENCENDO EM BREVE:\n` + upcomingLines.join('\n'));
    }

    let body = bodySections.join('\n\n');
    if (body.length > 900) {
      body = body.substring(0, 897) + '...';
    }

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
