import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ShieldCheck, Check, Info, Loader2 } from 'lucide-react';

interface PixConfig {
  ownerName: string;
  keyType: string;
  keyValue: string;
  bankName: string;
  userId: string;
  updatedAt: string;
}

export default function PixConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [keyType, setKeyType] = useState('CPF');
  const [keyValue, setKeyValue] = useState('');
  const [bankName, setBankName] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    async function loadPixConfig() {
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'pix_configs', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as PixConfig;
          setOwnerName(data.ownerName || '');
          setKeyType(data.keyType || 'CPF');
          setKeyValue(data.keyValue || '');
          setBankName(data.bankName || '');
        } else {
          // Pre-fill with user display name if available
          if (user.displayName) {
            setOwnerName(user.displayName.toUpperCase());
          }
        }
      } catch (error) {
        console.error('Error loading Pix configuration:', error);
      } finally {
        setLoading(false);
      }
    }

    loadPixConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) {
      setStatusMsg({ type: 'error', text: 'Você precisa estar logado para salvar as configurações.' });
      return;
    }

    if (!ownerName.trim()) {
      setStatusMsg({ type: 'error', text: 'O nome completo do titular é obrigatório.' });
      return;
    }

    if (!keyValue.trim()) {
      setStatusMsg({ type: 'error', text: 'A chave Pix é obrigatória.' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);

    try {
      const configData: PixConfig = {
        ownerName: ownerName.trim().toUpperCase(),
        keyType,
        keyValue: keyValue.trim(),
        bankName: bankName.trim().toUpperCase(),
        userId: user.uid,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'pix_configs', user.uid), configData);
      setStatusMsg({ type: 'success', text: 'Protocolo de recebimento confirmado com sucesso!' });
      
      // Clear status message after 3 seconds
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (error: any) {
      console.error('Error saving Pix config:', error);
      setStatusMsg({ type: 'error', text: `Erro ao salvar: ${error.message || 'Verifique suas permissões.'}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <Loader2 className="animate-spin text-indigo-600 mb-3" size={32} />
        <span className="text-sm font-medium">Carregando dados de recebimento...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Top Header Section */}
      <div className="flex items-start space-x-3 mb-8">
        <div className="bg-amber-100 p-2.5 rounded-lg text-amber-500 flex-shrink-0">
          <ShieldCheck size={28} className="fill-amber-500 text-amber-100" />
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight font-display italic">
            DADOS DE RECEBIMENTO
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mt-0.5">
            Configure como você deseja receber o capital dos seus alvos.
          </p>
        </div>
      </div>

      {/* Main Terminal Config Box */}
      <div className="bg-white border border-slate-150 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-dashed border-slate-200">
          <h2 className="text-base md:text-lg font-black text-slate-800 tracking-tight font-display italic">
            TERMINAL DE CONFIGURAÇÃO PIX
          </h2>
          <p className="text-[11px] text-slate-400 uppercase tracking-wider font-bold mt-1">
            Estes dados serão usados para gerar o QR Code nos seus links de compartilhamento.
          </p>
        </div>

        <form onSubmit={handleSave} className="p-6 md:p-8 space-y-6">
          {/* Holder Name */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
              Nome Completo do Titular (PIX)
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Digite o nome completo do titular da conta"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 font-semibold uppercase text-slate-800 text-xs transition duration-200 bg-slate-50/50"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Key Type Dropdown */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                Tipo de Chave
              </label>
              <select
                value={keyType}
                onChange={(e) => setKeyType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 font-semibold text-slate-800 text-xs transition duration-200 bg-slate-50/50"
              >
                <option value="CPF">CPF</option>
                <option value="CNPJ">CNPJ</option>
                <option value="E-mail">E-mail</option>
                <option value="Celular">Celular (Telefone)</option>
                <option value="Chave Aleatória">Chave Aleatória (EVP)</option>
              </select>
            </div>

            {/* Real Pix Key Value */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                Chave Pix Real
              </label>
              <input
                type="text"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder={
                  keyType === 'CPF' ? '000.000.000-00' :
                  keyType === 'CNPJ' ? '00.000.000/0000-00' :
                  keyType === 'E-mail' ? 'seu-email@provedor.com' :
                  keyType === 'Celular' ? '+55 (00) 00000-0000' :
                  'Chave aleatória de 36 caracteres'
                }
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 font-semibold text-slate-800 text-xs transition duration-200 bg-slate-50/50"
              />
            </div>
          </div>

          {/* Bank (Optional) */}
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
              Instituição Bancária (Opcional)
            </label>
            <input
              type="text"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Ex: BRADESCO, ITAU, NUBANK, BANCO DO BRASIL"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 font-semibold uppercase text-slate-800 text-xs transition duration-200 bg-slate-50/50"
            />
          </div>

          {/* Status Alert */}
          {statusMsg && (
            <div
              className={`p-4 rounded-xl flex items-start space-x-2 text-xs font-semibold ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <Info size={16} className="mt-0.5 flex-shrink-0" />
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Golden Dotted Warning Notice */}
          <div className="bg-amber-50/40 border border-dashed border-amber-300 rounded-xl p-4 text-center">
            <p className="text-[9px] md:text-[10px] text-amber-700 font-black tracking-wider uppercase">
              O sistema gera o QR Code tático automaticamente com base nas informações acima.
            </p>
          </div>

          {/* Confirm Button */}
          <button
            type="submit"
            disabled={saving}
            className="w-full py-4 px-6 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-black text-xs uppercase tracking-wider shadow-md hover:shadow-lg transition duration-200 flex items-center justify-center space-x-2 disabled:opacity-55 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin text-slate-900" />
                <span>PROCESSANDO PROTOCOLO...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={16} className="fill-slate-900 text-amber-400" />
                <span>Confirmar Protocolo de Recebimento</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
