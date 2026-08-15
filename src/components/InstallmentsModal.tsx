import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Expense, Member } from '../types';
import { X, Check, Clock, Trash2, Layers, Calendar, DollarSign, AlertCircle, Eye, Edit2 } from 'lucide-react';
import { getLocalTodayStr } from '../utils/interest';

interface InstallmentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseExpense: Expense | null;
  expenses: Expense[];
  onUpdateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
  onDeleteExpense: (id: string, skipConfirm?: boolean) => Promise<void>;
  members: Member[];
  customConfirm?: (title: string, message: string) => Promise<boolean>;
  onEditExpense?: (exp: Expense) => void;
}

// Extract base description by removing "(current/total)" suffix
function getBaseDescription(description: string): string {
  return description.replace(/\s*\(\d+\/\d+\)$/, '').trim();
}

export default function InstallmentsModal({
  isOpen,
  onClose,
  baseExpense,
  expenses,
  onUpdateExpense,
  onDeleteExpense,
  members,
  customConfirm,
  onEditExpense
}: InstallmentsModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [editingAmountValue, setEditingAmountValue] = useState<string>('');

  const handleSaveAmount = async (id: string) => {
    const parsed = parseFloat(editingAmountValue);
    if (isNaN(parsed) || parsed <= 0) {
      alert("Por favor, insira um valor válido maior que zero.");
      return;
    }

    const currentInst = relatedInstallments.find(e => e.id === id);
    if (!currentInst) return;

    const futureInstallments = relatedInstallments.filter(
      e => (e.currentInstallment || 0) > (currentInst.currentInstallment || 0)
    );

    let applyToFuture = false;
    if (futureInstallments.length > 0) {
      const maxInst = relatedInstallments[relatedInstallments.length - 1].currentInstallment;
      const msg = `Você está editando a parcela ${currentInst.currentInstallment} de ${currentInst.installmentsCount}. Deseja aplicar o novo valor de R$ ${parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} para esta parcela e todas as futuras (da ${currentInst.currentInstallment} até a ${maxInst})?`;
      
      if (customConfirm) {
        applyToFuture = await customConfirm("Atualizar Parcelas Futuras", msg);
      } else {
        applyToFuture = confirm(msg);
      }
    }

    try {
      if (applyToFuture) {
        const installmentsToUpdate = relatedInstallments.filter(
          e => (e.currentInstallment || 0) >= (currentInst.currentInstallment || 0)
        );
        await Promise.all(installmentsToUpdate.map(inst => 
          onUpdateExpense(inst.id, { 
            amount: parsed,
            originalAmount: parsed 
          })
        ));
      } else {
        await onUpdateExpense(id, { 
          amount: parsed,
          originalAmount: parsed 
        });
      }
      setEditingAmountId(null);
    } catch (err) {
      console.error(err);
      alert("Erro ao atualizar o valor da parcela.");
    }
  };

  // Base description of the series
  const baseDesc = useMemo(() => {
    return baseExpense ? getBaseDescription(baseExpense.description) : '';
  }, [baseExpense]);

  // Find all installments in the same series across all months
  const relatedInstallments = useMemo(() => {
    if (!baseExpense) return [];
    return expenses
      .filter(exp => {
        if (!exp.isInstallments) return false;
        if (exp.type !== baseExpense.type) return false;
        
        // If both have installmentGroupId, compare them strictly
        if (exp.installmentGroupId && baseExpense.installmentGroupId) {
          return exp.installmentGroupId === baseExpense.installmentGroupId;
        }
        
        // Fallback for older data without installmentGroupId
        return getBaseDescription(exp.description) === baseDesc &&
               exp.installmentsCount === baseExpense.installmentsCount &&
               exp.transactionDate === baseExpense.transactionDate;
      })
      .sort((a, b) => (a.currentInstallment || 0) - (b.currentInstallment || 0));
  }, [expenses, baseExpense, baseDesc]);

  // Reset selected checkboxes when modal opens or base expense changes
  useEffect(() => {
    setSelectedIds([]);
  }, [baseExpense, isOpen]);

  // If no installments remain in the series, close the modal automatically
  useEffect(() => {
    if (isOpen && relatedInstallments.length === 0) {
      onClose();
    }
  }, [relatedInstallments, isOpen, onClose]);

  const isAllSelected = relatedInstallments.length > 0 && selectedIds.length === relatedInstallments.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(relatedInstallments.map(e => e.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  const handleBulkMarkAsPaid = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => onUpdateExpense(id, { isPaid: true })));
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      alert("Erro ao marcar parcelas como pagas.");
    }
  };

  const handleBulkMarkAsPending = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => onUpdateExpense(id, { isPaid: false })));
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      alert("Erro ao marcar parcelas como pendentes.");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const isConfirmed = customConfirm
      ? await customConfirm("Excluir Parcelas", `Tem certeza que deseja excluir as ${selectedIds.length} parcelas selecionadas?`)
      : confirm(`Tem certeza que deseja excluir as ${selectedIds.length} parcelas selecionadas?`);

    if (!isConfirmed) return;

    try {
      // Delete synchronously or in parallel
      await Promise.all(selectedIds.map(id => onDeleteExpense(id, true)));
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir parcelas.");
    }
  };

  // Stats for the series
  const seriesStats = useMemo(() => {
    const totalAmount = relatedInstallments.reduce((acc, curr) => acc + curr.amount, 0);
    const paidAmount = relatedInstallments.filter(e => e.isPaid).reduce((acc, curr) => acc + curr.amount, 0);
    const pendingAmount = relatedInstallments.filter(e => !e.isPaid).reduce((acc, curr) => acc + curr.amount, 0);
    const paidCount = relatedInstallments.filter(e => e.isPaid).length;
    const totalCount = relatedInstallments.length;

    return {
      totalAmount,
      paidAmount,
      pendingAmount,
      paidCount,
      totalCount
    };
  }, [relatedInstallments]);

  return (
    <AnimatePresence>
      {isOpen && baseExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 15 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="relative bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-indigo-600">
                  <Layers size={18} />
                  <span className="text-xs font-bold uppercase tracking-wider">Histórico de Parcelas</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900 leading-snug">
                  {baseDesc}
                </h3>
                <p className="text-xs text-slate-500 flex flex-wrap gap-x-2 gap-y-1 items-center">
                  <span>Categoria: <span className="font-semibold text-slate-700">{baseExpense.category}</span></span>
                  <span className="text-slate-300">•</span>
                  <span>Data de Compra: <span className="font-semibold text-slate-700">{baseExpense.transactionDate.split('-').reverse().join('/')}</span></span>
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 transition p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Series Statistics */}
            <div className="grid grid-cols-3 gap-3 p-6 bg-slate-50/30 border-b border-slate-100">
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Geral</span>
                <span className="text-sm font-bold text-slate-900 font-mono block mt-1">
                  R$ {seriesStats.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-500 mt-0.5 block">
                  {seriesStats.totalCount} parcelas cadastradas
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm border-l-emerald-500 border-l-4">
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">Total Pago</span>
                <span className="text-sm font-bold text-slate-900 font-mono block mt-1">
                  R$ {seriesStats.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-500 mt-0.5 block">
                  {seriesStats.paidCount} de {seriesStats.totalCount} pagas
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm border-l-amber-500 border-l-4">
                <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider block">Falta Pagar</span>
                <span className="text-sm font-bold text-slate-900 font-mono block mt-1">
                  R$ {seriesStats.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] text-slate-500 mt-0.5 block">
                  {seriesStats.totalCount - seriesStats.paidCount} restantes
                </span>
              </div>
            </div>

            {/* Bulk Actions Bar inside Modal */}
            {selectedIds.length > 0 && (
              <div className="bg-indigo-50/80 border-b border-indigo-100 px-6 py-3 flex flex-col sm:flex-row justify-between items-center gap-2">
                <span className="text-xs font-bold text-indigo-900">
                  {selectedIds.length} {selectedIds.length === 1 ? 'parcela selecionada' : 'parcelas selecionadas'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkMarkAsPaid}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg hover:bg-emerald-700 transition cursor-pointer"
                  >
                    <Check size={12} /> Marcar Pago
                  </button>
                  <button
                    onClick={handleBulkMarkAsPending}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 text-white text-[10px] font-bold rounded-lg hover:bg-amber-700 transition cursor-pointer"
                  >
                    <Clock size={12} /> Marcar Pendente
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-600 text-white text-[10px] font-bold rounded-lg hover:bg-rose-700 transition cursor-pointer"
                  >
                    <Trash2 size={12} /> Excluir
                  </button>
                </div>
              </div>
            )}

            {/* Help Hint for Editing Future Installments */}
            <div className="bg-blue-50/80 border-b border-blue-100/60 px-6 py-2.5 flex items-start gap-2 text-blue-800 text-[11px] leading-relaxed font-medium">
              <AlertCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <span>
                <strong>Como alterar o valor de parcelas futuras:</strong> Clique no ícone de lápis <Edit2 size={10} className="inline text-blue-600 mx-0.5" /> ao lado do valor de qualquer parcela na tabela abaixo. Ao salvar, o sistema perguntará se deseja aplicar o novo valor a essa parcela e a todas as parcelas seguintes automaticamente.
              </span>
            </div>

            {/* Content List of Installments */}
            <div className="flex-1 overflow-y-auto p-6 min-h-[180px]">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[9px]">
                      <th className="px-4 py-3 text-center w-12">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                        />
                      </th>
                      <th className="px-4 py-3">Nº Parcela</th>
                      <th className="px-4 py-3">Vencimento</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {relatedInstallments.map((inst) => {
                      const isOverdue = !inst.isPaid && getLocalTodayStr() > inst.dueDate;
                      const isCurrentlySelected = selectedIds.includes(inst.id);
                      return (
                        <tr 
                          key={inst.id} 
                          className={`hover:bg-slate-50/50 transition-colors ${isCurrentlySelected ? 'bg-indigo-50/20' : ''}`}
                        >
                          <td className="px-4 py-3.5 text-center w-12">
                            <input
                              type="checkbox"
                              checked={isCurrentlySelected}
                              onChange={(e) => handleSelectOne(inst.id, e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5"
                            />
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[10px]">
                              {inst.currentInstallment} / {inst.installmentsCount}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`font-mono text-xs ${isOverdue ? "text-rose-600 font-bold" : "text-slate-600"}`}>
                              {inst.dueDate.split('-').reverse().join('/')}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-mono font-bold text-slate-900 text-xs">
                            {editingAmountId === inst.id ? (
                              <div className="flex items-center space-x-1">
                                <span className="text-slate-400 text-[10px]">R$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editingAmountValue}
                                  onChange={(e) => setEditingAmountValue(e.target.value)}
                                  className="w-16 bg-white border border-indigo-400 rounded px-1 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono font-bold"
                                  autoFocus
                                  onKeyDown={async (e) => {
                                    if (e.key === 'Enter') {
                                      await handleSaveAmount(inst.id);
                                    } else if (e.key === 'Escape') {
                                      setEditingAmountId(null);
                                    }
                                  }}
                                />
                                <button
                                  onClick={() => handleSaveAmount(inst.id)}
                                  className="p-1 bg-emerald-50 text-emerald-600 rounded hover:bg-emerald-100 transition cursor-pointer"
                                  title="Salvar"
                                >
                                  <Check size={11} />
                                </button>
                                <button
                                  onClick={() => setEditingAmountId(null)}
                                  className="p-1 bg-slate-100 text-slate-500 rounded hover:bg-slate-200 transition cursor-pointer"
                                  title="Cancelar"
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-slate-900">
                                  R$ {inst.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <button
                                  onClick={() => {
                                    setEditingAmountId(inst.id);
                                    setEditingAmountValue(inst.amount.toString());
                                  }}
                                  className="p-1 text-indigo-500 hover:text-indigo-700 bg-indigo-50/60 hover:bg-indigo-50 rounded transition cursor-pointer"
                                  title="Editar valor"
                                >
                                  <Edit2 size={11} />
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <button
                              onClick={() => onUpdateExpense(inst.id, { isPaid: !inst.isPaid })}
                              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase transition cursor-pointer ${
                                inst.isPaid 
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                                  : isOverdue
                                  ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                              }`}
                            >
                              {inst.isPaid ? (
                                <>
                                  <Check size={8} /> <span>Pago</span>
                                </>
                              ) : (
                                <>
                                  <Clock size={8} /> <span>{isOverdue ? 'Atrasado' : 'Pendente'}</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex justify-end items-center space-x-1">
                              {onEditExpense && (
                                <button
                                  onClick={() => onEditExpense(inst)}
                                  className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition cursor-pointer inline-block"
                                  title="Editar detalhes completos"
                                >
                                  <Eye size={13} />
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  const isConfirmed = customConfirm
                                    ? await customConfirm("Excluir Parcela", `Tem certeza que deseja excluir a parcela ${inst.currentInstallment}/${inst.installmentsCount}?`)
                                    : confirm(`Tem certeza que deseja excluir a parcela ${inst.currentInstallment}/${inst.installmentsCount}?`);
                                  
                                  if (isConfirmed) {
                                    await onDeleteExpense(inst.id, true);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition cursor-pointer inline-block"
                                title="Excluir Parcela"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={onClose}
                className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition shadow-md shadow-slate-100 cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
