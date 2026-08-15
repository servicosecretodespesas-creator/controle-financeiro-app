import React, { useState, useMemo } from 'react';
import { Expense, Member } from '../types';
import { calculateExpenseInterest, InterestCalculation, getLocalTodayStr } from '../utils/interest';
import { AlertCircle, Calendar, Check, Clock, DollarSign, Edit2, Play, Plus, RefreshCw, Settings, ShieldAlert, Trash2, User, Users } from 'lucide-react';

interface OverdueTabProps {
  expenses: Expense[];
  members: Member[];
  onUpdateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
  onDeleteExpense: (id: string, skipConfirm?: boolean) => Promise<void>;
  customConfirm?: (title: string, message: string) => Promise<boolean>;
  onEditExpense?: (expense: Expense) => void;
  hideValues?: boolean;
}

export default function OverdueTab({
  expenses,
  members,
  onUpdateExpense,
  onDeleteExpense,
  customConfirm,
  onEditExpense,
  hideValues = false
}: OverdueTabProps) {
  // Filters
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<'pending' | 'paid' | 'all'>('pending');

  // Modal states
  const [interestConfigExpense, setInterestConfigExpense] = useState<Expense | null>(null);
  const [manualInterestExpense, setManualInterestExpense] = useState<Expense | null>(null);

  // Interest Config form values
  const [dailyType, setDailyType] = useState<'none' | 'fixed' | 'percentage'>('none');
  const [dailyValue, setDailyValue] = useState<string>('');

  // Manual Interest form values
  const [manualType, setManualType] = useState<'fixed' | 'percentage'>('percentage');
  const [manualValue, setManualValue] = useState<string>('');

  // Calculate interest details for all expenses
  const expensesWithInterest = useMemo(() => {
    return expenses.map(exp => {
      const calc = calculateExpenseInterest(exp);
      return {
        expense: exp,
        calc
      };
    });
  }, [expenses]);

  // Filtered list of items
  const overdueItems = useMemo(() => {
    return expensesWithInterest.filter(({ expense, calc }) => {
      // Must be overdue (has overdue days or was paid past due date)
      const hasAtraso = calc.daysOverdue > 0 || (expense.paidAt && expense.paidAt > expense.dueDate);
      if (!hasAtraso) return false;

      // Member filter
      if (selectedMemberId !== 'all') {
        if (selectedMemberId === 'personal') {
          if (expense.type !== 'personal') return false;
        } else {
          if (expense.responsibleMemberId !== selectedMemberId) return false;
        }
      }

      // Status filter
      if (filterStatus === 'pending' && expense.isPaid) return false;
      if (filterStatus === 'paid' && !expense.isPaid) return false;

      return true;
    });
  }, [expensesWithInterest, selectedMemberId, filterStatus]);

  // Aggregate stats
  const stats = useMemo(() => {
    // Filter active/pending overdue items
    const activeOverdue = expensesWithInterest.filter(({ expense, calc }) => !expense.isPaid && calc.daysOverdue > 0);
    // Filter paid overdue items
    const paidOverdue = expensesWithInterest.filter(({ expense, calc }) => expense.isPaid && (expense.paidAt && expense.paidAt > expense.dueDate));

    const totalOriginalPending = activeOverdue.reduce((sum, item) => sum + item.calc.originalAmount, 0);
    const totalCurrentPending = activeOverdue.reduce((sum, item) => sum + item.calc.currentAmount, 0);
    const totalInterestPending = activeOverdue.reduce((sum, item) => sum + item.calc.dailyInterest + item.calc.manualInterest + (item.calc.autoOnceInterest || 0), 0);

    const totalOriginalPaid = paidOverdue.reduce((sum, item) => sum + item.calc.originalAmount, 0);
    const totalCurrentPaid = paidOverdue.reduce((sum, item) => sum + item.calc.currentAmount, 0);
    const totalInterestPaid = paidOverdue.reduce((sum, item) => sum + item.calc.dailyInterest + item.calc.manualInterest + (item.calc.autoOnceInterest || 0), 0);

    return {
      pendingCount: activeOverdue.length,
      paidCount: paidOverdue.length,
      totalOriginalPending,
      totalCurrentPending,
      totalInterestPending,
      totalOriginalPaid,
      totalCurrentPaid,
      totalInterestPaid
    };
  }, [expensesWithInterest]);

  // Individual breakdown statistics
  const memberStatsBreakdown = useMemo(() => {
    const map: {
      [key: string]: {
        name: string;
        pendingCount: number;
        paidCount: number;
        originalPending: number;
        currentPending: number;
        interestPending: number;
        currentPaid: number;
        interestPaid: number;
      };
    } = {};

    // Initialize map
    map['personal'] = {
      name: 'Pessoal (Você)',
      pendingCount: 0,
      paidCount: 0,
      originalPending: 0,
      currentPending: 0,
      interestPending: 0,
      currentPaid: 0,
      interestPaid: 0
    };

    members.forEach(m => {
      map[m.id] = {
        name: m.name,
        pendingCount: 0,
        paidCount: 0,
        originalPending: 0,
        currentPending: 0,
        interestPending: 0,
        currentPaid: 0,
        interestPaid: 0
      };
    });

    expensesWithInterest.forEach(({ expense, calc }) => {
      const isAtrasado = calc.daysOverdue > 0 || (expense.paidAt && expense.paidAt > expense.dueDate);
      if (!isAtrasado) return;

      const key = expense.type === 'personal' ? 'personal' : (expense.responsibleMemberId || 'all');
      
      const interestAmount = calc.dailyInterest + calc.manualInterest + (calc.autoOnceInterest || 0);

      if (key === 'all') {
        // Divided with all group members equally
        const shareOriginal = calc.originalAmount / (members.length || 1);
        const shareCurrent = calc.currentAmount / (members.length || 1);
        const shareInterest = interestAmount / (members.length || 1);

        members.forEach(m => {
          if (map[m.id]) {
            if (expense.isPaid) {
              map[m.id].paidCount += 1;
              map[m.id].currentPaid += shareCurrent;
              map[m.id].interestPaid += shareInterest;
            } else {
              map[m.id].pendingCount += 1;
              map[m.id].originalPending += shareOriginal;
              map[m.id].currentPending += shareCurrent;
              map[m.id].interestPending += shareInterest;
            }
          }
        });
      } else {
        if (map[key]) {
          if (expense.isPaid) {
            map[key].paidCount += 1;
            map[key].currentPaid += calc.currentAmount;
            map[key].interestPaid += interestAmount;
          } else {
            map[key].pendingCount += 1;
            map[key].originalPending += calc.originalAmount;
            map[key].currentPending += calc.currentAmount;
            map[key].interestPending += interestAmount;
          }
        }
      }
    });

    return Object.entries(map).map(([id, stats]) => ({
      id,
      ...stats
    })).filter(item => item.pendingCount > 0 || item.paidCount > 0);
  }, [expensesWithInterest, members]);

  // Handle saving interest automation configuration
  const handleSaveAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!interestConfigExpense) return;

    const val = parseFloat(dailyValue);
    if (dailyType !== 'none' && (isNaN(val) || val <= 0)) {
      alert("Por favor, insira um valor de juros diário válido.");
      return;
    }

    try {
      await onUpdateExpense(interestConfigExpense.id, {
        dailyInterestType: dailyType,
        dailyInterestValue: dailyType === 'none' ? 0 : val,
        originalAmount: interestConfigExpense.originalAmount ?? interestConfigExpense.amount
      });
      setInterestConfigExpense(null);
    } catch (err) {
      alert("Erro ao salvar configuração.");
    }
  };

  // Open Automation Modal
  const openAutomationModal = (exp: Expense) => {
    setInterestConfigExpense(exp);
    setDailyType(exp.dailyInterestType || 'none');
    setDailyValue((exp.dailyInterestValue || '').toString());
  };

  // Handle manual interest capitalization
  const handleSaveManualInterest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInterestExpense) return;

    const val = parseFloat(manualValue);
    if (isNaN(val) || val <= 0) {
      alert("Por favor, insira uma taxa ou valor válido.");
      return;
    }

    const original = manualInterestExpense.originalAmount ?? manualInterestExpense.amount;
    let addedAmount = 0;

    if (manualType === 'percentage') {
      addedAmount = (val / 100) * original;
    } else {
      addedAmount = val;
    }

    const currentManualApplied = manualInterestExpense.manualInterestApplied ?? 0;
    const newManualApplied = currentManualApplied + addedAmount;
    
    // Calculate new total amount for compatibility
    const newAmount = parseFloat((original + newManualApplied).toFixed(2));

    try {
      await onUpdateExpense(manualInterestExpense.id, {
        manualInterestApplied: newManualApplied,
        originalAmount: original,
        amount: newAmount // updates current amount to base + manual
      });
      setManualInterestExpense(null);
      setManualValue('');
    } catch (err) {
      alert("Erro ao aplicar juros manual.");
    }
  };

  // Open Manual Interest Modal
  const openManualInterestModal = (exp: Expense) => {
    setManualInterestExpense(exp);
    setManualType('percentage');
    setManualValue('');
  };

  // Mark Overdue as Paid
  const handleMarkAsPaid = async (exp: Expense) => {
    const calc = calculateExpenseInterest(exp);
    const confirmPay = customConfirm 
      ? await customConfirm("Marcar Conta como Paga", `Deseja marcar esta conta em atraso como paga com o valor atualizado de R$ ${calc.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}?`)
      : window.confirm(`Deseja marcar esta conta em atraso como paga com o valor atualizado de R$ ${calc.currentAmount}?`);

    if (!confirmPay) return;

    try {
      await onUpdateExpense(exp.id, {
        isPaid: true,
        paidAt: getLocalTodayStr(),
        amount: calc.currentAmount, // freeze dynamic interest at payment time
        originalAmount: calc.originalAmount,
        manualInterestApplied: calc.manualInterest
      });
    } catch (err) {
      alert("Erro ao atualizar despesa.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 font-display flex items-center gap-2">
          <ShieldAlert className="text-rose-600" size={24} /> Contas em Atraso & Juros
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Monitore membros em atraso, automatize juros diários ou capitalizações manuais e acompanhe históricos de quitação
        </p>
      </div>

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Ativas em atraso */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-rose-500 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Pendentes em Atraso</span>
            <h4 className={`text-lg font-bold text-rose-600 font-mono transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.totalCurrentPending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            <span className="text-[10px] text-slate-400 font-medium block">
              {stats.pendingCount} contas aguardando quitação
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertCircle size={16} />
          </div>
        </div>

        {/* Juros Acumulados Pendentes */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-amber-500 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Juros Acumulados</span>
            <h4 className={`text-lg font-bold text-amber-600 font-mono transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.totalInterestPending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            <span className={`text-[10px] text-slate-400 font-medium block transition-all ${hideValues ? 'blur-xs select-none hover:blur-none' : ''}`}>
              Orig.: R$ {stats.totalOriginalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-500">
            <RefreshCw size={16} className="animate-spin-slow" />
          </div>
        </div>

        {/* Quitadas com Juros */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-emerald-500 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Total Pago em Atraso</span>
            <h4 className={`text-lg font-bold text-emerald-600 font-mono transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.totalCurrentPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            <span className="text-[10px] text-slate-400 font-medium block">
              {stats.paidCount} contas pagas após o vencimento
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Check size={16} />
          </div>
        </div>

        {/* Juros Arrecadados */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-indigo-500 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Juros Pagos em Atraso</span>
            <h4 className={`text-lg font-bold text-indigo-600 font-mono transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.totalInterestPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            <span className="text-[10px] text-slate-400 font-medium block">
              De R$ {stats.totalOriginalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em contas originais
            </span>
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <DollarSign size={16} />
          </div>
        </div>
      </div>

      {/* Main Breakdown Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Filters & Member Stats Card */}
        <div className="lg:col-span-1 space-y-6">
          {/* Controls Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">Filtros & Navegação</h3>
            
            {/* Filter Member */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Membro Associado</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">Todos os Membros</option>
                <option value="personal">Pessoal (Você)</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* Filter Status */}
            <div className="flex flex-col space-y-1.5">
              <label className="text-xs font-semibold text-slate-600">Status do Atraso</label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setFilterStatus('pending')}
                  className={`py-1.5 px-2 text-center rounded text-[10px] font-bold tracking-wide uppercase transition cursor-pointer ${
                    filterStatus === 'pending' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Pendentes
                </button>
                <button
                  onClick={() => setFilterStatus('paid')}
                  className={`py-1.5 px-2 text-center rounded text-[10px] font-bold tracking-wide uppercase transition cursor-pointer ${
                    filterStatus === 'paid' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Quitados
                </button>
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`py-1.5 px-2 text-center rounded text-[10px] font-bold tracking-wide uppercase transition cursor-pointer ${
                    filterStatus === 'all' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>
          </div>

          {/* Members individual ranking table */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display flex items-center gap-1.5">
              <Users size={14} className="text-indigo-500" /> Resumo Individual de Membros
            </h3>

            {memberStatsBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-4">Nenhum membro com contas vencidas.</p>
            ) : (
              <div className="space-y-3">
                {memberStatsBreakdown.map(m => (
                  <div key={m.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                        <User size={12} className="text-slate-400" /> {m.name}
                      </span>
                      <span className="text-[10px] font-bold bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded">
                        {m.pendingCount} pendente(s)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div>
                        <span className="text-slate-400 block font-medium">Juros Gerados (Falta Pagar)</span>
                        <span className="font-bold font-mono text-amber-600">
                          R$ {m.interestPending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-medium">Juros Pagos (Atraso)</span>
                        <span className="font-bold font-mono text-emerald-600">
                          R$ {m.interestPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Overdue Transactions Table List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Registros de Contas Atrasadas ({overdueItems.length})
              </h3>
            </div>

            {overdueItems.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <AlertCircle className="mx-auto text-slate-300" size={32} />
                <p className="text-xs">Nenhum registro de atraso coincide com os filtros aplicados.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {overdueItems.map(({ expense: exp, calc }) => {
                  const respMemberName = exp.type === 'personal'
                    ? 'Pessoal (Você)'
                    : exp.responsibleMemberId === 'all'
                    ? 'Todos (Dividido)'
                    : members.find(m => m.id === exp.responsibleMemberId)?.name || 'Membro';

                  return (
                    <div 
                      key={exp.id} 
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button') || target.closest('input') || target.closest('svg') || target.closest('.cursor-pointer')) {
                          return;
                        }
                        if (onEditExpense) onEditExpense(exp);
                      }}
                      className="p-6 hover:bg-slate-50/50 transition flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs cursor-pointer"
                    >
                      {/* Left Block: Description, Member, Overdue days */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900 truncate block">{exp.description}</span>
                          <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-semibold">
                            {exp.category}
                          </span>
                          {!exp.isPaid ? (
                            <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold animate-pulse inline-flex items-center gap-1 border border-rose-200">
                              <Clock size={10} /> {calc.daysOverdue} dias atrasado
                            </span>
                          ) : (
                            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold inline-flex items-center gap-1 border border-emerald-200">
                              <Check size={10} /> {
                                (calc.dailyInterest + calc.manualInterest + (calc.autoOnceInterest || 0)) > 0 
                                  ? "Quitada com Juros" 
                                  : "Quitada em Atraso"
                              }
                            </span>
                          )}
                        </div>

                        {/* Metadata line */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <User size={12} className="text-slate-400" /> {respMemberName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} className="text-slate-400" /> Venceu: {exp.dueDate.split('-').reverse().join('/')}
                          </span>
                          {exp.isPaid && exp.paidAt && (
                            <span className="text-emerald-600 font-bold">
                              Pago em: {exp.paidAt.split('-').reverse().join('/')}
                            </span>
                          )}
                        </div>

                        {/* Automation details badge */}
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-semibold bg-slate-50 border border-slate-200/50 p-1.5 rounded-lg w-fit">
                          <Settings size={10} className="text-slate-400" />
                          {exp.dailyInterestType && exp.dailyInterestType !== 'none' ? (
                            <span>
                              Automação: +{exp.dailyInterestValue}
                              {exp.dailyInterestType === 'percentage' ? '%' : ' R$'} por dia após vencimento
                            </span>
                          ) : exp.interestType && exp.interestType !== 'none' ? (
                            <span>
                              Automação: Taxa única de +{exp.interestValue}
                              {exp.interestType === 'percentage' ? '%' : ' R$'} ao vencer
                            </span>
                          ) : (
                            <span className="text-slate-400">Juros automáticos desativados</span>
                          )}
                        </div>
                      </div>

                      {/* Middle Block: Original, Interest, Current Amounts */}
                      <div className="flex gap-4 border-l border-slate-100 pl-4 md:border-l-0 md:pl-0 font-mono">
                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 font-bold uppercase block">Valor Original</span>
                          <span className="text-slate-500 line-through">
                            R$ {calc.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] text-slate-400 font-bold uppercase block">Juros Acumulados</span>
                          <span className="text-amber-600 font-bold">
                            +R$ {(calc.dailyInterest + calc.manualInterest + (calc.autoOnceInterest || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[9px] text-indigo-500 font-bold uppercase block">Valor Final</span>
                          <span className="text-slate-900 font-bold text-sm">
                            R$ {calc.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>

                      {/* Right Block: Actions */}
                      <div className="flex flex-row md:flex-col justify-end gap-1.5 md:min-w-[120px]">
                        {!exp.isPaid && (
                          <button
                            onClick={() => handleMarkAsPaid(exp)}
                            className="flex-1 md:w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition text-[10px] cursor-pointer"
                          >
                            <Check size={12} /> Quitar
                          </button>
                        )}
                        
                        <button
                          onClick={() => openManualInterestModal(exp)}
                          className="flex-1 md:w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition text-[10px] cursor-pointer border border-indigo-200"
                        >
                          <Plus size={12} /> Juros Manual
                        </button>

                        <button
                          onClick={() => openAutomationModal(exp)}
                          className="flex-1 md:w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold rounded-lg transition text-[10px] cursor-pointer border border-slate-200"
                        >
                          <Settings size={12} /> Automação
                        </button>

                        {onEditExpense && (
                          <button
                            onClick={() => onEditExpense(exp)}
                            className="flex-1 md:w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition text-[10px] cursor-pointer border border-slate-300"
                            title="Editar esta despesa"
                          >
                            <Edit2 size={12} /> Editar
                          </button>
                        )}

                        <button
                          onClick={async () => {
                            const isConfirmed = customConfirm
                              ? await customConfirm("Excluir Conta em Atraso", `Tem certeza que deseja excluir permanentemente a conta "${exp.description}" (${exp.dueDate.split('-').reverse().join('/')})?`)
                              : confirm(`Tem certeza que deseja excluir permanentemente a conta "${exp.description}"?`);
                            if (isConfirmed) {
                              await onDeleteExpense(exp.id);
                            }
                          }}
                          className="flex-1 md:w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg transition text-[10px] cursor-pointer border border-rose-200"
                          title="Excluir despesa do banco de dados"
                        >
                          <Trash2 size={12} /> Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 1. Modal for Auto Daily Interest configuration */}
      {interestConfigExpense && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-100 shadow-2xl overflow-hidden flex flex-col animate-fade-in">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 font-display flex items-center gap-1.5">
                <Settings size={16} className="text-indigo-600" /> Automação de Juros Diários
              </h3>
              <button onClick={() => setInterestConfigExpense(null)} className="text-slate-400 hover:text-slate-600">
                <AlertCircle size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveAutomation} className="p-6 space-y-4 text-xs">
              <p className="text-slate-500 font-medium">
                Configure os juros que serão aplicados automaticamente por dia caso a conta passe da data de vencimento.
              </p>

              {/* Automation Type Select */}
              <div className="flex flex-col space-y-1.5">
                <label className="font-semibold text-slate-600">Tipo de Cobrança</label>
                <select
                  value={dailyType}
                  onChange={(e) => setDailyType(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="none">Desativado</option>
                  <option value="percentage">Porcentagem por Dia (%)</option>
                  <option value="fixed">Valor Fixo por Dia (R$)</option>
                </select>
              </div>

              {/* Value Input */}
              {dailyType !== 'none' && (
                <div className="flex flex-col space-y-1.5 animate-slide-up">
                  <label className="font-semibold text-slate-600">
                    {dailyType === 'percentage' ? 'Taxa Diária (%)' : 'Valor Fixo Diário (R$)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder={dailyType === 'percentage' ? 'Ex: 1' : 'Ex: 2.00'}
                    value={dailyValue}
                    onChange={(e) => setDailyValue(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setInterestConfigExpense(null)}
                  className="px-4 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal for Manual Capitalization */}
      {manualInterestExpense && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm border border-slate-100 shadow-2xl overflow-hidden flex flex-col animate-fade-in">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 font-display flex items-center gap-1.5">
                <Plus size={16} className="text-indigo-600" /> Aplicar Juros Manual
              </h3>
              <button onClick={() => setManualInterestExpense(null)} className="text-slate-400 hover:text-slate-600">
                <AlertCircle size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveManualInterest} className="p-6 space-y-4 text-xs">
              <p className="text-slate-500 font-medium">
                Adicione um valor ou multa de juros de forma imediata (uma única vez) no saldo devedor desta conta.
              </p>

              {/* Manual Type Select */}
              <div className="flex flex-col space-y-1.5">
                <label className="font-semibold text-slate-600">Forma do Juros</label>
                <select
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="percentage">Porcentagem (%)</option>
                  <option value="fixed">Valor Fixo (R$)</option>
                </select>
              </div>

              {/* Value Input */}
              <div className="flex flex-col space-y-1.5">
                <label className="font-semibold text-slate-600">
                  {manualType === 'percentage' ? 'Alíquota de Juros (%)' : 'Valor da Multa / Taxa (R$)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder={manualType === 'percentage' ? 'Ex: 10' : 'Ex: 15.00'}
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800"
                />
              </div>

              <span className="text-[10px] text-slate-500 block leading-relaxed">
                * O valor final será atualizado somando o Saldo Devedor original mais o juros/multa aplicados agora.
              </span>

              <div className="flex justify-end space-x-2 pt-4">
                <button
                  type="button"
                  onClick={() => setManualInterestExpense(null)}
                  className="px-4 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition"
                >
                  Aplicar Juros
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
