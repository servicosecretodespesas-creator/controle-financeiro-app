import React, { useState, useMemo } from 'react';
import { Expense, Member } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  CartesianGrid,
  Legend
} from 'recharts';
import { 
  BarChart3, 
  Calendar, 
  Award, 
  TrendingUp, 
  Users, 
  Wallet, 
  CheckCircle2, 
  Clock, 
  Download, 
  Tag, 
  DollarSign, 
  Search,
  ChevronDown,
  Layers,
  ArrowUpRight,
  UserCheck
} from 'lucide-react';

interface RelatorioAnualTabProps {
  expenses: Expense[];
  members: Member[];
  categoriesList?: string[];
  hideValues?: boolean;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MONTH_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4'];

export default function RelatorioAnualTab({ expenses, members, hideValues = false }: RelatorioAnualTabProps) {
  // Available years from expenses or current year
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    const currentYr = new Date().getFullYear().toString();
    yearsSet.add(currentYr);

    expenses.forEach(exp => {
      if (exp.dueDate) {
        const yr = exp.dueDate.split('-')[0];
        if (yr && yr.length === 4) {
          yearsSet.add(yr);
        }
      }
    });

    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return new Date().getFullYear().toString();
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'third_party'>('all');

  // Filter expenses for selected year
  const yearExpenses = useMemo(() => {
    return expenses.filter(exp => exp.dueDate && exp.dueDate.startsWith(selectedYear));
  }, [expenses, selectedYear]);

  // Overall Totals for the Year
  const yearTotals = useMemo(() => {
    let personalTotal = 0;
    let thirdPartyTotal = 0;
    let paidTotal = 0;
    let pendingTotal = 0;

    yearExpenses.forEach(exp => {
      if (exp.type === 'personal') {
        personalTotal += exp.amount;
      } else {
        thirdPartyTotal += exp.amount;
      }

      if (exp.isPaid) {
        paidTotal += exp.amount;
      } else {
        pendingTotal += exp.amount;
      }
    });

    const grandTotal = personalTotal + thirdPartyTotal;

    return {
      personal: personalTotal,
      thirdParty: thirdPartyTotal,
      grandTotal,
      paidTotal,
      pendingTotal,
      count: yearExpenses.length
    };
  }, [yearExpenses]);

  // Category Breakdown for the Year
  const categoryRanking = useMemo(() => {
    const catMap: { [key: string]: { total: number; count: number; paid: number } } = {};

    yearExpenses.forEach(exp => {
      const cat = exp.category || 'Outros';
      if (!catMap[cat]) {
        catMap[cat] = { total: 0, count: 0, paid: 0 };
      }
      catMap[cat].total += exp.amount;
      catMap[cat].count += 1;
      if (exp.isPaid) catMap[cat].paid += exp.amount;
    });

    const result = Object.entries(catMap).map(([category, data]) => ({
      category,
      total: data.total,
      count: data.count,
      paid: data.paid,
      percentage: yearTotals.grandTotal > 0 ? (data.total / yearTotals.grandTotal) * 100 : 0
    }));

    result.sort((a, b) => b.total - a.total);
    return result;
  }, [yearExpenses, yearTotals.grandTotal]);

  // Top Category
  const topCategory = categoryRanking[0] || null;

  // Member / Person Spending Breakdown for the Year
  const memberRanking = useMemo(() => {
    const memberMap: { [key: string]: { name: string; total: number; count: number; personal: number; thirdParty: number } } = {};

    // Initialize with known members
    members.forEach(m => {
      memberMap[m.id] = { name: m.name, total: 0, count: 0, personal: 0, thirdParty: 0 };
    });

    // Special key for 'all' (Dividido por Todos)
    memberMap['all'] = { name: 'Todos (Dividido Igualmente)', total: 0, count: 0, personal: 0, thirdParty: 0 };

    yearExpenses.forEach(exp => {
      if (exp.type === 'personal') {
        // Personal expense attributed to current user/owner
        const key = 'personal_user';
        if (!memberMap[key]) {
          memberMap[key] = { name: 'Você (Pessoal)', total: 0, count: 0, personal: 0, thirdParty: 0 };
        }
        memberMap[key].total += exp.amount;
        memberMap[key].personal += exp.amount;
        memberMap[key].count += 1;
      } else {
        const respId = exp.responsibleMemberId || 'all';
        if (!memberMap[respId]) {
          memberMap[respId] = { name: 'Outro/Desconhecido', total: 0, count: 0, personal: 0, thirdParty: 0 };
        }
        memberMap[respId].total += exp.amount;
        memberMap[respId].thirdParty += exp.amount;
        memberMap[respId].count += 1;
      }
    });

    const result = Object.entries(memberMap)
      .map(([id, data]) => ({
        id,
        name: data.name,
        total: data.total,
        count: data.count,
        personal: data.personal,
        thirdParty: data.thirdParty,
        percentage: yearTotals.grandTotal > 0 ? (data.total / yearTotals.grandTotal) * 100 : 0
      }))
      .filter(item => item.total > 0);

    result.sort((a, b) => b.total - a.total);
    return result;
  }, [yearExpenses, members, yearTotals.grandTotal]);

  // Top Spender Person
  const topMember = memberRanking[0] || null;

  // Monthly Evolution Data (12 Months)
  const monthlyData = useMemo(() => {
    const monthsArr = Array.from({ length: 12 }, (_, i) => {
      const monthNum = String(i + 1).padStart(2, '0');
      const key = `${selectedYear}-${monthNum}`;
      return {
        monthKey: key,
        monthName: MONTH_SHORT[i],
        fullName: MONTH_NAMES[i],
        pessoal: 0,
        terceiros: 0,
        total: 0,
        paidCount: 0,
        totalCount: 0
      };
    });

    yearExpenses.forEach(exp => {
      const expMonth = exp.dueDate.substring(0, 7); // YYYY-MM
      const mIndex = parseInt(exp.dueDate.split('-')[1], 10) - 1;

      if (mIndex >= 0 && mIndex < 12) {
        if (exp.type === 'personal') {
          monthsArr[mIndex].pessoal += exp.amount;
        } else {
          monthsArr[mIndex].terceiros += exp.amount;
        }
        monthsArr[mIndex].total += exp.amount;
        monthsArr[mIndex].totalCount += 1;
        if (exp.isPaid) monthsArr[mIndex].paidCount += 1;
      }
    });

    return monthsArr;
  }, [yearExpenses, selectedYear]);

  // Single Highest Expense of the Year
  const highestExpense = useMemo(() => {
    if (yearExpenses.length === 0) return null;
    return [...yearExpenses].sort((a, b) => b.amount - a.amount)[0];
  }, [yearExpenses]);

  // Filtered expenses list for table view
  const filteredTableExpenses = useMemo(() => {
    return yearExpenses.filter(exp => {
      const matchSearch = exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchType = filterType === 'all' || exp.type === filterType;
      return matchSearch && matchType;
    });
  }, [yearExpenses, searchTerm, filterType]);

  const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Export CSV Report
  const handleExportCSV = () => {
    if (yearExpenses.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Ano;Data Vencimento;Descrição;Categoria;Tipo;Valor;Status;Responsável\n";

    yearExpenses.forEach(exp => {
      const ownerName = exp.type === 'personal'
        ? 'Pessoal'
        : (exp.responsibleMemberId === 'all'
          ? 'Todos (Dividido)'
          : (members.find(m => m.id === exp.responsibleMemberId)?.name || 'Outro'));

      const line = [
        selectedYear,
        exp.dueDate,
        `"${exp.description.replace(/"/g, '""')}"`,
        `"${exp.category}"`,
        exp.type === 'personal' ? 'Pessoal' : 'Terceiros',
        exp.amount.toFixed(2).replace('.', ','),
        exp.isPaid ? 'Pago' : 'Pendente',
        `"${ownerName}"`
      ].join(';');

      csvContent += line + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Relatorio_Anual_Financas_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8 animate-fadeIn pb-12">
      {/* Top Header & Year Selector */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 md:p-8 text-white shadow-2xl border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/30">
                <BarChart3 size={24} />
              </span>
              <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 font-mono">
                Consolidado Financeiro
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black font-display tracking-tight text-white">
              Relatório Anual de Despesas
            </h1>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Análise detalhada de todos os seus gastos por ano: veja onde você mais gastou, quem gastou mais e a evolução dos seus custos.
            </p>
          </div>

          {/* Year Dropdown & Export */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Ano do Relatório
              </label>
              <div className="relative">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="appearance-none bg-slate-800/90 hover:bg-slate-800 text-white font-bold text-lg px-5 py-3 pr-10 rounded-2xl border border-slate-700/80 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer shadow-lg transition"
                >
                  {availableYears.map(yr => (
                    <option key={yr} value={yr} className="bg-slate-900 text-white">
                      Ano {yr}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            <button
              onClick={handleExportCSV}
              disabled={yearExpenses.length === 0}
              className="mt-5 md:mt-0 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-2xl shadow-lg transition flex items-center space-x-2 cursor-pointer border border-emerald-500/30"
              title="Baixar Relatório em Planilha CSV"
            >
              <Download size={16} />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Total do Ano */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Geral ({selectedYear})
            </span>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <DollarSign size={20} />
            </div>
          </div>
          <div className={`text-2xl md:text-3xl font-black text-slate-900 dark:text-white font-display transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
            {formatCurrency(yearTotals.grandTotal)}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center space-x-1">
            <span>{yearTotals.count} despesas cadastradas no ano</span>
          </p>
        </div>

        {/* Pessoais vs Terceiros */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Divisão por Tipo
            </span>
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 rounded-xl">
              <Wallet size={20} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> Pessoais:
              </span>
              <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(yearTotals.personal)}</span>
            </div>
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Terceiros:
              </span>
              <span className="font-bold text-slate-900 dark:text-white">{formatCurrency(yearTotals.thirdParty)}</span>
            </div>
          </div>
          {yearTotals.grandTotal > 0 && (
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-3 overflow-hidden flex">
              <div 
                style={{ width: `${(yearTotals.personal / yearTotals.grandTotal) * 100}%` }} 
                className="bg-indigo-500 h-full"
                title={`Pessoais: ${((yearTotals.personal / yearTotals.grandTotal) * 100).toFixed(1)}%`}
              />
              <div 
                style={{ width: `${(yearTotals.thirdParty / yearTotals.grandTotal) * 100}%` }} 
                className="bg-emerald-500 h-full"
                title={`Terceiros: ${((yearTotals.thirdParty / yearTotals.grandTotal) * 100).toFixed(1)}%`}
              />
            </div>
          )}
        </div>

        {/* Onde Mais Gastou (Top Categoria) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Onde Mais Gastou
            </span>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 rounded-xl">
              <Award size={20} />
            </div>
          </div>
          {topCategory ? (
            <div>
              <div className="text-lg font-bold text-slate-900 dark:text-white truncate" title={topCategory.category}>
                {topCategory.category}
              </div>
              <div className="text-xl font-black text-amber-600 dark:text-amber-400 font-display mt-0.5">
                {formatCurrency(topCategory.total)}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Representa <strong className="text-slate-800 dark:text-slate-200">{topCategory.percentage.toFixed(1)}%</strong> de todos os gastos de {selectedYear}.
              </p>
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">Nenhuma despesa em {selectedYear}.</div>
          )}
        </div>

        {/* Quem Gastou Mais (Top Responsável) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Quem Gastou Mais
            </span>
            <div className="p-2.5 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 rounded-xl">
              <UserCheck size={20} />
            </div>
          </div>
          {topMember ? (
            <div>
              <div className="text-lg font-bold text-slate-900 dark:text-white truncate" title={topMember.name}>
                {topMember.name}
              </div>
              <div className="text-xl font-black text-purple-600 dark:text-purple-400 font-display mt-0.5">
                {formatCurrency(topMember.total)}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {topMember.count} despesa(s) ({topMember.percentage.toFixed(1)}% do total do ano).
              </p>
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">Sem registros de membros em {selectedYear}.</div>
          )}
        </div>
      </div>

      {/* Evolution Chart (Evolução Mensal do Ano) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
              <TrendingUp className="text-indigo-600" size={20} />
              Evolução Mensal de Gastos em {selectedYear}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comparativo mês a mês dos gastos Pessoais e de Terceiros ao longo dos 12 meses.
            </p>
          </div>
          <div className="flex items-center space-x-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span className="w-3 h-3 rounded-md bg-indigo-500" /> Pessoais
            </span>
            <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
              <span className="w-3 h-3 rounded-md bg-emerald-500" /> Terceiros
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="monthName" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
              <YAxis 
                tickLine={false} 
                axisLine={false} 
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(val) => `R$${val >= 1000 ? `${(val/1000).toFixed(0)}k` : val}`}
              />
              <Tooltip 
                formatter={(value: number) => [formatCurrency(value), '']}
                labelFormatter={(label) => `Mês: ${label} / ${selectedYear}`}
                contentStyle={{ borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              />
              <Bar dataKey="pessoal" name="Pessoais" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="terceiros" name="Terceiros" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two Column Section: Onde mais gastou (Categorias) & Quem mais gastou (Integrantes) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* RANKING DE CATEGORIAS (Onde você mais gastou no ano) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
                  <Tag size={18} className="text-amber-500" />
                  Onde Você Mais Gastou (Categorias)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ranking de categorias com maior peso financeiro no ano de {selectedYear}.
                </p>
              </div>
              <span className="text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-900">
                {categoryRanking.length} Categoria(s)
              </span>
            </div>

            {categoryRanking.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-8 text-center">Nenhum gasto registrado em {selectedYear}.</p>
            ) : (
              <div className="space-y-4 my-2">
                {categoryRanking.map((cat, idx) => (
                  <div key={cat.category} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                    <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-mono ${
                          idx === 0 ? 'bg-amber-500 text-white font-black' : 
                          idx === 1 ? 'bg-slate-400 text-white' : 
                          idx === 2 ? 'bg-amber-700 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-slate-900 dark:text-white text-sm">{cat.category}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({cat.count} despesa{cat.count > 1 ? 's' : ''})</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-900 dark:text-white text-sm font-black">{formatCurrency(cat.total)}</span>
                        <span className="block text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">{cat.percentage.toFixed(1)}% do ano</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-amber-500 to-indigo-600 rounded-full transition-all duration-500" 
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RANKING POR INTEGRANTE / RESPONSÁVEL (Quem gastou mais) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
                  <Users size={18} className="text-purple-500" />
                  Quem Gastou Mais (Por Responsável)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Divisão de despesas acumuladas por integrante do grupo no ano de {selectedYear}.
                </p>
              </div>
              <span className="text-xs font-bold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 px-3 py-1 rounded-full border border-purple-200 dark:border-purple-900">
                {memberRanking.length} Pessoas / Grupos
              </span>
            </div>

            {memberRanking.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-8 text-center">Nenhum registro por participante em {selectedYear}.</p>
            ) : (
              <div className="space-y-4 my-2">
                {memberRanking.map((m, idx) => (
                  <div key={m.id} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800/80">
                    <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                      <div className="flex items-center space-x-2">
                        <span className={`w-5 h-5 rounded-full text-[11px] flex items-center justify-center font-mono ${
                          idx === 0 ? 'bg-purple-600 text-white font-black' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-slate-900 dark:text-white text-sm">{m.name}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({m.count} itens)</span>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-900 dark:text-white text-sm font-black">{formatCurrency(m.total)}</span>
                        <span className="block text-[10px] text-purple-600 dark:text-purple-400 font-bold">{m.percentage.toFixed(1)}% do ano</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500" 
                        style={{ width: `${m.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Destaque Maior Gasto Único */}
          {highestExpense && (
            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
                  Maior Gasto Único do Ano
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-white block truncate max-w-[220px]">
                  {highestExpense.description}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Vencimento: {highestExpense.dueDate.split('-').reverse().join('/')} • {highestExpense.category}
                </span>
              </div>
              <span className="text-base font-black text-amber-600 dark:text-amber-400 font-display">
                {formatCurrency(highestExpense.amount)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Relatório Tabela Mês a Mês do Ano */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
            <Calendar className="text-indigo-600" size={20} />
            Resumo do Ano Mês a Mês ({selectedYear})
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Tabela comparativa detalhando os gastos totais acumulados em cada um dos 12 meses.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Mês</th>
                <th className="py-3 px-4 text-right">Despesas Pessoais</th>
                <th className="py-3 px-4 text-right">Despesas Terceiros</th>
                <th className="py-3 px-4 text-right">Total do Mês</th>
                <th className="py-3 px-4 text-center">Itens no Mês</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 font-medium">
              {monthlyData.map((m) => (
                <tr key={m.monthKey} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    {m.fullName}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300">
                    {formatCurrency(m.pessoal)}
                  </td>
                  <td className="py-3.5 px-4 text-right text-slate-700 dark:text-slate-300">
                    {formatCurrency(m.terceiros)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-indigo-600 dark:text-indigo-400 font-display text-sm">
                    {formatCurrency(m.total)}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {m.totalCount} item(s)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/30 font-black text-slate-900 dark:text-white text-sm">
                <td className="py-4 px-4 font-display">TOTAL ACUMULADO EM {selectedYear}</td>
                <td className="py-4 px-4 text-right text-indigo-600 dark:text-indigo-400">{formatCurrency(yearTotals.personal)}</td>
                <td className="py-4 px-4 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(yearTotals.thirdParty)}</td>
                <td className="py-4 px-4 text-right text-indigo-600 dark:text-indigo-300 font-display text-base">{formatCurrency(yearTotals.grandTotal)}</td>
                <td className="py-4 px-4 text-center text-xs font-bold text-slate-500">{yearTotals.count} itens</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Lista Detalhada de Despesas Filtráveis do Ano */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white font-display flex items-center gap-2">
              <Layers className="text-indigo-600" size={20} />
              Lista Geral de Lançamentos de {selectedYear}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Consulte todas as despesas lançadas no ano selecionado.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar despesa ou categoria..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none w-48 sm:w-64"
              />
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="all">Todos os Tipos</option>
              <option value="personal">Apenas Pessoais</option>
              <option value="third_party">Apenas Terceiros</option>
            </select>
          </div>
        </div>

        {filteredTableExpenses.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs italic">
            Nenhuma despesa encontrada para os filtros selecionados no ano de {selectedYear}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Descrição</th>
                  <th className="py-3 px-3">Categoria</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Responsável</th>
                  <th className="py-3 px-3 text-right">Valor</th>
                  <th className="py-3 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {filteredTableExpenses.map((exp) => {
                  const ownerName = exp.type === 'personal'
                    ? 'Pessoal (Você)'
                    : (exp.responsibleMemberId === 'all'
                      ? 'Todos (Dividido)'
                      : (members.find(m => m.id === exp.responsibleMemberId)?.name || 'Outro'));

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition">
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap">
                        {exp.dueDate.split('-').reverse().join('/')}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                        {exp.description}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {exp.type === 'personal' ? (
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold">Pessoal</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">De Terceiro</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                        {ownerName}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white font-display">
                        {formatCurrency(exp.amount)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {exp.isPaid ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 size={12} /> Pago
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                            <Clock size={12} /> Pendente
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
