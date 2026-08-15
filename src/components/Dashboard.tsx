import React, { useState, useMemo } from 'react';
import { Expense, Member, Budget } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, AlertCircle, Calendar, CheckCircle, Users, Wallet, ChevronRight, Eye, EyeOff, BarChart3, Zap, ArrowRight, AlertTriangle, X } from 'lucide-react';
import ResumoVencimentos from './ResumoVencimentos';
import { User } from 'firebase/auth';
import { getLocalTodayStr } from '../utils/interest';

interface DashboardProps {
  expenses: Expense[];
  members: Member[];
  budgets: Budget[];
  currentMonth: string; // YYYY-MM
  onNavigateTab: (tab: string) => void;
  onUpdateExpense: (id: string, data: Partial<Expense>) => Promise<void>;
  user?: User | null;
  onEditExpense?: (expense: Expense) => void;
  hideValues?: boolean;
  onToggleHideValues?: () => void;
}

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function Dashboard({ 
  expenses, 
  members, 
  budgets, 
  currentMonth, 
  onNavigateTab, 
  onUpdateExpense, 
  user, 
  onEditExpense,
  hideValues: hideValuesProp,
  onToggleHideValues 
}: DashboardProps) {
  // Public mode state (hides/blurs sensitive values)
  const [localHideValues, setLocalHideValues] = useState(() => {
    return localStorage.getItem('hideSensitiveValues') === 'true';
  });

  const hideValues = hideValuesProp !== undefined ? hideValuesProp : localHideValues;

  // Critical due date terminal toggle state
  const [showCriticalTerminal, setShowCriticalTerminal] = useState(() => {
    return localStorage.getItem('showCriticalTerminal') === 'true';
  });

  const toggleHideValues = () => {
    if (onToggleHideValues) {
      onToggleHideValues();
    } else {
      setLocalHideValues(prev => {
        const newVal = !prev;
        localStorage.setItem('hideSensitiveValues', String(newVal));
        return newVal;
      });
    }
  };

  const toggleCriticalTerminal = () => {
    setShowCriticalTerminal(prev => {
      const newVal = !prev;
      localStorage.setItem('showCriticalTerminal', String(newVal));
      return newVal;
    });
  };

  // Count overdue/critical expenses
  const criticalCount = useMemo(() => {
    const todayStr = getLocalTodayStr();
    return expenses.filter(exp => !exp.isPaid && exp.dueDate <= todayStr).length;
  }, [expenses]);

  // Filter expenses for selected month (excluding paused recurring expenses)
  const monthlyExpenses = useMemo(() => {
    return expenses.filter(exp => exp.dueDate.startsWith(currentMonth) && exp.recurringActive !== false);
  }, [expenses, currentMonth]);

  // Totals
  const totals = useMemo(() => {
    let personalTotal = 0;
    let thirdPartyTotal = 0;
    monthlyExpenses.forEach(exp => {
      if (exp.type === 'personal') {
        personalTotal += exp.amount;
      } else {
        thirdPartyTotal += exp.amount;
      }
    });
    return {
      personal: personalTotal,
      thirdParty: thirdPartyTotal,
      total: personalTotal + thirdPartyTotal
    };
  }, [monthlyExpenses]);

  // Category chart data & budget comparison
  const categoryData = useMemo(() => {
    const categoriesMap: { [key: string]: { spent: number; budget: number } } = {};
    
    // Initialize with budgets
    budgets
      .filter(b => b.month === currentMonth)
      .forEach(b => {
        categoriesMap[b.category] = { spent: 0, budget: b.amount };
      });

    // Add spent values
    monthlyExpenses.forEach(exp => {
      if (!categoriesMap[exp.category]) {
        categoriesMap[exp.category] = { spent: 0, budget: 0 };
      }
      categoriesMap[exp.category].spent += exp.amount;
    });

    return Object.entries(categoriesMap).map(([category, data]) => ({
      category,
      gasto: parseFloat(data.spent.toFixed(2)),
      orcamento: parseFloat(data.budget.toFixed(2)),
    }));
  }, [monthlyExpenses, budgets, currentMonth]);

  // Donut chart for category share
  const donutData = useMemo(() => {
    const map: { [key: string]: number } = {};
    monthlyExpenses.forEach(exp => {
      map[exp.category] = (map[exp.category] || 0) + exp.amount;
    });
    return Object.entries(map).map(([name, value]) => ({
      name,
      value: parseFloat(value.toFixed(2))
    }));
  }, [monthlyExpenses]);

  // Recurring expenses in current month that are awaiting bill amount
  const expensesNeedingAmount = useMemo(() => {
    return monthlyExpenses.filter(e => e.needsAmount || (e.isVariableValue && e.amount === 0 && !e.isPaid));
  }, [monthlyExpenses]);

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Top Dashboard Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-black text-slate-900 tracking-tight font-display italic uppercase">
            Dashboard Executivo
          </h2>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-0.5">
            Visão consolidada e controle financeiro tático
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Terminal de Vencimentos Toggle Button */}
          <button
            onClick={toggleCriticalTerminal}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all duration-200 cursor-pointer ${
              showCriticalTerminal 
                ? 'bg-rose-600 border-rose-700 text-white shadow-sm shadow-rose-600/30' 
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
            title="Abrir o Terminal de Vencimentos Críticos"
            id="critical-terminal-toggle"
          >
            <AlertTriangle size={14} className={criticalCount > 0 ? 'text-rose-500 animate-pulse' : 'text-slate-500'} />
            <span>Terminal Crítico</span>
            {criticalCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-extrabold bg-rose-500 text-white rounded-full">
                {criticalCount}
              </span>
            )}
          </button>

          {/* Public view toggle switch */}
          <button
            onClick={toggleHideValues}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all duration-200 cursor-pointer ${
              hideValues 
                ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-sm' 
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
            id="public-mode-toggle"
            title="Alternar Modo Público (ocultar valores na tela)"
          >
            {hideValues ? (
              <>
                <EyeOff size={14} />
                <span>Modo Público: ON</span>
              </>
            ) : (
              <>
                <Eye size={14} />
                <span>Modo Público: OFF</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Banner for recurring expenses needing bill amount */}
      {expensesNeedingAmount.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs animate-slide-up">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
              <Zap size={20} className="animate-bounce" />
            </div>
            <div>
              <h4 className="text-sm font-black text-amber-950 leading-tight">
                {expensesNeedingAmount.length} {expensesNeedingAmount.length === 1 ? 'fatura recorrente aguardando o valor deste mês' : 'faturas recorrentes aguardando o valor deste mês'}!
              </h4>
              <p className="text-xs text-amber-900 font-medium mt-0.5">
                {expensesNeedingAmount.map(e => e.description).join(', ')}
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab && onNavigateTab('despesas')}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer shadow-sm shrink-0 flex items-center gap-1.5"
          >
            <span>Preencher Faturas</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Modal para Resumo de Vencimentos Críticos (Exibido ao clicar) */}
      {showCriticalTerminal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <div className="flex justify-between items-center pb-4 mb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="text-rose-500" size={20} />
                <h3 className="text-sm font-black text-white uppercase tracking-wider font-display">
                  Terminal de Vencimentos Críticos
                </h3>
              </div>
              <button 
                onClick={() => setShowCriticalTerminal(false)}
                className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
                title="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <ResumoVencimentos 
              expenses={expenses}
              members={members}
              onUpdateExpense={onUpdateExpense}
              onNavigateTab={onNavigateTab}
              hideValues={hideValues}
              onEditExpense={onEditExpense}
              onClose={() => setShowCriticalTerminal(false)}
            />
          </div>
        </div>
      )}

      {/* 1ª PARTE: Summary Cards Grid (Cards de valores logo na entrada) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6" id="summary-cards">
        {/* Card Total Pessoal */}
        <div 
          onClick={() => onNavigateTab('pessoais')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          title="Clique para ir para a página de Despesas Pessoais"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Wallet size={22} />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Saldo Pessoal ({currentMonth})</p>
                <h3 className={`text-2xl font-bold text-slate-900 font-display transition-all duration-300 mt-0.5 ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
                  R$ {totals.personal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
            </div>
            <div className="p-1.5 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 rounded-lg transition-colors">
              <ArrowRight size={16} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-xs">
            <span className="text-indigo-600 font-semibold">↑ Sincronizado</span>
            <span className="text-[11px] font-bold text-indigo-600 group-hover:underline flex items-center gap-1">
              Ver Pessoais <ChevronRight size={12} />
            </span>
          </div>
        </div>

        {/* Card Total Terceiros */}
        <div 
          onClick={() => onNavigateTab('terceiros')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          title="Clique para ir para a página de Despesas de Terceiros"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Users size={22} />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Despesas de Terceiros</p>
                <h3 className={`text-2xl font-bold text-slate-900 font-display transition-all duration-300 mt-0.5 ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
                  R$ {totals.thirdParty.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
            </div>
            <div className="p-1.5 text-slate-400 group-hover:text-emerald-600 group-hover:bg-emerald-50 rounded-lg transition-colors">
              <ArrowRight size={16} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-xs">
            <span className="text-emerald-600 font-semibold">↑ Rateio automático</span>
            <span className="text-[11px] font-bold text-emerald-600 group-hover:underline flex items-center gap-1">
              Ver Terceiros <ChevronRight size={12} />
            </span>
          </div>
        </div>

        {/* Card Total Geral / Consolidado */}
        <div 
          onClick={() => onNavigateTab('relatorio_anual')}
          className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
          title="Clique para ir para a Análise e Relatório Anual de Despesas"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 rounded-lg bg-slate-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <TrendingUp size={22} />
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Gasto Total Consolidado</p>
                <h3 className={`text-2xl font-bold text-indigo-600 font-display transition-all duration-300 mt-0.5 ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
                  R$ {totals.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </h3>
              </div>
            </div>
            <div className="p-1.5 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 rounded-lg transition-colors">
              <ArrowRight size={16} />
            </div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">Pessoal + Terceiros</span>
            <span className="text-[11px] font-bold text-indigo-600 group-hover:underline flex items-center gap-1">
              Ver Relatório Anual <ChevronRight size={12} />
            </span>
          </div>
        </div>
      </div>

      {/* GRAPHS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="graphs-grid">
        {/* Category Budget Comparison */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
          <h3 className="text-sm font-bold text-slate-900 mb-4 font-display uppercase tracking-wider">
            Gasto vs Orçamento por Categoria
          </h3>
          <div className="h-72">
            {categoryData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                Nenhuma despesa ou orçamento cadastrado para este mês.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="category" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip formatter={(value) => `R$ ${value}`} />
                  <Legend />
                  <Bar dataKey="gasto" name="Gasto Realizado" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="orcamento" name="Orçamento Previsto" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {hideValues && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-md z-10 flex flex-col items-center justify-center text-center p-4">
              <EyeOff size={28} className="text-slate-400 mb-2 animate-pulse" />
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Gráfico Oculto</p>
              <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-relaxed">
                Desative o <strong>Modo Público</strong> para reativar os detalhes analíticos visuais.
              </p>
            </div>
          )}
        </div>

        {/* Categories Distribution Donut Chart */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
          <h3 className="text-sm font-bold text-slate-900 mb-4 font-display uppercase tracking-wider">
            Distribuição de Gastos por Categoria
          </h3>
          <div className="h-72 flex flex-col md:flex-row items-center justify-center">
            {donutData.length === 0 ? (
              <div className="text-slate-400 text-sm">
                Nenhuma despesa para exibir no gráfico.
              </div>
            ) : (
              <>
                <div className="w-full md:w-1/2 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `R$ ${value}`} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full md:w-1/2 overflow-y-auto max-h-60 mt-4 md:mt-0 space-y-1 pl-4">
                  {donutData.map((item, index) => (
                    <div key={item.name} className="flex justify-between items-center text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="w-3 h-3 rounded-full block" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                        <span className="font-medium text-slate-700">{item.name}</span>
                      </div>
                      <span className={`font-mono text-slate-500 transition-all duration-300 ${hideValues ? 'blur-sm select-none hover:blur-none' : ''}`}>
                        R$ {item.value.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {hideValues && (
            <div className="absolute inset-0 bg-white/70 backdrop-blur-md z-10 flex flex-col items-center justify-center text-center p-4">
              <EyeOff size={28} className="text-slate-400 mb-2 animate-pulse" />
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Gráfico Oculto</p>
              <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-relaxed">
                Desative o <strong>Modo Público</strong> para reativar os detalhes analíticos visuais.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Banner do Relatório Anual (Último item da página) */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-indigo-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-500/20 rounded-xl border border-indigo-400/30 text-indigo-300 flex-shrink-0">
            <BarChart3 size={24} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 bg-indigo-900/80 px-2 py-0.5 rounded border border-indigo-700/50">
                Relatório Consolidado
              </span>
              <span className="text-xs text-slate-300 font-mono">Ano {currentMonth.split('-')[0]}</span>
            </div>
            <h3 className="text-base font-black text-white font-display mt-0.5">
              Análise & Relatório Anual de Despesas
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Veja o total acumulado do ano, onde você mais gastou, ranking por categoria e quem gastou mais.
            </p>
          </div>
        </div>
        <button
          onClick={() => onNavigateTab('relatorio_anual')}
          className="w-full md:w-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-lg flex items-center justify-center space-x-2 cursor-pointer flex-shrink-0 border border-indigo-400/30"
        >
          <span>Abrir Relatório Anual</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

