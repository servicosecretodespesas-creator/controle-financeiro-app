// api/mint-member-token.ts
//
// Função serverless (roda na Vercel, fora do Firebase — não precisa de Blaze).
// Recebe um shareToken, confere no Firestore (via Admin SDK, que ignora as
// regras de segurança) se ele pertence a um membro de verdade, e devolve um
// "Custom Token" do Firebase Auth com claims (memberId, ownerId, shareToken)
// embutidas. O MemberViewer.tsx usa esse token para se autenticar de forma
// invisível — sem pedir login/senha da pessoa — e a partir daí as regras do
// Firestore conseguem checar de verdade se ela tem o token certo, em vez de
// confiar cegamente que ela vai usar o filtro certo na consulta.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  // Mesmo JSON de Service Account usado no GitHub Actions — configurado como
  // variável de ambiente FIREBASE_SERVICE_ACCOUNT no painel da Vercel.
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string);
  return initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS: permite que o seu site (hospedado no Firebase Hosting) chame esta
  // função em outro domínio (a Vercel). Se quiser travar mais, troque '*'
  // pelo domínio exato do seu app, ex: 'https://servicosecreto.com.br'.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const { shareToken } = (req.body || {}) as { shareToken?: string };
  if (!shareToken || typeof shareToken !== 'string') {
    res.status(400).json({ error: 'shareToken é obrigatório.' });
    return;
  }

  try {
    const app = getAdminApp();
    const db = getFirestore(app, DATABASE_ID);
    const auth = getAuth(app);

    const membersSnap = await db
      .collection('members')
      .where('shareToken', '==', shareToken)
      .limit(1)
      .get();

    if (membersSnap.empty) {
      res.status(404).json({ error: 'Link de compartilhamento inválido ou expirado.' });
      return;
    }

    const memberDoc = membersSnap.docs[0];
    const memberData = memberDoc.data();
    const memberId = memberDoc.id;
    const ownerId = memberData.userId;

    // UID isolado e determinístico — nunca colide com contas reais de usuários
    // do app (não é um usuário "de verdade", é só uma identidade técnica
    // para as regras do Firestore conseguirem verificar o token).
    const uid = `member_${memberId}`;

    const customToken = await auth.createCustomToken(uid, {
      memberId,
      ownerId,
      shareToken
    });

    res.status(200).json({
      customToken,
      member: { id: memberId, ...memberData }
    });
  } catch (err) {
    console.error('[mint-member-token] Erro:', err);
    res.status(500).json({ error: 'Erro interno ao validar o link.' });
  }
}
