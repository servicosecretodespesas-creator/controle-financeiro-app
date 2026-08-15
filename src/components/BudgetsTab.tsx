import React, { useState, useMemo, useEffect } from 'react';
import { Budget, Expense } from '../types';
import { Plus, Trash2, Wallet, AlertTriangle, CheckCircle } from 'lucide-react';

interface BudgetsTabProps {
  budgets: Budget[];
  expenses: Expense[];
  onAddBudget: (category: string, amount: number, month: string) => Promise<void>;
  onDeleteBudget: (id: string) => Promise<void>;
  currentMonth: string;
  categoriesList: string[];
  hideValues?: boolean;
}

export default function BudgetsTab({
  budgets,
  expenses,
  onAddBudget,
  onDeleteBudget,
  currentMonth,
  categoriesList,
  hideValues = false
}: BudgetsTabProps) {
  const [category, setCategory] = useState(categoriesList[0] || '');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (categoriesList && categoriesList.length > 0 && !category) {
      setCategory(categoriesList[0]);
    }
  }, [categoriesList, category]);

  // Active budgets for the selected month
  const monthlyBudgets = useMemo(() => {
    return budgets.filter(b => b.month === currentMonth);
  }, [budgets, currentMonth]);

  // Summarize actual spending by category for the selected month (both personal and third party)
  const categorySpending = useMemo(() => {
    const map: { [key: string]: number } = {};
    expenses
      .filter(exp => exp.dueDate.startsWith(currentMonth))
      .forEach(exp => {
        map[exp.category] = (map[exp.category] || 0) + exp.amount;
      });
    return map;
  }, [expenses, currentMonth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const budgetAmount = parseFloat(amount);
    if (!budgetAmount || isNaN(budgetAmount) || budgetAmount <= 0) return;

    // Check if budget for this category already exists in current month
    const exists = monthlyBudgets.some(b => b.category === category);
    if (exists) {
      alert(`Você já definiu um orçamento para ${category} neste mês! Remova o anterior antes de definir um novo.`);
      return;
    }

    try {
      await onAddBudget(category, budgetAmount, currentMonth);
      setAmount('');
    } catch (err) {
      alert("Erro ao salvar orçamento.");
    }
  };

  return (
    <div className="space-y-6" id="budgets-tab">
      <div>
        <h2 className="text-xl font-bold text-slate-900 font-display">Orçamentos Mensais Personalizados</h2>
        <p className="text-xs text-slate-500 font-medium">
          Defina limites de gastos por categoria para controlar melhor suas finanças em {currentMonth}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Add form */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 mb-4 font-display uppercase tracking-wider flex items-center gap-1.5">
              <Plus size={14} className="text-indigo-600" /> Definir Novo Orçamento
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500">Categoria</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full"
                >
                  {categoriesList.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-slate-500">Limite de Gasto (R$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                  <input
                    type="number"
                    step="1"
                    required
                    placeholder="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 w-full"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-indigo-600 text-white text-xs font-bold py-2.5 rounded-lg hover:bg-indigo-700 transition shadow-sm"
              >
                Definir Orçamento
              </button>
            </form>
          </div>
        </div>

        {/* Right column: Budget Statuses list */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="text-xs font-bold text-slate-900 mb-4 font-display uppercase tracking-wider flex items-center gap-1.5">
            <Wallet size={14} className="text-indigo-600" /> Acompanhamento de Metas de {currentMonth}
          </h3>

          {monthlyBudgets.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 rounded-lg text-xs text-slate-400 border border-slate-200">
              Nenhum orçamento personalizado definido para este mês. Use o formulário ao lado para começar!
            </div>
          ) : (
            <div className="space-y-4 max-h-[22rem] overflow-y-auto pr-2">
              {monthlyBudgets.map(b => {
                const spent = categorySpending[b.category] || 0;
                const ratio = spent / b.amount;
                const percent = Math.min(ratio * 100, 100);
                const isOver = spent > b.amount;

                return (
                  <div key={b.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 hover:border-indigo-500/20 transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{b.category}</h4>
                        <div className="flex items-center space-x-1.5 mt-0.5">
                          {isOver ? (
                            <span className="text-[9px] text-rose-500 font-bold flex items-center gap-0.5 uppercase tracking-wide">
                              <AlertTriangle size={10} /> Limite Excedido!
                            </span>
                          ) : (
                            <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5 uppercase tracking-wide">
                              <CheckCircle size={10} /> Dentro do planejado
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Gasto / Limite</p>
                          <p className="font-mono text-xs font-bold text-slate-900">
                            R$ {spent.toFixed(2)} / <span className="text-indigo-600">R$ {b.amount.toFixed(2)}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => onDeleteBudget(b.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition"
                          title="Remover orçamento"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Progress indicator */}
                    <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOver ? 'bg-rose-500 animate-pulse' : ratio > 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
