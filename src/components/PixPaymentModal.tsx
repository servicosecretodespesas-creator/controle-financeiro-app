import React, { useState, useEffect } from 'react';
import { Expense, Member } from '../types';
import { db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { generatePixPayload, getPixQRCodeUrl } from '../utils/pix';
import { calculateExpenseInterest } from '../utils/interest';
import { X, Copy, Check, Loader2, QrCode, Landmark, User, CreditCard } from 'lucide-react';

interface PixPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedExpenses: Expense[];
  onConfirmPayment?: () => Promise<void>;
  readOnly?: boolean;
  member?: Member;
  groupMembers?: Member[];
}

interface PixConfig {
  ownerName: string;
  keyType: string;
  keyValue: string;
  bankName: string;
  userId: string;
}

export default function PixPaymentModal({
  isOpen,
  onClose,
  selectedExpenses,
  onConfirmPayment,
  readOnly = false,
  member,
  groupMembers
}: PixPaymentModalProps) {
  const [loading, setLoading] = useState(true);
  const [pixConfig, setPixConfig] = useState<PixConfig | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Calculate total with interest, subtracting partial payments and split correctly
  const totalAmount = selectedExpenses.reduce((sum, exp) => {
    const calc = calculateExpenseInterest(exp);
    const currentVal = calc.currentAmount;
    const paidAmt = exp.amountPaid || 0;
    const remainingVal = Math.max(0, currentVal - paidAmt);

    if (member && groupMembers && groupMembers.length > 0) {
      if (exp.responsibleMemberId === 'all') {
        return sum + (remainingVal / groupMembers.length);
      } else if (exp.responsibleMemberId === member.id) {
        return sum + remainingVal;
      }
      return sum;
    } else {
      return sum + remainingVal;
    }
  }, 0);

  useEffect(() => {
    if (!isOpen || selectedExpenses.length === 0) return;

    async function fetchPixConfig() {
      setLoading(true);
      setPixConfig(null);

      // Determine the owner of the expenses. If multiple, default to first or current user.
      const expenseOwnerId = selectedExpenses[0]?.userId || auth.currentUser?.uid;
      const currentUserId = auth.currentUser?.uid;

      try {
        // 1. Try fetching the owner of the expenses
        let docRef = doc(db, 'pix_configs', expenseOwnerId);
        let docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setPixConfig(docSnap.data() as PixConfig);
        } else if (currentUserId && currentUserId !== expenseOwnerId) {
          // 2. If not found and current user is different, try current user's config as fallback
          docRef = doc(db, 'pix_configs', currentUserId);
          docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setPixConfig(docSnap.data() as PixConfig);
          }
        }
      } catch (error) {
        console.error('Error fetching Pix config for payment:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPixConfig();
  }, [isOpen, selectedExpenses]);

  if (!isOpen) return null;

  // Generate Pix Copy & Paste payload
  let pixPayload = '';
  let qrCodeUrl = '';

  if (pixConfig && totalAmount > 0) {
    pixPayload = generatePixPayload({
      key: pixConfig.keyValue,
      keyType: pixConfig.keyType,
      amount: totalAmount,
      receiverName: pixConfig.ownerName,
      description: `Pgto ${selectedExpenses.length} Desp`,
    });
    qrCodeUrl = getPixQRCodeUrl(pixPayload);
  }

  const handleCopy = () => {
    if (!pixPayload) return;
    navigator.clipboard.writeText(pixPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirmPayment();
      onClose();
    } catch (error) {
      console.error('Error confirming bulk payment:', error);
      alert('Erro ao confirmar o pagamento das despesas.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl border border-slate-150 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <QrCode size={20} className="text-amber-500" />
            <h3 className="font-black text-slate-800 text-sm tracking-tight font-display italic uppercase">
              Pagamento via Pix
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="animate-spin text-amber-500 mb-3" size={28} />
              <span className="text-xs font-semibold uppercase tracking-wider">Buscando protocolo Pix...</span>
            </div>
          ) : !pixConfig ? (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto w-12 h-12 bg-amber-50 border border-dashed border-amber-300 rounded-full flex items-center justify-center text-amber-500">
                <QrCode size={24} />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-800 text-sm">Chave Pix não Configurada</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Nenhum protocolo de recebimento Pix foi encontrado para este usuário. Por favor, acesse a aba <strong className="text-indigo-600">"Dados de Recebimento"</strong> no menu lateral para configurar seu Pix.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
              >
                Voltar
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Amount Banner */}
              <div className="bg-amber-500/10 border border-amber-300/40 rounded-xl p-4 text-center">
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block">Valor Total a Pagar</span>
                <span className="text-2xl font-black text-slate-900 font-mono block mt-1">
                  R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-500 font-bold uppercase mt-1 block">
                  Referente a {selectedExpenses.length} {selectedExpenses.length === 1 ? 'despesa selecionada' : 'despesas selecionadas'}
                </span>
              </div>

              {/* QR Code Frame */}
              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner">
                  {qrCodeUrl ? (
                    <img 
                      src={qrCodeUrl} 
                      alt="QR Code Pix" 
                      className="w-48 h-48 md:w-56 md:h-56 object-contain mix-blend-multiply"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-48 h-48 bg-slate-200 flex items-center justify-center text-slate-400">
                      Sem QR Code
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                  Abra o aplicativo do seu banco para escanear
                </span>
              </div>

              {/* Receiver Account Info */}
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                  <div className="flex items-center space-x-1.5 text-slate-500">
                    <User size={13} />
                    <span className="font-bold">Titular:</span>
                  </div>
                  <span className="font-bold text-slate-800 uppercase font-mono">{pixConfig.ownerName}</span>
                </div>

                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                  <div className="flex items-center space-x-1.5 text-slate-500">
                    <CreditCard size={13} />
                    <span className="font-bold">Chave Pix ({pixConfig.keyType}):</span>
                  </div>
                  <span className="font-mono font-bold text-slate-800 break-all pl-4 text-right">{pixConfig.keyValue}</span>
                </div>

                {pixConfig.bankName && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-slate-500">
                      <Landmark size={13} />
                      <span className="font-bold">Banco:</span>
                    </div>
                    <span className="font-bold text-slate-800 uppercase font-mono">{pixConfig.bankName}</span>
                  </div>
                )}
              </div>

              {/* Pix Copia e Cola Payload String */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Código Pix (Copia e Cola)
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={pixPayload}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-mono text-slate-600 focus:outline-none focus:ring-0 select-all"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold rounded-xl text-xs transition flex items-center justify-center space-x-1 flex-shrink-0 shadow-sm"
                    title="Copiar código Pix"
                  >
                    {copied ? (
                      <>
                        <Check size={14} />
                        <span className="text-[10px] font-bold">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span className="text-[10px] font-bold">Copiar</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* List of expenses included */}
              <div className="border-t border-slate-100 pt-4">
                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">
                  Despesas Incluídas ({selectedExpenses.length})
                </span>
                <div className="max-h-24 overflow-y-auto border border-slate-150 rounded-xl p-3 bg-slate-50/50 space-y-2">
                  {selectedExpenses.map(exp => {
                    const calc = calculateExpenseInterest(exp);
                    const currentVal = calc.currentAmount;
                    const paidAmt = exp.amountPaid || 0;
                    const remainingVal = Math.max(0, currentVal - paidAmt);
                    
                    let amountToRender = remainingVal;
                    let suffix = '';
                    
                    if (member && groupMembers && groupMembers.length > 0) {
                      if (exp.responsibleMemberId === 'all') {
                        amountToRender = remainingVal / groupMembers.length;
                        suffix = ' (Sua cota/rateio)';
                      } else if (exp.responsibleMemberId === member.id) {
                        amountToRender = remainingVal;
                        suffix = ' (Cota única)';
                      } else {
                        amountToRender = 0;
                      }
                    } else if (exp.amountPaid && exp.amountPaid > 0) {
                      suffix = ' (Restante)';
                    }

                    return (
                      <div key={exp.id} className="flex justify-between items-center text-[11px] font-semibold text-slate-700">
                        <span className="truncate max-w-[240px]">{exp.description}{suffix}</span>
                        <span className="font-mono font-bold text-slate-900">
                          R$ {amountToRender.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Confirm payment block */}
              {!readOnly && (
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center space-x-1.5 shadow"
                >
                  {confirming ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-white" />
                      <span>CONFIRMANDO PAGAMENTO...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Confirmar Pagamento Realizado</span>
                    </>
                  )}
                </button>
              )}

            </div>
          )}

        </div>
      </div>
    </div>
  );
}
