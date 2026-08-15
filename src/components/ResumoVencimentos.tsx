import React, { useState, useMemo } from 'react';
import { Expense, Member } from '../types';
import { calculateExpenseInterest, getLocalTodayStr } from '../utils/interest';
import { AlertTriangle, Clock, Check, Loader2, Calendar, User, ArrowRight, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ResumoVencimentosProps {
  expenses: Expense[];
  members: Member[];
  onUpdateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
  onNavigateTab: (tab: string) => void;
  hideValues?: boolean;
  onEditExpense?: (expense: Expense) => void;
  onClose?: () => void;
}

export default function ResumoVencimentos({
  expenses,
  members,
  onUpdateExpense,
  onNavigateTab,
  hideValues = false,
  onEditExpense,
  onClose
}: ResumoVencimentosProps) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const todayStr = useMemo(() => getLocalTodayStr(), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dy}`;
  }, []);

  // Filter and compute critical expenses: Unpaid & (Overdue or Due within the next 24 hours/tomorrow)
  const criticalExpenses = useMemo(() => {
    return expenses
      .filter(exp => {
        if (exp.recurringActive === false) return false;
        if (exp.isPaid) return false;
        // Due on or before tomorrow
        return exp.dueDate <= tomorrowStr;
      })
      .map(exp => {
        const expDate = new Date(exp.dueDate + 'T00:00:00');
        const today = new Date(todayStr + 'T00:00:00');
        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        const calc = calculateExpenseInterest(exp);

        return {
          ...exp,
          daysRemaining: diffDays,
          currentAmount: calc.currentAmount,
          isOverdue: diffDays < 0
        };
      })
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [expenses, todayStr, tomorrowStr]);

  const handleQuickPay = async (id: string) => {
    setSubmittingId(id);
    try {
      await onUpdateExpense(id, { isPaid: true });
    } catch (error) {
      console.error('Error marking expense as paid:', error);
    } finally {
      setSubmittingId(null);
    }
  };

  const overdueCount = useMemo(() => {
    return criticalExpenses.filter(e => e.daysRemaining < 0).length;
  }, [criticalExpenses]);

  const dueSoonCount = useMemo(() => {
    return criticalExpenses.filter(e => e.daysRemaining >= 0).length;
  }, [criticalExpenses]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" id="resumo-vencimentos-card">
      {/* Header Banner */}
      <div className="bg-slate-900 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="bg-rose-500/10 p-2 rounded-lg text-rose-400">
            <AlertTriangle size={20} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white tracking-wider uppercase font-display italic">
              Terminal de Vencimentos Críticos
            </h3>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">
              Monitoramento tático de faturas vencidas ou próximas de expirar (24h)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {criticalExpenses.length > 0 && (
            <div className="flex items-center gap-2">
              {overdueCount > 0 && (
                <span className="text-[10px] bg-rose-500/15 border border-rose-500/30 text-rose-400 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {overdueCount} {overdueCount === 1 ? 'Vencida' : 'Vencidas'}
                </span>
              )}
              {dueSoonCount > 0 && (
                <span className="text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-400 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {dueSoonCount} em 24h
                </span>
              )}
            </div>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="Ocultar Terminal de Vencimentos (Você pode reativar no topo do Dashboard)"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        <AnimatePresence mode="popLayout">
          {criticalExpenses.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center text-center py-8 space-y-3"
              id="resumo-vencimentos-all-clear"
            >
              <div className="bg-emerald-50 border border-dashed border-emerald-300 w-12 h-12 rounded-full flex items-center justify-center text-emerald-500 shadow-sm">
                <Sparkles size={20} className="animate-bounce" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">Protocolo em Dia!</h4>
                <p className="text-[11px] text-slate-500 max-w-sm mt-0.5">
                  Nenhuma despesa pendente está vencida ou vence nas próximas 24 horas. Operação segura e sem juros ativos.
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                {criticalExpenses.map((exp, idx) => {
                  const isOverdue = exp.daysRemaining < 0;
                  const isToday = exp.daysRemaining === 0;
                  const isTomorrow = exp.daysRemaining === 1;
                  
                  // Get responsible member name if third party vs personal
                  const ownerLabel = exp.type === 'third_party' 
                    ? `Terceiros (${members.find(m => m.id === exp.responsibleMemberId)?.name || 'Todos'})`
                    : 'Pessoal (Você)';

                  // Get formatted month name (e.g. Janeiro / 2025)
                  const [yStr, mStr] = exp.dueDate.split('-');
                  const monthNames = [
                    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
                    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
                  ];
                  const formattedMonthYear = `${monthNames[parseInt(mStr, 10) - 1]} / ${yStr}`;

                  return (
                    <motion.div
                      key={exp.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.2, delay: idx * 0.05 }}
                      onClick={() => {
                        if (onEditExpense) onEditExpense(exp);
                      }}
                      className={`flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border transition-all duration-200 cursor-pointer group ${
                        isOverdue
                          ? 'bg-rose-50/40 border-rose-200/60 hover:bg-rose-50/70 shadow-xs'
                          : isToday
                          ? 'bg-amber-50/40 border-amber-200/80 hover:bg-amber-50/70 shadow-xs'
                          : 'bg-amber-50/20 border-slate-200 hover:bg-amber-50/40'
                      }`}
                    >
                      {/* Left: Info and Status */}
                      <div className="flex items-start space-x-3 mb-3 md:mb-0">
                        {/* Status Tag Color Line */}
                        <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                          isOverdue ? 'bg-rose-500' : isToday ? 'bg-amber-500' : 'bg-yellow-400'
                        }`} />

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-xs text-slate-800 font-display uppercase tracking-tight group-hover:text-indigo-600 transition">
                              {exp.description}
                            </span>
                            
                            {/* Overdue/Due Status Badges */}
                            {isOverdue ? (
                              <span className="text-[9px] bg-rose-500 text-white font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Atrasado há {Math.abs(exp.daysRemaining)}d
                              </span>
                            ) : isToday ? (
                              <span className="text-[9px] bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Vence Hoje
                              </span>
                            ) : (
                              <span className="text-[9px] bg-yellow-400 text-slate-950 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Vence em 24h
                              </span>
                            )}

                            <span className="text-[9px] bg-slate-100 border border-slate-200 text-slate-500 font-semibold px-2 py-0.5 rounded">
                              {exp.category}
                            </span>

                            {/* Owner Badge */}
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                              exp.type === 'personal'
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-purple-50 border-purple-200 text-purple-700'
                            }`}>
                              {ownerLabel}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 font-medium pt-0.5">
                            <span className="flex items-center space-x-1 font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              <Calendar size={11} className="text-indigo-500" />
                              <span>Mês: {formattedMonthYear}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Clock size={11} className="text-slate-400" />
                              <span>Vencimento: {exp.dueDate.split('-').reverse().join('/')}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Price & Quick Action buttons */}
                      <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-2.5 md:pt-0 border-dashed border-slate-200">
                        <div className="text-left md:text-right">
                          <span className="block text-[8px] text-slate-400 uppercase tracking-widest font-black">Valor Atual</span>
                          <span 
                            className={`font-mono text-sm font-black transition-all duration-300 ${isOverdue ? 'text-rose-600' : 'text-slate-950'} ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`}
                            title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}
                          >
                            R$ {exp.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onEditExpense) onEditExpense(exp);
                          }}
                          className="px-2.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-black text-[10px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1 shadow-xs"
                          title="Ir diretamente para esta despesa no mês e aba correspondentes"
                        >
                          <span>Ver Despesa</span>
                          <ArrowRight size={11} />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickPay(exp.id);
                          }}
                          disabled={submittingId !== null}
                          className={`px-3 py-2 rounded-lg font-black text-[10px] uppercase tracking-wider transition duration-150 flex items-center space-x-1.5 shadow-sm hover:shadow cursor-pointer ${
                            isOverdue
                              ? 'bg-rose-600 hover:bg-rose-700 text-white disabled:bg-rose-400'
                              : 'bg-slate-900 hover:bg-slate-850 text-white disabled:bg-slate-700'
                          }`}
                        >
                          {submittingId === exp.id ? (
                            <>
                              <Loader2 size={12} className="animate-spin text-white" />
                              <span>Registrando...</span>
                            </>
                          ) : (
                            <>
                              <Check size={12} />
                              <span>Quitar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {criticalExpenses.length > 3 && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => onNavigateTab('atraso')}
                    className="text-xs font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <span>Ver todos os vencimentos no painel tático</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
