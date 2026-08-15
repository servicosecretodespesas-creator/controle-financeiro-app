import React, { useState, useMemo, useEffect } from 'react';
import { Expense, ExpenseType, Member } from '../types';
import { Plus, Trash2, Edit2, Download, Search, Calendar, DollarSign, RefreshCw, FileText, Check, Clock, User, AlertCircle, Layers, QrCode, X, Repeat, PauseCircle, PlayCircle, ArrowRight, Archive, RotateCcw, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import InstallmentsModal from './InstallmentsModal';
import PixPaymentModal from './PixPaymentModal';
import { calculateExpenseInterest, getLocalTodayStr } from '../utils/interest';

interface ExpensesTabProps {
  type: ExpenseType;
  expenses: Expense[];
  members: Member[];
  onAddExpense: (expenseData: Omit<Expense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>, installments?: number, installmentOverrides?: { [key: number]: { isPaid: boolean, paidAt?: string } }) => Promise<void>;
  onUpdateExpense: (id: string, expenseData: Partial<Expense>) => Promise<void>;
  onDeleteExpense: (id: string, skipConfirm?: boolean) => Promise<void>;
  currentMonth: string;
  onSelectMonth?: (month: string) => void;
  customConfirm?: (title: string, message: string) => Promise<boolean>;
  categoriesList: string[];
  onManageCategories?: () => void;
  externalEditingId?: string | null;
  onClearExternalEditingId?: () => void;
  hideValues?: boolean;
}

export default function ExpensesTab({
  type,
  expenses,
  members,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  currentMonth,
  onSelectMonth,
  customConfirm,
  categoriesList,
  onManageCategories,
  externalEditingId,
  onClearExternalEditingId,
  hideValues = false
}: ExpensesTabProps) {
  // Local state for filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // all, paid, pending
  const [sortBy, setSortBy] = useState<'dueDate-asc' | 'dueDate-desc' | 'amount-asc' | 'amount-desc' | 'description-asc'>('dueDate-asc');
  
  // Local state for Global Search across all months
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isGlobalSearchFocused, setIsGlobalSearchFocused] = useState(false);
  
  // Local state for filtering by individual member (only used when type === 'third_party')
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string>('all');
  
  // Local state for add/edit form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form fields
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categoriesList[0] || '');
  const [amount, setAmount] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [transactionDate, setTransactionDate] = useState(getLocalTodayStr());
  const [dueDate, setDueDate] = useState(getLocalTodayStr());
  const [isPaid, setIsPaid] = useState(false);
  const [paidAtForm, setPaidAtForm] = useState(getLocalTodayStr());

  // Sync category if categories list changes and nothing is selected yet
  useEffect(() => {
    if (categoriesList && categoriesList.length > 0 && !category) {
      setCategory(categoriesList[0]);
    }
  }, [categoriesList, category]);
  
  // Installments and Recurrence
  const [isInstallments, setIsInstallments] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState('1');
  const [installmentsValueMode, setInstallmentsValueMode] = useState<'total' | 'per_installment'>('total');
  const [paidInstallmentsCount, setPaidInstallmentsCount] = useState(0);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringActive, setRecurringActive] = useState(true);
  const [isVariableValue, setIsVariableValue] = useState(false);
  const [formInstallmentPaid, setFormInstallmentPaid] = useState<{[key: number]: boolean}>({});
  const [formInstallmentPaidDate, setFormInstallmentPaidDate] = useState<{[key: number]: string}>({});

  // Quick fill bill amount state
  const [quickFillExpense, setQuickFillExpense] = useState<Expense | null>(null);
  const [quickFillAmount, setQuickFillAmount] = useState('');
  const [quickFillMarkAsPaid, setQuickFillMarkAsPaid] = useState(true);

  // Keep amountPaid and isPaid in sync when installments and paid count change
  useEffect(() => {
    if (isInstallments && !editingId) {
      const numInstallments = Math.max(1, parseInt(installmentsCount) || 1);
      const inputAmt = parseFloat(amount || '0');
      let valEach = 0;
      if (installmentsValueMode === 'total') {
        valEach = numInstallments > 0 ? inputAmt / numInstallments : 0;
      } else {
        valEach = inputAmt;
      }
      
      const computedAmountPaid = paidInstallmentsCount * valEach;
      setAmountPaid(computedAmountPaid > 0 ? computedAmountPaid.toFixed(2) : '');
      setIsPaid(paidInstallmentsCount === numInstallments && numInstallments > 0);
    }
  }, [paidInstallmentsCount, isInstallments, installmentsCount, installmentsValueMode, amount, editingId]);

  // Sync paidInstallmentsCount automatically when formInstallmentPaid changes
  useEffect(() => {
    const count = Object.values(formInstallmentPaid).filter(Boolean).length;
    setPaidInstallmentsCount(count);
  }, [formInstallmentPaid]);

  // Adjust keys and dates when dueDate or installmentsCount changes
  useEffect(() => {
    const numInsts = Math.max(1, parseInt(installmentsCount) || 1);
    setFormInstallmentPaid(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(k => {
        if (Number(k) > numInsts) {
          delete next[Number(k)];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setFormInstallmentPaidDate(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(k => {
        const keyNum = Number(k);
        if (keyNum > numInsts) {
          delete next[keyNum];
          changed = true;
        } else if (formInstallmentPaid[keyNum]) {
          const expectedDate = getInstallmentDueDate(dueDate, keyNum);
          if (next[keyNum] !== expectedDate) {
            next[keyNum] = expectedDate;
            changed = true;
          }
        }
      });
      return changed ? next : prev;
    });
  }, [dueDate, installmentsCount, formInstallmentPaid]);

  // Interest Automation Fields
  const [hasAutoInterest, setHasAutoInterest] = useState(false);
  const [autoInterestFrequency, setAutoInterestFrequency] = useState<'daily' | 'once'>('daily');
  const [autoInterestType, setAutoInterestType] = useState<'percentage' | 'fixed'>('percentage');
  const [autoInterestValue, setAutoInterestValue] = useState('');
  
  // Team split members
  const [responsibleMemberId, setResponsibleMemberId] = useState('all');

  // Local state for viewing installments of an expense series
  const [viewingInstallmentsExpense, setViewingInstallmentsExpense] = useState<Expense | null>(null);

  // Local state for multi-selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);

  // Local state for quick payment date selection
  const [quickPaymentExpense, setQuickPaymentExpense] = useState<Expense | null>(null);
  const [quickPaymentDate, setQuickPaymentDate] = useState('');
  const [quickPaymentAmount, setQuickPaymentAmount] = useState('');
  const [showRecurringManagerModal, setShowRecurringManagerModal] = useState(false);

  // Local state for modal view tabs inside recurring manager
  const [recurringModalTab, setRecurringModalTab] = useState<'instances' | 'series'>('instances');
  const [recurringModalSearch, setRecurringModalSearch] = useState('');
  const [recurringModalSeriesFilter, setRecurringModalSeriesFilter] = useState('all');
  const [recurringModalStatusFilter, setRecurringModalStatusFilter] = useState('all');
  const [showArchivedSeries, setShowArchivedSeries] = useState(false);

  // Target for deleting recurring series modal options
  const [deleteSeriesTarget, setDeleteSeriesTarget] = useState<{
    templateId: string;
    description: string;
    totalCount: number;
    paidCount: number;
    fromMonth: string;
  } | null>(null);

  // Local state for inline editing inside recurring manager modal
  const [editingSeriesDayId, setEditingSeriesDayId] = useState<string | null>(null);
  const [newDayInput, setNewDayInput] = useState<string>('');
  const [editingSeriesAmountId, setEditingSeriesAmountId] = useState<string | null>(null);
  const [newAmountInput, setNewAmountInput] = useState<string>('');

  const handleUpdateSeriesDueDateDay = async (templateId: string, newDayNum: number) => {
    if (isNaN(newDayNum) || newDayNum < 1 || newDayNum > 31) {
      alert("Por favor, digite um dia do mês válido (entre 1 e 31).");
      return;
    }

    const matchingExpenses = expenses.filter(e => e.id === templateId || e.recurringTemplateId === templateId);
    if (matchingExpenses.length === 0) return;

    try {
      for (const exp of matchingExpenses) {
        const expMonth = exp.dueDate.substring(0, 7);
        if (expMonth >= currentMonth) {
          const [yearStr, monthStr] = expMonth.split('-');
          const year = parseInt(yearStr, 10);
          const month = parseInt(monthStr, 10);
          const maxDays = new Date(year, month, 0).getDate();
          const actualDay = Math.min(newDayNum, maxDays);
          const newDueDate = `${expMonth}-${String(actualDay).padStart(2, '0')}`;

          if (newDueDate !== exp.dueDate) {
            await onUpdateExpense(exp.id, { dueDate: newDueDate });
          }
        }
      }
      setEditingSeriesDayId(null);
    } catch (err) {
      console.error("Erro ao atualizar dia de vencimento:", err);
      alert("Erro ao salvar o novo dia de vencimento.");
    }
  };

  const handleToggleSeriesVariableValue = async (series: any, makeVariable: boolean, fixedAmt?: number) => {
    const matchingExpenses = expenses.filter(e => e.id === series.templateId || e.recurringTemplateId === series.templateId);
    if (matchingExpenses.length === 0) return;

    try {
      for (const exp of matchingExpenses) {
        const expMonth = exp.dueDate.substring(0, 7);
        if (expMonth >= currentMonth) {
          if (makeVariable) {
            await onUpdateExpense(exp.id, {
              isVariableValue: true,
              needsAmount: exp.isPaid ? false : true,
              amount: exp.isPaid ? exp.amount : 0,
              originalAmount: exp.isPaid ? exp.originalAmount : 0
            });
          } else {
            const targetAmt = fixedAmt !== undefined ? fixedAmt : (exp.amount > 0 ? exp.amount : (series.amount > 0 ? series.amount : 0));
            await onUpdateExpense(exp.id, {
              isVariableValue: false,
              needsAmount: false,
              amount: targetAmt,
              originalAmount: targetAmt
            });
          }
        }
      }
      setEditingSeriesAmountId(null);
    } catch (err) {
      console.error("Erro ao atualizar tipo de valor:", err);
      alert("Erro ao alterar o tipo de valor da recorrência.");
    }
  };

  // List all recurring expense instances across past, present, and future (deduplicated by series template + month)
  const { allRecurringInstances, duplicateCount } = useMemo(() => {
    const rawList = expenses.filter(exp => {
      if (exp.type !== type) return false;
      if (type === 'third_party' && selectedMemberFilter !== 'all') {
        if (exp.responsibleMemberId !== 'all' && exp.responsibleMemberId !== selectedMemberFilter) {
          return false;
        }
      }
      return exp.isRecurring || !!exp.recurringTemplateId;
    });

    const groupedMap = new Map<string, Expense[]>();
    for (const exp of rawList) {
      const templateId = exp.recurringTemplateId || exp.id;
      const expMonth = exp.dueDate ? exp.dueDate.substring(0, 7) : '';
      const key = `${templateId}_${expMonth}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, []);
      }
      groupedMap.get(key)!.push(exp);
    }

    const deduplicated: Expense[] = [];
    let dupsFound = 0;

    for (const items of groupedMap.values()) {
      if (items.length > 1) {
        dupsFound += (items.length - 1);
        items.sort((a, b) => {
          if (a.isPaid !== b.isPaid) return a.isPaid ? -1 : 1;
          if (a.amount > 0 !== b.amount > 0) return a.amount > 0 ? -1 : 1;
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
      }
      deduplicated.push(items[0]);
    }

    deduplicated.sort((a, b) => b.dueDate.localeCompare(a.dueDate));

    return { allRecurringInstances: deduplicated, duplicateCount: dupsFound };
  }, [expenses, type, selectedMemberFilter]);

  // Clean duplicate expenses from Firestore
  const handleCleanDuplicates = async () => {
    const rawList = expenses.filter(exp => exp.isRecurring || !!exp.recurringTemplateId);
    
    const groupedMap = new Map<string, Expense[]>();
    for (const exp of rawList) {
      const templateId = exp.recurringTemplateId || exp.id;
      const expMonth = exp.dueDate ? exp.dueDate.substring(0, 7) : '';
      const key = `${templateId}_${expMonth}`;
      if (!groupedMap.has(key)) {
        groupedMap.set(key, []);
      }
      groupedMap.get(key)!.push(exp);
    }

    const toDelete: Expense[] = [];
    for (const items of groupedMap.values()) {
      if (items.length > 1) {
        items.sort((a, b) => {
          if (a.isPaid !== b.isPaid) return a.isPaid ? -1 : 1;
          if (a.amount > 0 !== b.amount > 0) return a.amount > 0 ? -1 : 1;
          return (b.updatedAt || '').localeCompare(a.updatedAt || '');
        });
        for (let i = 1; i < items.length; i++) {
          toDelete.push(items[i]);
        }
      }
    }

    if (toDelete.length === 0) {
      alert("Nenhum lançamento duplicado encontrado no banco de dados!");
      return;
    }

    const isConfirmed = customConfirm
      ? await customConfirm("Limpar Duplicados do Banco", `Encontramos ${toDelete.length} lançamentos duplicados gerados anteriormente. Deseja excluí-los permanentemente do banco de dados?`)
      : confirm(`Encontramos ${toDelete.length} lançamentos duplicados gerados anteriormente. Deseja excluí-los permanentemente do banco de dados?`);

    if (!isConfirmed) return;

    try {
      for (const exp of toDelete) {
        await onDeleteExpense(exp.id, true);
      }
      alert(`${toDelete.length} lançamentos duplicados foram removidos do banco com sucesso! ✨`);
    } catch (err) {
      console.error("Erro ao limpar duplicados:", err);
      alert("Erro ao remover lançamentos duplicados.");
    }
  };

  const filteredRecurringInstances = useMemo(() => {
    const q = recurringModalSearch.trim().toLowerCase();
    const monthNamesPt = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho", 
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
    ];

    return allRecurringInstances.filter(exp => {
      if (exp.isArchived) return false;
      if (recurringModalSeriesFilter !== 'all') {
        const templateId = exp.recurringTemplateId || exp.id;
        if (templateId !== recurringModalSeriesFilter) return false;
      }
      if (recurringModalStatusFilter === 'paid' && !exp.isPaid) return false;
      if (recurringModalStatusFilter === 'pending' && exp.isPaid) return false;

      if (!q) return true;

      const desc = (exp.description || '').toLowerCase();
      const cat = (exp.category || '').toLowerCase();
      const dueDateStr = exp.dueDate || '';
      const [yStr, mStr] = dueDateStr.split('-');
      const monthIdx = parseInt(mStr, 10) - 1;
      const monthName = monthNamesPt[monthIdx] || '';
      const formattedDate = dueDateStr.split('-').reverse().join('/');
      const amtStr = (exp.amount || 0).toString();
      let memberName = '';
      if (type === 'third_party') {
        memberName = (members.find(m => m.id === exp.responsibleMemberId)?.name || 'Todos').toLowerCase();
      }

      return desc.includes(q) ||
        cat.includes(q) ||
        amtStr.includes(q) ||
        dueDateStr.includes(q) ||
        formattedDate.includes(q) ||
        (yStr && yStr.includes(q)) ||
        monthName.includes(q) ||
        memberName.includes(q);
    });
  }, [allRecurringInstances, recurringModalSeriesFilter, recurringModalStatusFilter, recurringModalSearch, members, type]);

  const handleInitiateDeleteSeries = (templateId: string, seriesDescription: string, defaultFromMonth?: string) => {
    const matchingExpenses = expenses.filter(e => e.id === templateId || e.recurringTemplateId === templateId);
    if (matchingExpenses.length === 0) return;

    const startMonth = defaultFromMonth || currentMonth;

    const preservedCount = matchingExpenses.filter(e => 
      e.isPaid || (e.dueDate && e.dueDate.substring(0, 7) < startMonth)
    ).length;

    setDeleteSeriesTarget({
      templateId,
      description: seriesDescription,
      totalCount: matchingExpenses.length,
      paidCount: preservedCount,
      fromMonth: startMonth
    });
  };

  const handleEndSeriesKeepHistory = async (templateId: string, fromMonthStr: string) => {
    const matchingExpenses = expenses.filter(e => e.id === templateId || e.recurringTemplateId === templateId);
    if (matchingExpenses.length === 0) return;

    const [y, m] = fromMonthStr.split('-');
    const formattedFromMonth = `${m}/${y}`;
    const targetDesc = deleteSeriesTarget?.description || matchingExpenses[0]?.description || "esta despesa";

    const isConfirmed = customConfirm 
      ? await customConfirm(
          "Confirmar Cancelamento Futuro", 
          `Tem certeza que deseja cancelar a despesa "${targetDesc}" a partir do mês ${formattedFromMonth} em diante?\n\nOs lançamentos dos meses anteriores a ${formattedFromMonth} e TODOS os lançamentos já pagos continuarão gravados intactos no seu histórico.`
        )
      : confirm(`Tem certeza que deseja cancelar a despesa a partir do mês ${formattedFromMonth} em diante? Os lançamentos dos meses anteriores e os já pagos continuarão salvos no histórico.`);

    if (!isConfirmed) return;

    try {
      for (const exp of matchingExpenses) {
        const expMonth = exp.dueDate ? exp.dueDate.substring(0, 7) : '';
        // An expense MUST be preserved if it is ALREADY PAID or belongs to a month BEFORE fromMonthStr
        const isPreserved = exp.isPaid || (expMonth && expMonth < fromMonthStr);

        if (isPreserved) {
          // Keep intact in history! Turn off recurringActive so no new ones are auto-generated
          await onUpdateExpense(exp.id, {
            recurringActive: false
          });
        } else {
          // Unpaid instance from fromMonthStr onwards, remove from Firestore
          await onDeleteExpense(exp.id, true);
        }
      }
      setDeleteSeriesTarget(null);
    } catch (err) {
      console.error("Erro ao encerrar série recorrente:", err);
      alert("Erro ao encerrar a série recorrente.");
    }
  };

  const handleTogglePauseSeries = async (templateId: string, fromMonthStr: string, shouldPause: boolean) => {
    const matchingExpenses = expenses.filter(e => e.id === templateId || e.recurringTemplateId === templateId);
    if (matchingExpenses.length === 0) return;

    const [y, m] = fromMonthStr.split('-');
    const formattedFromMonth = `${m}/${y}`;
    const actionText = shouldPause ? "pausar" : "reativar";
    const targetDesc = matchingExpenses[0]?.description || "esta despesa";

    const isConfirmed = customConfirm 
      ? await customConfirm(
          shouldPause ? "Pausar Recorrência" : "Reativar Recorrência", 
          `Deseja realmente ${actionText} a despesa "${targetDesc}" a partir do mês ${formattedFromMonth} em diante?\n\nOs lançamentos dos meses anteriores a ${formattedFromMonth} não serão alterados.`
        )
      : confirm(`Deseja realmente ${actionText} a despesa a partir do mês ${formattedFromMonth} em diante?`);

    if (!isConfirmed) return;

    try {
      const targetActive = !shouldPause;
      let targetExp = matchingExpenses.find(e => e.dueDate.substring(0, 7) === fromMonthStr);
      if (!targetExp) {
        targetExp = matchingExpenses.find(e => e.dueDate.substring(0, 7) >= fromMonthStr);
      }

      if (targetExp) {
        await onUpdateExpense(targetExp.id, { recurringActive: targetActive });
      } else {
        for (const exp of matchingExpenses) {
          if (exp.dueDate.substring(0, 7) >= fromMonthStr) {
            await onUpdateExpense(exp.id, { recurringActive: targetActive });
          }
        }
      }
    } catch (err) {
      console.error("Erro ao alterar pausa da série:", err);
      alert("Erro ao alterar o status da recorrência.");
    }
  };

  const handleArchiveSeries = async (templateId: string, shouldArchive: boolean) => {
    const matchingExpenses = expenses.filter(e => e.id === templateId || e.recurringTemplateId === templateId);
    if (matchingExpenses.length === 0) return;

    const targetDesc = matchingExpenses[0]?.description || "esta despesa";
    const title = shouldArchive ? "Arquivar Série" : "Desarquivar Série";
    const msg = shouldArchive 
      ? `Deseja realmente arquivar a despesa "${targetDesc}"?\n\nEla ficará oculta da listagem do gerenciador e dos meses correntes, mas continuará preservada com segurança no seu histórico e relatórios passados.`
      : `Deseja desarquivar e reativar a despesa "${targetDesc}" no gerenciador?`;

    const isConfirmed = customConfirm 
      ? await customConfirm(title, msg)
      : confirm(msg);

    if (!isConfirmed) return;

    try {
      for (const exp of matchingExpenses) {
        await onUpdateExpense(exp.id, {
          isArchived: shouldArchive
        });
      }
    } catch (err) {
      console.error("Erro ao alterar arquivamento da série:", err);
      alert("Erro ao atualizar o arquivamento da série.");
    }
  };

  const handleDeleteEntireSeries = async (templateId: string) => {
    const targetDesc = deleteSeriesTarget?.description || "esta despesa";
    const totalCount = deleteSeriesTarget?.totalCount || 0;

    const isConfirmed = customConfirm 
      ? await customConfirm(
          "⚠️ EXCLUIR TUDO DO BANCO DE DADOS", 
          `ATENÇÃO: Você está prestes a apagar PERMANENTEMENTE todas as ${totalCount} ocorrências da despesa "${targetDesc}" de TODOS os meses (passados, presentes e futuros).\n\nIsso apagará também o histórico de pagamentos passados. Deseja continuar?`
        )
      : confirm(`Deseja apagar todas as ocorrências de todos os meses?`);

    if (!isConfirmed) return;

    const matchingExpenses = expenses.filter(e => e.id === templateId || e.recurringTemplateId === templateId);
    if (matchingExpenses.length === 0) return;

    try {
      for (const exp of matchingExpenses) {
        await onDeleteExpense(exp.id, true);
      }
      setDeleteSeriesTarget(null);
    } catch (err) {
      console.error("Erro ao excluir série recorrente:", err);
      alert("Erro ao excluir a série recorrente.");
    }
  };

  const handleSaveQuickFillAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickFillExpense) return;
    const val = parseFloat(quickFillAmount);
    if (isNaN(val) || val <= 0) {
      alert("Por favor, digite um valor válido para a fatura.");
      return;
    }

    try {
      await onUpdateExpense(quickFillExpense.id, {
        amount: val,
        originalAmount: val,
        needsAmount: false,
        isPaid: quickFillMarkAsPaid,
        paidAt: quickFillMarkAsPaid ? (quickFillExpense.dueDate || getLocalTodayStr()) : ""
      });
      setQuickFillExpense(null);
      setQuickFillAmount('');
    } catch (err) {
      alert("Erro ao atualizar valor da fatura.");
    }
  };

  // Helper to remove (current/total) suffix from description
  const getBaseDescription = (description: string): string => {
    return description.replace(/\s*\(\d+\/\d+\)$/, '').trim();
  };

  // Helper to calculate installment due date
  const getInstallmentDueDate = (startDateStr: string, index: number): string => {
    if (!startDateStr) return '';
    try {
      const baseDueDate = new Date(startDateStr + 'T12:00:00');
      baseDueDate.setMonth(baseDueDate.getMonth() + (index - 1));
      const year = baseDueDate.getFullYear();
      const month = String(baseDueDate.getMonth() + 1).padStart(2, '0');
      const day = String(baseDueDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return startDateStr;
    }
  };

  // Helper to calculate total value of an entire installment series
  const getInstallmentSeriesTotal = (expense: Expense): number => {
    const baseDesc = getBaseDescription(expense.description);
    const related = expenses.filter(exp => {
      if (!exp.isInstallments) return false;
      if (exp.type !== expense.type) return false;
      
      // If both have installmentGroupId, compare them strictly
      if (exp.installmentGroupId && expense.installmentGroupId) {
        return exp.installmentGroupId === expense.installmentGroupId;
      }
      
      // Fallback for older data without installmentGroupId
      return getBaseDescription(exp.description) === baseDesc &&
             exp.installmentsCount === expense.installmentsCount &&
             exp.transactionDate === expense.transactionDate;
    });
    return related.reduce((acc, curr) => acc + curr.amount, 0);
  };

  const formattedMonthName = useMemo(() => {
    const [year, month] = currentMonth.split('-');
    const monthNames = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    return `${monthNames[parseInt(month, 10) - 1]} de ${year}`;
  }, [currentMonth]);

  // Helper to check if an expense belongs to the selected member filter
  const isMemberMatch = (expResponsibleId: string | undefined, filterId: string) => {
    if (filterId === 'all') return true;
    if (expResponsibleId === 'all') return true;
    if (!expResponsibleId) return false;
    if (expResponsibleId === filterId) return true;
    
    // Fallback comparison with member name
    const memberObj = members.find(m => m.id === filterId);
    if (memberObj) {
      const cleanMemberName = memberObj.name.trim().toLowerCase();
      const cleanExpResp = expResponsibleId.trim().toLowerCase();
      if (cleanExpResp === cleanMemberName) return true;
    }
    return false;
  };

  // Aggregate all recurring series across all expenses in database for this tab type
  const recurringSeriesList = useMemo(() => {
    const map = new Map<string, {
      templateId: string;
      description: string;
      category: string;
      type: ExpenseType;
      amount: number;
      isVariableValue: boolean;
      recurringActive: boolean;
      isArchived: boolean;
      dueDateDay: string;
      responsibleMemberId?: string;
      currentMonthInstance?: Expense;
      sampleExpense: Expense;
    }>();

    for (const exp of expenses) {
      // Must match personal vs third_party tab type strictly
      if (exp.type !== type) continue;

      // On third_party tab, if member filter is selected, filter strictly by member
      if (type === 'third_party' && selectedMemberFilter !== 'all') {
        if (!isMemberMatch(exp.responsibleMemberId, selectedMemberFilter)) continue;
      }

      if (!exp.isRecurring && !exp.recurringTemplateId) continue;

      const templateId = exp.recurringTemplateId || exp.id;
      const isPaused = exp.recurringActive === false;
      const isArchived = exp.isArchived === true;
      const dayStr = exp.dueDate.split('-')[2] || '10';

      const existing = map.get(templateId);
      if (!existing) {
        map.set(templateId, {
          templateId,
          description: exp.description,
          category: exp.category,
          type: exp.type,
          amount: exp.amount,
          isVariableValue: !!exp.isVariableValue,
          recurringActive: !isPaused,
          isArchived: isArchived,
          dueDateDay: dayStr,
          responsibleMemberId: exp.responsibleMemberId,
          currentMonthInstance: exp.dueDate.startsWith(currentMonth) ? exp : undefined,
          sampleExpense: exp
        });
      } else {
        if (isPaused) {
          existing.recurringActive = false;
        }
        if (isArchived) {
          existing.isArchived = true;
        }
        if (exp.dueDate.startsWith(currentMonth)) {
          existing.currentMonthInstance = exp;
          existing.dueDateDay = dayStr;
          existing.isVariableValue = !!exp.isVariableValue;
          if (exp.amount > 0) existing.amount = exp.amount;
        }
      }
    }

    return Array.from(map.values());
  }, [expenses, currentMonth, type, selectedMemberFilter]);

  // Reset selected ids when filters, month or tab type change
  useEffect(() => {
    setSelectedIds([]);
  }, [currentMonth, type, selectedCategory, selectedStatus, search]);

  // Reset member filter only when switching tab type (e.g. from personal to third_party or vice versa)
  useEffect(() => {
    setSelectedMemberFilter('all');
  }, [type]);

  // Global search across ALL months for this tab type
  const globalSearchResults = useMemo(() => {
    const q = globalSearchQuery.trim().toLowerCase();
    if (q.length < 2) return [];

    const monthNamesPt = [
      "janeiro", "fevereiro", "março", "abril", "maio", "junho", 
      "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
    ];

    return expenses.filter(exp => {
      // Must match personal vs third party type
      if (exp.type !== type) return false;

      // Filter by member if third_party and a member filter is selected
      if (type === 'third_party' && selectedMemberFilter !== 'all') {
        if (!isMemberMatch(exp.responsibleMemberId, selectedMemberFilter)) {
          return false;
        }
      }

      const desc = (exp.description || '').toLowerCase();
      const cat = (exp.category || '').toLowerCase();
      const amtStr = (exp.amount || 0).toString();
      const dueDateStr = exp.dueDate || ''; // YYYY-MM-DD
      const [yStr, mStr] = dueDateStr.split('-');
      const monthIdx = parseInt(mStr, 10) - 1;
      const monthName = monthNamesPt[monthIdx] || '';
      const formattedDate = dueDateStr.split('-').reverse().join('/'); // DD/MM/YYYY
      
      let memberName = '';
      if (type === 'third_party') {
        memberName = (members.find(m => m.id === exp.responsibleMemberId)?.name || 'Todos').toLowerCase();
      }

      return desc.includes(q) ||
        cat.includes(q) ||
        amtStr.includes(q) ||
        dueDateStr.includes(q) ||
        formattedDate.includes(q) ||
        (yStr && yStr.includes(q)) ||
        monthName.includes(q) ||
        memberName.includes(q);
    }).slice(0, 20);
  }, [expenses, type, selectedMemberFilter, members, globalSearchQuery]);

  const handleSelectGlobalSearchResult = (exp: Expense) => {
    const expMonth = exp.dueDate.substring(0, 7);
    if (onSelectMonth) {
      onSelectMonth(expMonth);
    }
    handleOpenEditForm(exp);
    setGlobalSearchQuery('');
    setIsGlobalSearchFocused(false);
  };

  // Filtered expenses based on type, search, category, status, and month
  const filteredExpenses = useMemo(() => {
    return expenses
      .filter(exp => {
        // Must match personal vs third party type
        if (exp.type !== type) return false;
        
        // Paused recurring expenses are invisible from regular monthly view
        if (exp.recurringActive === false) return false;

        // Must match selected month
        if (!exp.dueDate.startsWith(currentMonth)) return false;

        // Match member filter if on third party tab and filter is active
        if (type === 'third_party' && selectedMemberFilter !== 'all') {
          if (!isMemberMatch(exp.responsibleMemberId, selectedMemberFilter)) {
            return false;
          }
        }

        // Match search
        if (search && !exp.description.toLowerCase().includes(search.toLowerCase())) return false;

        // Match category
        if (selectedCategory !== 'all' && exp.category !== selectedCategory) return false;

        // Match status
        if (selectedStatus === 'paid' && !exp.isPaid) return false;
        if (selectedStatus === 'pending' && exp.isPaid) return false;
        if (selectedStatus === 'needs_amount' && !(exp.needsAmount || (exp.isVariableValue && exp.amount === 0))) return false;
        if (selectedStatus === 'recurring' && !exp.isRecurring) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'dueDate-asc') {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (sortBy === 'dueDate-desc') {
          return b.dueDate.localeCompare(a.dueDate);
        }
        if (sortBy === 'amount-asc') {
          return a.amount - b.amount;
        }
        if (sortBy === 'amount-desc') {
          return b.amount - a.amount;
        }
        if (sortBy === 'description-asc') {
          return a.description.localeCompare(b.description);
        }
        return 0;
      });
  }, [expenses, type, currentMonth, search, selectedCategory, selectedStatus, sortBy, selectedMemberFilter]);

  // Totals for this month's filtered set
  const filteredTotal = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + curr.amount, 0);
  }, [filteredExpenses]);

  // Memo for selected expenses
  const selectedExpenses = useMemo(() => {
    return filteredExpenses.filter(exp => selectedIds.includes(exp.id));
  }, [filteredExpenses, selectedIds]);

  const selectedTotalWithInterest = useMemo(() => {
    return selectedExpenses.reduce((sum, exp) => {
      const calc = calculateExpenseInterest(exp);
      return sum + Math.max(0, calc.currentAmount - (exp.amountPaid || 0));
    }, 0);
  }, [selectedExpenses]);

  const currentYear = useMemo(() => {
    return currentMonth.split('-')[0];
  }, [currentMonth]);

  const stats = useMemo(() => {
    const tabExpenses = expenses.filter(exp => exp.type === type && exp.recurringActive !== false);
    const monthExpenses = tabExpenses.filter(exp => exp.dueDate.startsWith(currentMonth));
    const yearExpenses = tabExpenses.filter(exp => exp.dueDate.startsWith(currentYear));

    const getMemberShare = (exp: Expense) => {
      if (type !== 'third_party' || selectedMemberFilter === 'all') {
        return exp.amount;
      }
      if (exp.responsibleMemberId === 'all') {
        return exp.amount / Math.max(1, members.length);
      }
      if (isMemberMatch(exp.responsibleMemberId, selectedMemberFilter)) {
        return exp.amount;
      }
      return 0;
    };

    const getMemberPaidAmount = (exp: Expense) => {
      const share = getMemberShare(exp);
      if (exp.isPaid) {
        return share;
      } else {
        const fullPaid = exp.amountPaid || 0;
        if (exp.responsibleMemberId === 'all') {
          return fullPaid / Math.max(1, members.length);
        }
        if (isMemberMatch(exp.responsibleMemberId, selectedMemberFilter)) {
          return fullPaid;
        }
        return 0;
      }
    };

    const getMemberPendingAmount = (exp: Expense) => {
      const share = getMemberShare(exp);
      const paidShare = getMemberPaidAmount(exp);
      return Math.max(0, share - paidShare);
    };

    const totalMonth = monthExpenses.reduce((acc, curr) => acc + getMemberShare(curr), 0);
    const totalYear = yearExpenses.reduce((acc, curr) => acc + getMemberShare(curr), 0);

    const paidMonth = monthExpenses.reduce((acc, curr) => acc + getMemberPaidAmount(curr), 0);
    const pendingMonth = monthExpenses.reduce((acc, curr) => acc + getMemberPendingAmount(curr), 0);

    const todayStr = getLocalTodayStr();
    const overdueMonthList = monthExpenses.filter(exp => {
      const isPending = !exp.isPaid && getMemberPendingAmount(exp) > 0.01;
      return isPending && exp.dueDate < todayStr;
    });
    const overdueMonthTotal = overdueMonthList.reduce((acc, curr) => acc + getMemberPendingAmount(curr), 0);
    const overdueCount = overdueMonthList.length;

    return {
      totalMonth,
      totalYear,
      paidMonth,
      pendingMonth,
      overdueMonthTotal,
      overdueCount
    };
  }, [expenses, type, currentMonth, currentYear, selectedMemberFilter, members]);

  const selectableExpenses = useMemo(() => {
    return filteredExpenses.filter(e => !e.isPaid);
  }, [filteredExpenses]);

  const isAllSelected = selectableExpenses.length > 0 && selectableExpenses.every(e => selectedIds.includes(e.id));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(selectableExpenses.map(e => e.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const exp = expenses.find(e => e.id === id);
    if (exp?.isPaid) return; // Prevent selecting already paid ones
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
      alert("Erro ao marcar despesas como pagas.");
    }
  };

  const handleBulkMarkAsPending = async () => {
    if (selectedIds.length === 0) return;
    try {
      await Promise.all(selectedIds.map(id => onUpdateExpense(id, { isPaid: false })));
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      alert("Erro ao marcar despesas como pendentes.");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const isConfirmed = customConfirm 
      ? await customConfirm("Excluir Despesas Selecionadas", `Tem certeza que deseja excluir as ${selectedIds.length} despesas selecionadas?`)
      : confirm(`Tem certeza que deseja excluir as ${selectedIds.length} despesas selecionadas?`);
      
    if (!isConfirmed) return;
    try {
      await Promise.all(selectedIds.map(id => onDeleteExpense(id, true)));
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      alert("Erro ao excluir despesas.");
    }
  };

  const handleOpenAddForm = () => {
    setEditingId(null);
    setDescription('');
    setCategory(categoriesList[0] || '');
    setAmount('');
    setAmountPaid('');
    setTransactionDate(getLocalTodayStr());
    setDueDate(getLocalTodayStr());
    setIsPaid(false);
    setPaidAtForm(getLocalTodayStr());
    setIsInstallments(false);
    setInstallmentsCount('1');
    setInstallmentsValueMode('total');
    setPaidInstallmentsCount(0);
    setIsRecurring(false);
    setRecurringActive(true);
    setIsVariableValue(false);
    setFormInstallmentPaid({});
    setFormInstallmentPaidDate({});
    setResponsibleMemberId('all');
    setHasAutoInterest(false);
    setAutoInterestFrequency('daily');
    setAutoInterestType('percentage');
    setAutoInterestValue('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (exp: Expense) => {
    setEditingId(exp.id);
    setDescription(exp.description);
    setCategory(exp.category);
    setAmount(exp.amount ? exp.amount.toString() : '0');
    setAmountPaid(exp.amountPaid !== undefined ? exp.amountPaid.toString() : '');
    setTransactionDate(exp.transactionDate);
    setDueDate(exp.dueDate);
    setIsPaid(exp.isPaid);
    setPaidAtForm(exp.paidAt || exp.dueDate || getLocalTodayStr());
    setIsInstallments(exp.isInstallments || false);
    setInstallmentsCount((exp.installmentsCount || 1).toString());
    setInstallmentsValueMode('total');
    setPaidInstallmentsCount(exp.isPaid ? (exp.installmentsCount || 1) : 0);
    setIsRecurring(exp.isRecurring || false);
    setRecurringActive(exp.recurringActive !== false);
    setIsVariableValue(exp.isVariableValue || false);
    setFormInstallmentPaid({});
    setFormInstallmentPaidDate({});
    setResponsibleMemberId(exp.responsibleMemberId || 'all');
    
    // Interest Automation
    const hasDaily = exp.dailyInterestType && exp.dailyInterestType !== 'none';
    const hasOnce = exp.interestType && exp.interestType !== 'none';
    
    if (hasDaily) {
      setHasAutoInterest(true);
      setAutoInterestFrequency('daily');
      setAutoInterestType(exp.dailyInterestType === 'percentage' ? 'percentage' : 'fixed');
      setAutoInterestValue((exp.dailyInterestValue || '').toString());
    } else if (hasOnce) {
      setHasAutoInterest(true);
      setAutoInterestFrequency('once');
      setAutoInterestType(exp.interestType === 'percentage' ? 'percentage' : 'fixed');
      setAutoInterestValue((exp.interestValue || '').toString());
    } else {
      setHasAutoInterest(false);
      setAutoInterestFrequency('daily');
      setAutoInterestType('percentage');
      setAutoInterestValue('');
    }

    setIsFormOpen(true);
  };

  // Trigger editing if externalEditingId matches an expense
  useEffect(() => {
    if (externalEditingId) {
      const exp = expenses.find(e => e.id === externalEditingId);
      if (exp) {
        handleOpenEditForm(exp);
      }
      if (onClearExternalEditingId) {
        onClearExternalEditingId();
      }
    }
  }, [externalEditingId, expenses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    const expenseAmount = parseFloat(amount || '0');
    if (!isVariableValue && (isNaN(expenseAmount) || expenseAmount <= 0)) {
      alert("Por favor, digite um valor válido ou ative a opção 'Valor Variável' se ainda não souber o valor da fatura.");
      return;
    }

    const finalAmount = isNaN(expenseAmount) ? 0 : Math.max(0, expenseAmount);
    const existingExpense = editingId ? expenses.find(e => e.id === editingId) : null;
    const parsedInstallmentsCount = isInstallments ? Math.max(1, parseInt(installmentsCount) || 1) : 1;
    
    let calculatedAmount = finalAmount;
    if (isInstallments && !editingId && installmentsValueMode === 'per_installment') {
      calculatedAmount = finalAmount * parsedInstallmentsCount;
    }

    const parsedAutoInterestValue = hasAutoInterest ? parseFloat(autoInterestValue) || 0 : 0;
    const parsedAmountPaid = !isPaid ? (amountPaid ? parseFloat(amountPaid) : 0) : calculatedAmount;

    const dataPayload: any = {
      description,
      category,
      amount: calculatedAmount,
      amountPaid: isNaN(parsedAmountPaid) ? 0 : parsedAmountPaid,
      transactionDate,
      dueDate,
      type,
      isPaid,
      paidAt: isPaid ? paidAtForm : "",
      isInstallments,
      installmentsCount: existingExpense && existingExpense.isInstallments ? (existingExpense.installmentsCount || parsedInstallmentsCount) : parsedInstallmentsCount,
      currentInstallment: existingExpense && existingExpense.isInstallments ? (existingExpense.currentInstallment || 1) : (isInstallments ? 1 : 1),
      isRecurring,
      recurrenceFrequency: isRecurring ? ('monthly' as const) : ('none' as const),
      recurringActive: isRecurring ? recurringActive : true,
      isVariableValue: isRecurring ? isVariableValue : false,
      needsAmount: isRecurring && isVariableValue && calculatedAmount === 0,
      responsibleMemberId: type === 'third_party' ? responsibleMemberId : undefined,
      
      // Automatic interest configuration
      dailyInterestType: hasAutoInterest && autoInterestFrequency === 'daily' ? autoInterestType : 'none',
      dailyInterestValue: hasAutoInterest && autoInterestFrequency === 'daily' ? parsedAutoInterestValue : 0,
      interestType: hasAutoInterest && autoInterestFrequency === 'once' ? autoInterestType : 'none',
      interestValue: hasAutoInterest && autoInterestFrequency === 'once' ? parsedAutoInterestValue : 0,
    };

    // Always keep originalAmount in sync with the edited/submitted amount to avoid stale base
    dataPayload.originalAmount = finalAmount;

    try {
      if (editingId) {
        // Edit
        await onUpdateExpense(editingId, dataPayload);
      } else {
        // Add
        // If installments checked, we pass the count to create separate sequential records
        let installmentOverrides: { [key: number]: { isPaid: boolean, paidAt?: string } } | undefined = undefined;
        if (isInstallments) {
          installmentOverrides = {};
          for (let i = 1; i <= parsedInstallmentsCount; i++) {
            installmentOverrides[i] = {
              isPaid: !!formInstallmentPaid[i],
              paidAt: formInstallmentPaid[i] ? (formInstallmentPaidDate[i] || getInstallmentDueDate(dueDate, i)) : ""
            };
          }
        }

        await onAddExpense(dataPayload, isInstallments ? parsedInstallmentsCount : undefined, installmentOverrides);
      }
      setIsFormOpen(false);
    } catch (err) {
      alert("Erro ao salvar despesa. Por favor, verifique.");
    }
  };

  const handleDrawerDelete = async () => {
    if (!editingId) return;
    const isConfirmed = customConfirm 
      ? await customConfirm("Excluir Despesa", "Tem certeza de que deseja excluir esta despesa?")
      : confirm("Tem certeza de que deseja excluir esta despesa?");
    if (isConfirmed) {
      await onDeleteExpense(editingId, true);
      setIsFormOpen(false);
    }
  };

  // Export to Excel/CSV function (Excel friendly, pt-BR formatting)
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    // Header
    const isFiltered = type === 'third_party' && selectedMemberFilter !== 'all';
    csvContent += isFiltered 
      ? "Descricao;Categoria;Valor Total;Minha Cota;Data da Compra;Data de Vencimento;Status;Responsavel;Parcelado;Frequencia\r\n"
      : "Descricao;Categoria;Valor;Data da Compra;Data de Vencimento;Status;Responsavel;Parcelado;Frequencia\r\n";

    filteredExpenses.forEach(exp => {
      const respName = exp.responsibleMemberId === 'all' 
        ? "Todos (Dividido)" 
        : members.find(m => m.id === exp.responsibleMemberId)?.name || "Nenhum/Pessoal";
      
      const myShare = exp.responsibleMemberId === 'all'
        ? exp.amount / Math.max(1, members.length)
        : exp.amount;

      const row = isFiltered ? [
        exp.description,
        exp.category,
        exp.amount.toFixed(2).replace('.', ','),
        myShare.toFixed(2).replace('.', ','),
        exp.transactionDate,
        exp.dueDate,
        exp.isPaid ? "Pago" : "Pendente",
        respName,
        exp.isInstallments ? `Sim (Parcela ${exp.currentInstallment}/${exp.installmentsCount})` : "Nao",
        exp.isRecurring ? "Mensal (Recorrente)" : "Unica"
      ] : [
        exp.description,
        exp.category,
        exp.amount.toFixed(2).replace('.', ','),
        exp.transactionDate,
        exp.dueDate,
        exp.isPaid ? "Pago" : "Pendente",
        respName,
        exp.isInstallments ? `Sim (Parcela ${exp.currentInstallment}/${exp.installmentsCount})` : "Nao",
        exp.isRecurring ? "Mensal (Recorrente)" : "Unica"
      ];

      csvContent += row.map(field => `"${field}"`).join(";") + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `despesas_${type}_${currentMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // HTML Print / PDF export
  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-6" id={`expenses-${type}-tab`}>
      {/* Title & Actions Row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 font-display">
            {type === 'personal' ? 'Despesas Pessoais' : 'Despesas de Terceiros'}
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Gerencie e organize suas transações e contas de {currentMonth}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setShowRecurringManagerModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 text-slate-100 text-xs font-semibold rounded-lg shadow-sm border border-slate-700 hover:bg-slate-700 transition cursor-pointer"
            title="Abrir gerenciador de despesas recorrentes e pausadas"
          >
            <Repeat size={14} className="text-indigo-400" />
            <span>Gerenciar Recorrências</span>
            {recurringSeriesList.some(s => !s.recurringActive && !s.isArchived) && (
              <span className="bg-rose-500/30 text-rose-300 text-[10px] font-black px-1.5 py-0.2 rounded-full border border-rose-500/40">
                {recurringSeriesList.filter(s => !s.recurringActive && !s.isArchived).length} pausadas
              </span>
            )}
          </button>
          <button
            onClick={handleExportCSV}
            disabled={filteredExpenses.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Download size={14} /> Exportar Excel
          </button>
          <button
            onClick={handlePrintPDF}
            disabled={filteredExpenses.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 text-xs font-semibold rounded-lg shadow-sm border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <FileText size={14} /> Gerar PDF
          </button>
          <button
            onClick={handleOpenAddForm}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition ml-auto md:ml-0"
          >
            <Plus size={14} /> Nova Despesa
          </button>
        </div>
      </div>

      {/* Barra de Pesquisa Global por Todo o Histórico */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 rounded-2xl border border-indigo-800/60 shadow-lg relative z-30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-500/20 p-2 rounded-xl text-indigo-300 border border-indigo-500/30 shrink-0">
              <Search size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-wider font-display">
                Pesquisa Global ({type === 'personal' ? 'Despesas Pessoais' : 'Despesas de Terceiros'})
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Busque uma despesa em qualquer mês e ano sem precisar navegar manualmente
              </p>
            </div>
          </div>
        </div>

        <div className="relative">
          <div className="relative flex items-center">
            <Search className="absolute left-3.5 h-4 w-4 text-indigo-400 pointer-events-none" />
            <input
              type="text"
              placeholder={`Digite para buscar ${type === 'personal' ? 'despesas pessoais' : 'despesas de terceiros'} em todo o histórico (ex: Aluguel, Luz, 2025)...`}
              value={globalSearchQuery}
              onChange={(e) => {
                setGlobalSearchQuery(e.target.value);
                setIsGlobalSearchFocused(true);
              }}
              onFocus={() => setIsGlobalSearchFocused(true)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-950/90 border border-indigo-500/40 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 font-medium shadow-inner"
            />
            {globalSearchQuery && (
              <button
                type="button"
                onClick={() => setGlobalSearchQuery('')}
                className="absolute right-3 p-1 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Result Dropdown Overlay */}
          {isGlobalSearchFocused && globalSearchQuery.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900 border border-indigo-500/50 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-96 overflow-y-auto">
              <div className="px-3.5 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-wider">
                <span>{globalSearchResults.length} {globalSearchResults.length === 1 ? 'resultado encontrado' : 'resultados encontrados'} em todo o histórico</span>
                <button 
                  type="button" 
                  onClick={() => setIsGlobalSearchFocused(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  Fechar ✕
                </button>
              </div>

              {globalSearchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 italic">
                  Nenhuma despesa encontrada com a palavra "{globalSearchQuery}".
                </div>
              ) : (
                <div className="divide-y divide-slate-800/80">
                  {globalSearchResults.map((exp) => {
                    const [yStr, mStr] = exp.dueDate.split('-');
                    const monthNames = [
                      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
                      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
                    ];
                    const monthName = monthNames[parseInt(mStr, 10) - 1] || mStr;
                    const formattedMonthYear = `${monthName} / ${yStr}`;
                    const memberName = exp.type === 'third_party' 
                      ? (members.find(m => m.id === exp.responsibleMemberId)?.name || 'Todos os Membros')
                      : 'Pessoal';

                    return (
                      <div
                        key={exp.id}
                        onClick={() => handleSelectGlobalSearchResult(exp)}
                        className="p-3.5 hover:bg-indigo-950/50 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 group"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-xs text-white group-hover:text-indigo-300 transition">
                              {exp.description}
                            </span>
                            <span className="text-[9px] bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded font-semibold">
                              {exp.category}
                            </span>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              exp.isPaid 
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}>
                              {exp.isPaid ? 'Pago' : 'Pendente'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-medium">
                            <span className="text-indigo-300 font-bold bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60 flex items-center gap-1">
                              <Calendar size={11} />
                              Mês: {formattedMonthYear}
                            </span>
                            <span>Vencimento: {exp.dueDate.split('-').reverse().join('/')}</span>
                            {type === 'third_party' && (
                              <span className="text-slate-300 font-semibold flex items-center gap-1">
                                <User size={10} className="text-indigo-400" />
                                {memberName}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <span className="font-mono text-xs font-black text-emerald-400">
                            R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold px-3 py-1.5 rounded-lg transition flex items-center gap-1 shadow-sm">
                            <span>Ir para despesa</span>
                            <ArrowRight size={10} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selector de Integrante (Only for Despesas de Terceiros) */}
      {type === 'third_party' && members.length > 0 && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600 shrink-0">
              <User size={18} />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Filtrar por Integrante</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Cota individual, pagamentos e pendências específicas</p>
            </div>
          </div>
          <div className="w-full sm:w-72">
            <select
              value={selectedMemberFilter}
              onChange={(e) => setSelectedMemberFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-700 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 hover:bg-slate-100/50 cursor-pointer transition-all"
            >
              <option value="all" className="font-semibold text-slate-700">Todos (Lista Completa)</option>
              {members.map(m => (
                <option key={m.id} value={m.id} className="font-semibold text-slate-700">
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total do Mês */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-indigo-600 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              {type === 'third_party' && selectedMemberFilter !== 'all' ? 'Minha Cota no Mês' : 'Total do Mês'}
            </span>
            <h4 className={`text-lg font-bold text-slate-900 font-mono transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.totalMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            {type === 'third_party' && selectedMemberFilter !== 'all' && (
              <span className="text-[9px] text-indigo-600 font-extrabold uppercase block tracking-wider">
                Cota de {members.find(m => m.id === selectedMemberFilter)?.name}
              </span>
            )}
          </div>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
            <DollarSign size={16} />
          </div>
        </div>

        {/* Total do Ano */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-slate-600 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              {type === 'third_party' && selectedMemberFilter !== 'all' ? `Minha Cota no Ano (${currentYear})` : `Total do Ano (${currentYear})`}
            </span>
            <h4 className={`text-lg font-bold text-slate-900 font-mono transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.totalYear.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            {type === 'third_party' && selectedMemberFilter !== 'all' && (
              <span className="text-[9px] text-slate-500 font-extrabold uppercase block tracking-wider">
                Cota acumulada
              </span>
            )}
          </div>
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-600">
            <Calendar size={16} />
          </div>
        </div>

        {/* Total Pago */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-emerald-600 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              {type === 'third_party' && selectedMemberFilter !== 'all' ? 'Minha Cota Paga' : 'Total Pago'}
            </span>
            <h4 className={`text-lg font-bold text-slate-900 font-mono transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.paidMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            {type === 'third_party' && selectedMemberFilter !== 'all' && (
              <span className="text-[9px] text-emerald-600 font-extrabold uppercase block tracking-wider">
                Sua parte quitada
              </span>
            )}
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
            <Check size={16} />
          </div>
        </div>

        {/* Falta Pagar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-amber-600 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              {type === 'third_party' && selectedMemberFilter !== 'all' ? 'Minha Cota Pendente' : 'Falta Pagar'}
            </span>
            <h4 className={`text-lg font-bold text-slate-900 font-mono transition-all ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.pendingMonth.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            {type === 'third_party' && selectedMemberFilter !== 'all' && (
              <span className="text-[9px] text-amber-600 font-extrabold uppercase block tracking-wider">
                Sua parte restante
              </span>
            )}
          </div>
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
            <Clock size={16} />
          </div>
        </div>

        {/* Contas Vencidas */}
        <div className={`bg-white p-4 rounded-xl border border-slate-200 border-l-4 border-l-rose-600 shadow-sm flex items-center justify-between ${stats.overdueCount > 0 ? 'bg-rose-50/10' : ''}`}>
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">
              {type === 'third_party' && selectedMemberFilter !== 'all' ? 'Minha Cota Vencida' : 'Vencidas / Atrasadas'}
            </span>
            <h4 className={`text-lg font-bold font-mono transition-all ${stats.overdueCount > 0 ? 'text-rose-600 font-semibold' : 'text-slate-900'} ${hideValues ? 'blur-md select-none hover:blur-none' : ''}`} title={hideValues ? 'Modo público ativo. Passe o mouse para espiar.' : undefined}>
              R$ {stats.overdueMonthTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h4>
            {stats.overdueCount > 0 && (
              <span className="text-[9px] bg-rose-100 text-rose-700 px-1 py-0.2 rounded font-bold animate-pulse inline-block">
                {stats.overdueCount} {stats.overdueCount === 1 ? 'cota vencida' : 'cotas vencidas'}
              </span>
            )}
          </div>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stats.overdueCount > 0 ? 'bg-rose-100 text-rose-600' : 'bg-rose-50 text-rose-600'}`}>
            <AlertCircle size={16} />
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
        {/* Search Input */}
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
          />
        </div>

        {/* Category Filter */}
        <div className="w-full md:w-48 flex items-center gap-1">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 animate-fade-in"
          >
            <option value="all">Todas as Categorias</option>
            {categoriesList.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          {onManageCategories && (
            <button
              onClick={onManageCategories}
              type="button"
              className="p-2 bg-slate-100 hover:bg-slate-200 text-indigo-600 rounded-lg border border-slate-200 transition"
              title="Gerenciar categorias"
            >
              <Layers size={14} />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="w-full md:w-48">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 px-3 text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="all">Todos os Status</option>
            <option value="pending">Pendentes</option>
            <option value="paid">Pagos</option>
            <option value="needs_amount">⚡ Falta Valor da Fatura</option>
            <option value="recurring">🔁 Recorrentes</option>
          </select>
        </div>

        {/* Sort Selector */}
        <div className="w-full md:w-56 flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-semibold">
          <span className="text-[10px] text-slate-400 font-bold uppercase shrink-0">Ordem:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="w-full bg-transparent border-none text-xs text-slate-700 font-semibold focus:outline-none cursor-pointer"
          >
            <option value="dueDate-asc">Vencimento (Próximas 1º)</option>
            <option value="dueDate-desc">Vencimento (Longe 1º)</option>
            <option value="amount-asc">Valor (Menor 1º)</option>
            <option value="amount-desc">Valor (Maior 1º)</option>
            <option value="description-asc">Nome (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Floating Form Modal OR Edit Drawer */}
      <AnimatePresence>
        {isFormOpen && (
          editingId ? (
            // Edit Drawer (Slides in from the right)
            <div className="fixed inset-0 z-50 flex justify-end">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsFormOpen(false)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              />
              
              {/* Drawer Content */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="relative bg-white border-l border-slate-200 shadow-2xl w-full sm:max-w-md h-full flex flex-col z-10"
                id="expense-edit-drawer"
              >
                {/* Drawer Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div>
                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider mb-1 inline-block">
                      {type === 'personal' ? 'Pessoal' : 'Terceiro / Grupo'}
                    </span>
                    <h3 className="text-base font-black text-slate-900 font-display flex items-center gap-1.5 uppercase tracking-wide">
                      <Edit2 size={16} className="text-indigo-600" />
                      Editar Despesa
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="p-1.5 hover:bg-slate-200/80 text-slate-400 hover:text-slate-600 rounded-lg transition"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Drawer Body - Scrollable Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                  {/* Status Selection Group */}
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Status de Pagamento</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPaid(true);
                          setPaidAtForm(dueDate);
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          isPaid
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Check size={14} className={isPaid ? 'text-emerald-600' : 'text-slate-400'} /> Pago
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPaid(false)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-bold text-center transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          !isPaid
                            ? 'bg-rose-50 border-rose-400 text-rose-700 shadow-sm'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Clock size={14} className={!isPaid ? 'text-rose-500' : 'text-slate-400'} /> Pendente
                      </button>
                    </div>
                  </div>

                  {isPaid && (
                    <div className="flex flex-col space-y-1.5 bg-emerald-50/10 p-3 rounded-xl border border-emerald-100/30 animate-slide-up">
                      <label className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Data do Pagamento</label>
                      <input
                        type="date"
                        required
                        value={paidAtForm}
                        onChange={(e) => setPaidAtForm(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition font-mono font-semibold"
                      />
                    </div>
                  )}

                  {/* Description */}
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Descrição / Conta</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Conta de Luz, Aluguel..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                    />
                  </div>

                  {/* Amount */}
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Valor Exato (R$)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-slate-400 font-medium">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        placeholder="0,00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition font-mono font-semibold text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Valor Pago (Parcial) */}
                  {!isPaid && (
                    <div className="flex flex-col space-y-1.5 bg-indigo-50/20 p-3 rounded-lg border border-indigo-100/50 animate-slide-up">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-indigo-700 uppercase tracking-wide">Valor Pago Parcialmente (Opcional)</label>
                        {amountPaid && parseFloat(amountPaid) > 0 && parseFloat(amount) > 0 && (
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                            Restante: R$ {Math.max(0, parseFloat(amount) - parseFloat(amountPaid)).toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-indigo-400 font-medium">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={amountPaid}
                          onChange={(e) => setAmountPaid(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition font-mono font-semibold text-indigo-900"
                        />
                      </div>
                    </div>
                  )}

                  {/* Category */}
                  <div className="flex flex-col space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Categoria</label>
                    <div className="flex gap-1.5">
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition font-semibold"
                      >
                        {categoriesList.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      {onManageCategories && (
                        <button
                          onClick={onManageCategories}
                          type="button"
                          className="p-2 bg-slate-100 hover:bg-slate-200 text-indigo-600 rounded-lg border border-slate-200 transition"
                          title="Gerenciar categorias"
                        >
                          <Layers size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Responsible member (Only for Third-Party) */}
                  {type === 'third_party' && (
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Responsável pelo Pagamento</label>
                      <select
                        value={responsibleMemberId}
                        onChange={(e) => setResponsibleMemberId(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition font-semibold"
                      >
                        <option value="all">Dividir com todos</option>
                        {members.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Dates Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Transaction Date */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                        <Calendar size={12} className="text-slate-400" /> Compra
                      </label>
                      <input
                        type="date"
                        required
                        value={transactionDate}
                        onChange={(e) => setTransactionDate(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                      />
                    </div>

                    {/* Due Date */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                        <Calendar size={12} className="text-slate-400" /> Vencimento
                      </label>
                      <input
                        type="date"
                        required
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  {/* Recurrence Section */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-3 mt-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isRecurring}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIsRecurring(checked);
                            if (checked) setIsInstallments(false);
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                        />
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                          🔁 Recorrente Mensal (Adicionar todo mês)
                        </span>
                      </label>
                      {isRecurring && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase font-mono ${
                          recurringActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {recurringActive ? 'Ativa' : 'Pausada'}
                        </span>
                      )}
                    </div>

                    {isRecurring && (
                      <div className="bg-white p-3.5 rounded-lg border border-slate-200/80 space-y-3 animate-slide-up text-xs">
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wide block">
                            Status para os Próximos Meses
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setRecurringActive(true)}
                              className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                recurringActive
                                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span>🟢 Ativa (Gerar Todo Mês)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setRecurringActive(false)}
                              className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                                !recurringActive
                                  ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              <span>🔴 Pausar / Desativar</span>
                            </button>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100">
                          <label className="flex items-center space-x-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isVariableValue}
                              onChange={(e) => setIsVariableValue(e.target.checked)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                            />
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                              ⚡ Valor Variável (ex: Luz, Água, Gás)
                            </span>
                          </label>
                          <p className="text-[10px] text-slate-500 font-medium mt-1 leading-relaxed pl-6">
                            Todo mês aparecerá como <strong className="text-amber-700">"Falta colocar valor da fatura"</strong> com o botão rápido para você preencher assim que a fatura chegar!
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Auto Interest Toggle */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 flex items-center justify-between mt-2">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      Ativar Juros Automáticos
                    </span>
                    <input
                      type="checkbox"
                      checked={hasAutoInterest}
                      onChange={(e) => setHasAutoInterest(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                  </div>

                  {/* Automatic Interest Options */}
                  {hasAutoInterest && (
                    <div className="bg-indigo-50/40 border border-indigo-100/80 p-4 rounded-xl animate-slide-up space-y-4">
                      <span className="text-[10px] font-black text-indigo-800 uppercase tracking-wide block">Configurar Juros (Ao vencer)</span>
                      
                      <div className="grid grid-cols-1 gap-3">
                        {/* Frequency */}
                        <div className="flex flex-col space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Frequência</label>
                          <select
                            value={autoInterestFrequency}
                            onChange={(e) => setAutoInterestFrequency(e.target.value as any)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold"
                          >
                            <option value="daily">Diariamente</option>
                            <option value="once">Uma única vez</option>
                          </select>
                        </div>

                        {/* Type & Value Row */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Tipo</label>
                            <select
                              value={autoInterestType}
                              onChange={(e) => setAutoInterestType(e.target.value as any)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold"
                            >
                              <option value="percentage">Porcentagem (%)</option>
                              <option value="fixed">Valor Fixo (R$)</option>
                            </select>
                          </div>

                          <div className="flex flex-col space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              {autoInterestType === 'percentage' ? 'Taxa (%)' : 'Valor (R$)'}
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              required
                              placeholder={autoInterestType === 'percentage' ? 'Ex: 1' : 'Ex: 2.00'}
                              value={autoInterestValue}
                              onChange={(e) => setAutoInterestValue(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono font-semibold"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-indigo-700 font-medium">
                        {autoInterestFrequency === 'daily' ? (
                          <span>* Juros de <strong>{autoInterestValue || '0'}{autoInterestType === 'percentage' ? '%' : ' R$'}</strong> serão acumulados <strong>diariamente</strong> para cada dia em atraso após o vencimento.</span>
                        ) : (
                          <span>* Uma multa/taxa única de <strong>{autoInterestValue || '0'}{autoInterestType === 'percentage' ? '%' : ' R$'}</strong> será aplicada <strong>imediatamente</strong> assim que a conta vencer.</span>
                        )}
                      </p>
                    </div>
                  )}
                </form>

                {/* Drawer Footer Actions */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 space-y-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Check size={14} /> Salvar Alterações
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleDrawerDelete}
                      className="py-2 px-3 border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1"
                    >
                      <Trash2 size={12} /> Excluir
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="py-2 px-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          ) : (
            // Centered Add Form Modal (Same as original)
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsFormOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              
              {/* Modal Box */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: "spring", duration: 0.3 }}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full relative max-h-[90vh] overflow-y-auto z-10"
                id="expense-form-modal"
              >
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-base font-black text-slate-900 font-display flex items-center gap-1.5 uppercase tracking-wide">
                    {editingId ? <Edit2 size={18} className="text-indigo-600" /> : <Plus size={18} className="text-indigo-600" />} 
                    {editingId ? 'Editar Despesa' : 'Adicionar Nova Despesa'}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition"
                  >
                    <X size={18} />
                  </button>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Description */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Descrição / Conta</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Conta de Luz, Aluguel..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                      />
                    </div>

                    {/* Amount */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Valor Exato (R$)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-slate-400 font-medium">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="0,00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                        />
                      </div>
                    </div>

                    {/* Category */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Categoria</label>
                      <div className="flex gap-1.5">
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                        >
                          {categoriesList.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                        {onManageCategories && (
                          <button
                            onClick={onManageCategories}
                            type="button"
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-indigo-600 rounded-lg border border-slate-200 transition"
                            title="Gerenciar categorias"
                          >
                            <Layers size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Responsible member (Only for Third-Party) */}
                    {type === 'third_party' && (
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Responsável pelo Pagamento</label>
                        <select
                          value={responsibleMemberId}
                          onChange={(e) => setResponsibleMemberId(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                        >
                          <option value="all">Dividir com todos</option>
                          {members.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Transaction Date */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                        <Calendar size={12} className="text-slate-400" /> Data da Compra
                      </label>
                      <input
                        type="date"
                        required
                        value={transactionDate}
                        onChange={(e) => setTransactionDate(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                      />
                    </div>

                    {/* Due Date */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                        <Calendar size={12} className="text-slate-400" /> Data de Vencimento
                      </label>
                      <input
                        type="date"
                        required
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                      />
                    </div>
                  </div>

                  {/* Checkboxes parameters */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-wrap gap-4 items-center mt-2">
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isPaid}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsPaid(checked);
                          if (checked) {
                            setPaidAtForm(dueDate);
                          }
                          if (isInstallments && !editingId) {
                            const numInsts = Math.max(1, parseInt(installmentsCount) || 1);
                            const newPaid: {[key: number]: boolean} = {};
                            const newDates: {[key: number]: string} = {};
                            for (let i = 1; i <= numInsts; i++) {
                              newPaid[i] = checked;
                              if (checked) {
                                newDates[i] = getInstallmentDueDate(dueDate, i);
                              }
                            }
                            setFormInstallmentPaid(newPaid);
                            setFormInstallmentPaidDate(newDates);
                          }
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-700">Marcar como Pago</span>
                    </label>

                    {!isRecurring && (
                      <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isInstallments}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIsInstallments(checked);
                            if (checked) setIsRecurring(false);
                            setPaidInstallmentsCount(0);
                            setFormInstallmentPaid({});
                            setFormInstallmentPaidDate({});
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-bold text-slate-700">Parcelado</span>
                      </label>
                    )}

                    {!isInstallments && (
                      <label className="flex items-center space-x-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isRecurring}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setIsRecurring(checked);
                            if (checked) setIsInstallments(false);
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Recorrente Mensal
                        </span>
                      </label>
                    )}

                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={hasAutoInterest}
                        onChange={(e) => setHasAutoInterest(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        Ativar Juros Automáticos
                      </span>
                    </label>
                  </div>

                  {/* Recurrence Sub-options */}
                  {isRecurring && (
                    <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl space-y-3 animate-slide-up text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wide block">
                          🔁 Configurações da Recorrência Mensal
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono ${
                          recurringActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {recurringActive ? 'Ativa' : 'Pausada'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRecurringActive(true)}
                          className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            recurringActive
                              ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>🟢 Ativa (Vem todo mês)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecurringActive(false)}
                          className={`py-2 px-3 rounded-lg border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                            !recurringActive
                              ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>🔴 Pausar / Desativar</span>
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-500 font-medium">
                        {recurringActive 
                          ? '* Adicionada automaticamente todo mês.'
                          : '* Desativada: O sistema não gerará mais nos meses futuros.'}
                      </p>

                      <div className="pt-2 border-t border-indigo-100 space-y-2">
                        <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wide block">
                          Tipo de Valor Mensal
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setIsVariableValue(false)}
                            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                              !isVariableValue 
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' 
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="font-bold text-xs flex items-center gap-1">
                              <span>📌 Valor Fixo Automático</span>
                            </div>
                            <p className={`text-[10px] mt-0.5 ${!isVariableValue ? 'text-indigo-100' : 'text-slate-500'}`}>
                              Virá com o valor preenchido todo mês (ex: Aluguel, Internet).
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setIsVariableValue(true)}
                            className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                              isVariableValue 
                                ? 'bg-amber-600 border-amber-600 text-white shadow-xs' 
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="font-bold text-xs flex items-center gap-1">
                              <span>⚡ Valor Variável (Inserir Todo Mês)</span>
                            </div>
                            <p className={`text-[10px] mt-0.5 ${isVariableValue ? 'text-amber-100' : 'text-slate-500'}`}>
                              Fica zerado para colocar o valor quando a fatura chegar (ex: Luz, Água).
                            </p>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isPaid && !isInstallments && (
                    <div className="flex flex-col space-y-1.5 bg-emerald-50/15 p-4 rounded-xl border border-emerald-100 animate-slide-up">
                      <label className="text-xs font-bold text-emerald-800 uppercase tracking-wide flex items-center gap-1.5">
                        <Calendar size={13} className="text-emerald-600" /> Data do Pagamento
                      </label>
                      <input
                        type="date"
                        required
                        value={paidAtForm}
                        onChange={(e) => setPaidAtForm(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition font-mono font-semibold text-slate-800"
                      />
                    </div>
                  )}

                  {/* Automatic Interest Options */}
                  {hasAutoInterest && (
                    <div className="bg-indigo-50/40 border border-indigo-100/80 p-4 rounded-xl animate-slide-up space-y-4">
                      <span className="text-[10px] font-black text-indigo-800 uppercase tracking-wide block">Configurar Juros Automáticos (Ao vencer)</span>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Frequency */}
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Frequência</label>
                          <select
                            value={autoInterestFrequency}
                            onChange={(e) => setAutoInterestFrequency(e.target.value as any)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold"
                          >
                            <option value="daily">Diariamente</option>
                            <option value="once">Uma única vez</option>
                          </select>
                        </div>

                        {/* Type */}
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">Tipo</label>
                          <select
                            value={autoInterestType}
                            onChange={(e) => setAutoInterestType(e.target.value as any)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold"
                          >
                            <option value="percentage">Porcentagem (%)</option>
                            <option value="fixed">Valor Fixo (R$)</option>
                          </select>
                        </div>

                        {/* Value */}
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            {autoInterestType === 'percentage' ? 'Taxa (%)' : 'Valor (R$)'}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            placeholder={autoInterestType === 'percentage' ? 'Ex: 1' : 'Ex: 2.00'}
                            value={autoInterestValue}
                            onChange={(e) => setAutoInterestValue(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono font-semibold"
                          />
                        </div>
                      </div>
                      
                      <p className="text-[10px] text-indigo-700 font-medium">
                        {autoInterestFrequency === 'daily' ? (
                          <span>* Juros de <strong>{autoInterestValue || '0'}{autoInterestType === 'percentage' ? '%' : ' R$'}</strong> serão acumulados <strong>diariamente</strong> para cada dia em atraso após o vencimento.</span>
                        ) : (
                          <span>* Uma multa/taxa única de <strong>{autoInterestValue || '0'}{autoInterestType === 'percentage' ? '%' : ' R$'}</strong> será aplicada <strong>imediatamente</strong> assim que a conta vencer.</span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Installments options */}
                  {isInstallments && (() => {
                    const numInstallments = Math.max(1, parseInt(installmentsCount) || 1);
                    const inputAmt = parseFloat(amount || '0');
                    let valEach = 0;
                    let valTotal = 0;

                    if (installmentsValueMode === 'total') {
                      valTotal = inputAmt;
                      valEach = numInstallments > 0 ? inputAmt / numInstallments : 0;
                    } else {
                      valEach = inputAmt;
                      valTotal = inputAmt * numInstallments;
                    }

                    return (
                      <div className="bg-amber-50/50 border border-amber-200/60 p-4 rounded-xl animate-slide-up space-y-4">
                        {/* Typable input instead of select */}
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-xs font-bold text-amber-900">Número de Parcelas</label>
                          <input
                            type="number"
                            min="2"
                            step="1"
                            required
                            placeholder="Digite o número de parcelas (ex: 5)"
                            value={installmentsCount}
                            onChange={(e) => setInstallmentsCount(e.target.value)}
                            className="bg-white border border-amber-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono w-full"
                          />
                        </div>

                        {/* Entry mode selector */}
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-[11px] font-bold text-amber-950 uppercase tracking-wider">Como o valor inserido deve ser considerado?</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setInstallmentsValueMode('total')}
                              className={`px-3 py-2 rounded-lg border text-xs font-semibold text-center transition cursor-pointer ${
                                  installmentsValueMode === 'total'
                                  ? 'bg-amber-600 border-amber-600 text-white shadow-sm font-bold'
                                  : 'bg-white border-amber-200 text-amber-900 hover:bg-amber-100/50'
                              }`}
                            >
                              O valor é o TOTAL da compra
                            </button>
                            <button
                              type="button"
                              onClick={() => setInstallmentsValueMode('per_installment')}
                              className={`px-3 py-2 rounded-lg border text-xs font-semibold text-center transition cursor-pointer ${
                                  installmentsValueMode === 'per_installment'
                                  ? 'bg-amber-600 border-amber-600 text-white shadow-sm font-bold'
                                  : 'bg-white border-amber-200 text-amber-900 hover:bg-amber-100/50'
                              }`}
                            >
                              O valor é de CADA parcela
                            </button>
                          </div>
                        </div>

                        {/* Breakdown Summary */}
                        <div className="bg-amber-100/40 border border-amber-200/50 rounded-lg p-3 text-[11px] text-amber-800 space-y-1.5 shadow-sm">
                          <div className="flex justify-between font-medium">
                            <span>Valor de cada parcela ({numInstallments}x):</span>
                            <span className="font-mono font-bold">R$ {valEach.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between border-t border-amber-200/40 pt-1.5 font-bold text-amber-900">
                            <span>Valor Total da Compra:</span>
                            <span className="font-mono font-bold">R$ {valTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                          <p className="text-[9px] text-amber-600/90 font-semibold mt-1">
                            * Serão criados {numInstallments} lançamentos individuais sequenciais no sistema (um para cada mês a partir da data de vencimento).
                          </p>
                        </div>

                        {/* Interactive Installments Payment Picker (Only on creation) */}
                        {!editingId && numInstallments > 1 && (
                          <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 space-y-3 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-extrabold text-slate-800 uppercase tracking-wider block">
                                Parcelas a serem geradas (Toque para marcar pagas)
                              </span>
                              <span className="bg-indigo-50 text-indigo-700 text-[10px] font-black px-2.5 py-1 rounded-full font-mono uppercase">
                                {paidInstallmentsCount} de {numInstallments} pagas
                              </span>
                            </div>
                            
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                              Selecione cada parcela para marcar como paga e registrar a respectiva data de pagamento:
                            </p>

                            <div className="max-h-64 overflow-y-auto space-y-2 pr-1 border border-slate-100 rounded-lg p-2 bg-slate-50/50">
                              {Array.from({ length: numInstallments }).map((_, idx) => {
                                const i = idx + 1;
                                const isInstPaid = !!formInstallmentPaid[i];
                                const instDueDate = getInstallmentDueDate(dueDate, i);
                                const formattedInstDueDate = instDueDate.split('-').reverse().join('/');
                                
                                // Calculate split info
                                let splitInfo = null;
                                if (type === 'third_party' && members.length > 0) {
                                  if (responsibleMemberId === 'all') {
                                    const shareAmt = valEach / members.length;
                                    splitInfo = `Cota: R$ ${shareAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por integrante`;
                                  } else {
                                    const mName = members.find(m => m.id === responsibleMemberId)?.name || '';
                                    splitInfo = `Responsável: ${mName}`;
                                  }
                                }

                                return (
                                  <div
                                    key={i}
                                    onClick={(e) => {
                                      // Prevent trigger if clicking inside the date input or its children
                                      if ((e.target as HTMLElement).closest('input[type="date"]')) {
                                        return;
                                      }
                                      const nextPaid = !isInstPaid;
                                      setFormInstallmentPaid(prev => ({
                                        ...prev,
                                        [i]: nextPaid
                                      }));
                                      if (nextPaid) {
                                        setFormInstallmentPaidDate(prev => ({
                                          ...prev,
                                          [i]: instDueDate
                                        }));
                                      } else {
                                        setFormInstallmentPaidDate(prev => {
                                          const copy = { ...prev };
                                          delete copy[i];
                                          return copy;
                                        });
                                      }
                                    }}
                                    className={`flex flex-col p-2.5 rounded-lg border cursor-pointer transition-all space-y-2 ${
                                      isInstPaid
                                        ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 shadow-sm'
                                        : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex items-center space-x-2.5">
                                        <div className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center transition-all ${
                                          isInstPaid
                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : 'border-slate-300 bg-white'
                                        }`}>
                                          {isInstPaid && (
                                            <svg className="w-3 h-3 stroke-current" viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                              <polyline points="20 6 9 17 4 12" />
                                            </svg>
                                          )}
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-[11px] font-extrabold">Parcela {i} de {numInstallments}</span>
                                          <span className="text-[9px] font-semibold opacity-75">Vencimento: {formattedInstDueDate}</span>
                                        </div>
                                      </div>

                                      <div className="text-right">
                                        <span className="text-xs font-mono font-extrabold block">
                                          R$ {valEach.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                        {splitInfo && (
                                          <span className={`text-[9px] font-semibold block opacity-85 ${isInstPaid ? 'text-emerald-700' : 'text-slate-400'}`}>
                                            {splitInfo}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {isInstPaid && (
                                      <div className="flex items-center gap-2 pt-1.5 border-t border-emerald-100/60 bg-emerald-100/10 p-1.5 rounded-md animate-slide-up">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                                          <Calendar size={11} className="text-emerald-600" /> Pago em:
                                        </span>
                                        <input
                                          type="date"
                                          required
                                          value={formInstallmentPaidDate[i] || instDueDate}
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            setFormInstallmentPaidDate(prev => ({
                                              ...prev,
                                              [i]: val
                                            }));
                                          }}
                                          className="ml-auto bg-white border border-emerald-200 rounded px-2 py-0.5 text-[10px] text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono font-bold"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            
                            {paidInstallmentsCount > 0 ? (
                              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5 text-[10px] text-emerald-800 font-bold flex items-center gap-1.5">
                                <span className="text-sm">🎉</span>
                                <div>
                                  Serão geradas <span className="underline">{paidInstallmentsCount} parcelas como PAGAS</span> e <span className="underline">{numInstallments - paidInstallmentsCount} parcelas como PENDENTES</span>.
                                </div>
                              </div>
                            ) : (
                              <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 text-[10px] text-amber-800 font-bold flex items-center gap-1.5">
                                <span className="text-sm">🕒</span>
                                <div>
                                  Todas as {numInstallments} parcelas serão geradas como <span className="underline">PENDENTES</span>. Clique em alguma parcela acima se desejar marcá-la como paga antecipadamente.
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Form actions */}
                  <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 shadow-sm transition cursor-pointer"
                    >
                      Adicionar Despesa
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )
        )}
      </AnimatePresence>

      {/* Gerenciador de Recorrências Mensais (Modal - Acessível apenas sob demanda) */}
      <AnimatePresence>
        {showRecurringManagerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowRecurringManagerModal(false)}
              className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative bg-slate-900 text-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-800 p-4 sm:p-6 space-y-4 z-10 max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-800 pb-3.5 gap-3">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs shrink-0">
                    <Repeat size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                      <span>Gerenciador de Recorrências</span>
                      <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-800/80 px-2.5 py-0.5 rounded-full font-bold">
                        {type === 'personal' ? 'Pessoais' : 'Terceiros'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 font-medium">
                      {type === 'personal' 
                        ? 'Visualização unificada de todas as despesas recorrentes no passado, presente e futuro.' 
                        : selectedMemberFilter === 'all'
                          ? 'Visualização unificada de despesas recorrentes de terceiros de todos os membros.'
                          : `Despesas recorrentes do membro: ${members.find(m => m.id === selectedMemberFilter)?.name || 'Membro'}.`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {duplicateCount > 0 && (
                    <button
                      type="button"
                      onClick={handleCleanDuplicates}
                      className="px-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Excluir lançamentos duplicados gerados no passado"
                    >
                      <Trash2 size={14} />
                      <span>Limpar {duplicateCount} Duplicado(s)</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowRecurringManagerModal(false);
                      handleOpenAddForm();
                      setIsRecurring(true);
                    }}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>Nova Recorrência</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowRecurringManagerModal(false);
                      setEditingSeriesDayId(null);
                      setEditingSeriesAmountId(null);
                    }}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal Internal Navigation Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                <button
                  type="button"
                  onClick={() => setRecurringModalTab('instances')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
                    recurringModalTab === 'instances'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <FileText size={14} />
                  <span>Listagem de Lançamentos ({allRecurringInstances.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRecurringModalTab('series')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
                    recurringModalTab === 'series'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-800/70 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Repeat size={14} />
                  <span>Configuração das Séries ({recurringSeriesList.length})</span>
                </button>
              </div>

              {/* Tab Content: Listagem de Lançamentos Passado e Futuro */}
              {recurringModalTab === 'instances' && (
                <div className="space-y-3 pt-1">
                  {/* Filters Bar inside Modal */}
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Buscar por nome, valor, data ou categoria..."
                        value={recurringModalSearch}
                        onChange={(e) => setRecurringModalSearch(e.target.value)}
                        className="w-full pl-9 pr-8 py-1.5 bg-slate-900 border border-slate-700/80 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      {recurringModalSearch && (
                        <button
                          type="button"
                          onClick={() => setRecurringModalSearch('')}
                          className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {/* Filter by Series Template */}
                      <select
                        value={recurringModalSeriesFilter}
                        onChange={(e) => setRecurringModalSeriesFilter(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[180px]"
                      >
                        <option value="all">Todas as Séries</option>
                        {recurringSeriesList.map(s => (
                          <option key={s.templateId} value={s.templateId}>
                            {s.description}
                          </option>
                        ))}
                      </select>

                      {/* Filter by Status */}
                      <select
                        value={recurringModalStatusFilter}
                        onChange={(e) => setRecurringModalStatusFilter(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="all">Todos os Status</option>
                        <option value="pending">Apenas Pendentes</option>
                        <option value="paid">Apenas Pagos</option>
                      </select>
                    </div>
                  </div>

                  {/* Results Count & Help Label */}
                  <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 font-medium">
                    <span>Exibindo {filteredRecurringInstances.length} de {allRecurringInstances.length} lançamentos recorrentes cadastrados no histórico</span>
                    <span className="hidden sm:inline">Dica: Altere o status, edite ou exclua qualquer mês diretamente</span>
                  </div>

                  {/* Instance Items List */}
                  {filteredRecurringInstances.length === 0 ? (
                    <div className="p-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 space-y-2">
                      <AlertCircle className="mx-auto text-slate-500" size={24} />
                      <p className="text-xs text-slate-400 italic font-medium">
                        Nenhum lançamento recorrente encontrado com os filtros selecionados.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
                      {filteredRecurringInstances.map((exp) => {
                        const [yStr, mStr] = exp.dueDate.split('-');
                        const monthNames = [
                          "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
                          "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
                        ];
                        const monthName = monthNames[parseInt(mStr, 10) - 1] || mStr;
                        const formattedMonthYear = `${monthName} / ${yStr}`;
                        const currentActualMonth = new Date().toISOString().substring(0, 7);
                        const expMonth = exp.dueDate.substring(0, 7);
                        const isPast = expMonth < currentActualMonth;
                        const isCurrent = expMonth === currentActualMonth;
                        const isFuture = expMonth > currentActualMonth;

                        const memberName = exp.type === 'third_party' 
                          ? (members.find(m => m.id === exp.responsibleMemberId)?.name || 'Todos os Membros')
                          : 'Pessoal';

                        const templateId = exp.recurringTemplateId || exp.id;

                        return (
                          <div
                            key={exp.id}
                            className="p-3.5 bg-slate-800/90 border border-slate-700/80 hover:border-slate-600 rounded-xl transition flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                          >
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-extrabold text-xs text-white group-hover:text-indigo-300 transition">
                                  {exp.description}
                                </span>

                                <span className="text-[9px] bg-slate-900 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded font-semibold">
                                  {exp.category}
                                </span>

                                {/* Period relative badge */}
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                                  isCurrent
                                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                                    : isPast
                                    ? 'bg-slate-700/50 text-slate-300 border-slate-600'
                                    : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                }`}>
                                  {isCurrent ? '📌 Mês Atual' : isPast ? '📜 Passado' : '🔮 Futuro'}
                                </span>

                                {type === 'third_party' && (
                                  <span className="text-[9px] font-bold text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                                    <User size={10} className="text-indigo-400" />
                                    {memberName}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-medium">
                                <span className="text-indigo-300 font-bold bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/60 flex items-center gap-1">
                                  <Calendar size={11} />
                                  Mês: {formattedMonthYear}
                                </span>

                                <span className="flex items-center gap-1">
                                  <Clock size={11} className="text-slate-400" />
                                  Vencimento: {exp.dueDate.split('-').reverse().join('/')}
                                </span>

                                {exp.isVariableValue && (
                                  <span className="text-amber-400 font-bold">⚡ Valor Variável</span>
                                )}
                              </div>
                            </div>

                            {/* Right: Amount & CRUD Action buttons */}
                            <div className="flex flex-wrap items-center justify-between md:justify-end gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-700/60">
                              <span className="font-mono text-xs font-black text-emerald-400 mr-2">
                                R$ {exp.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>

                              {/* Toggle Paid / Pending Button */}
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextPaid = !exp.isPaid;
                                  await onUpdateExpense(exp.id, {
                                    isPaid: nextPaid,
                                    paidAt: nextPaid ? (exp.dueDate || getLocalTodayStr()) : ''
                                  });
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1 shadow-xs ${
                                  exp.isPaid
                                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                                }`}
                                title="Marcar como pago ou pendente neste mês"
                              >
                                {exp.isPaid ? <Check size={11} /> : <Clock size={11} />}
                                <span>{exp.isPaid ? 'Pago' : 'Pendente'}</span>
                              </button>

                              {/* Edit Instance Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setShowRecurringManagerModal(false);
                                  if (onSelectMonth) {
                                    onSelectMonth(exp.dueDate.substring(0, 7));
                                  }
                                  handleOpenEditForm(exp);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 hover:text-white transition cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                                title="Editar campos desta ocorrência específica"
                              >
                                <Edit2 size={11} />
                                <span>Editar</span>
                              </button>

                              {/* Delete Instance Single Month Button */}
                              <button
                                type="button"
                                onClick={async () => {
                                  const isConfirmed = customConfirm
                                    ? await customConfirm("Excluir Este Mês", `Deseja realmente excluir este lançamento recorrente do mês ${formattedMonthYear}?`)
                                    : confirm(`Deseja realmente excluir este lançamento recorrente do mês ${formattedMonthYear}?`);
                                  if (isConfirmed) {
                                    await onDeleteExpense(exp.id, true);
                                  }
                                }}
                                className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-800 text-slate-400 hover:text-rose-300 transition cursor-pointer text-[10px]"
                                title="Excluir apenas esta ocorrência do mês selecionado"
                              >
                                <Trash2 size={12} />
                              </button>

                              {/* Delete Entire Series Button */}
                              <button
                                type="button"
                                onClick={() => handleInitiateDeleteSeries(templateId, exp.description, exp.dueDate.substring(0, 7))}
                                className="px-2 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-200 text-[9px] font-black uppercase tracking-tight transition cursor-pointer"
                                title="Excluir ou encerrar esta série de despesas recorrentes"
                              >
                                Excluir Série
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Tab Content: Configuração das Séries */}
              {recurringModalTab === 'series' && (
                <div className="space-y-3">
                  {/* Active vs Archived Sub-toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowArchivedSeries(false)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          !showArchivedSeries
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        <span>🟢 Séries Ativas ({recurringSeriesList.filter(s => !s.isArchived).length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowArchivedSeries(true)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                          showArchivedSeries
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        <Archive size={13} />
                        <span>Arquivadas ({recurringSeriesList.filter(s => s.isArchived).length})</span>
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                      {showArchivedSeries ? 'Séries arquivadas ficam ocultas do dia a dia' : 'Gerencie ou arquive suas séries de despesas'}
                    </span>
                  </div>

                  {(() => {
                    const displayList = recurringSeriesList.filter(s => showArchivedSeries ? s.isArchived : !s.isArchived);

                    if (displayList.length === 0) {
                      return (
                        <p className="text-xs text-slate-400 py-8 text-center italic">
                          {showArchivedSeries
                            ? 'Nenhuma série recorrente arquivada.'
                            : type === 'personal'
                              ? 'Nenhuma despesa recorrente pessoal ativa cadastrada no sistema.'
                              : selectedMemberFilter === 'all'
                                ? 'Nenhuma despesa recorrente de terceiros ativa cadastrada no sistema.'
                                : `Nenhuma despesa recorrente ativa cadastrada para o membro selecionado.`}
                        </p>
                      );
                    }

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {displayList.map((series) => {
                          const isPaused = !series.recurringActive;
                          const isEditingDay = editingSeriesDayId === series.templateId;
                          const isEditingAmount = editingSeriesAmountId === series.templateId;
                          const memberName = members.find(m => m.id === series.responsibleMemberId)?.name;

                          return (
                            <div 
                              key={series.templateId} 
                              className={`p-4 rounded-xl border transition flex flex-col justify-between space-y-3 ${
                                series.isArchived
                                  ? 'bg-slate-900/90 border-slate-700/80 text-slate-300'
                                  : isPaused 
                                    ? 'bg-rose-950/30 border-rose-900/60 text-rose-100' 
                                    : 'bg-slate-800/80 border-slate-700 text-slate-100'
                              }`}
                            >
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded font-mono border border-indigo-800/50">
                                      {series.category}
                                    </span>
                                    {type === 'third_party' && (
                                      <span className="text-[10px] font-bold text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                                        <User size={10} className="text-indigo-400" />
                                        {memberName || 'Todos os Membros'}
                                      </span>
                                    )}
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                    series.isArchived
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : isPaused 
                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' 
                                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  }`}>
                                    {series.isArchived ? '📦 Arquivada' : isPaused ? '🔴 Pausada' : '🟢 Ativa'}
                                  </span>
                                </div>

                                <h4 className="text-xs font-bold leading-snug">{series.description}</h4>

                                {!series.isArchived && (
                                  <>
                                    {/* Due Date Day Editor */}
                                    <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/60 space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-300 font-semibold flex items-center gap-1">
                                          📅 Dia de Vencimento Mensal:
                                        </span>
                                        {!isEditingDay && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingSeriesDayId(series.templateId);
                                              setNewDayInput(series.dueDateDay);
                                            }}
                                            className="text-[10px] font-bold text-indigo-300 hover:text-white bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60 transition cursor-pointer"
                                          >
                                            ✏️ Alterar Dia
                                          </button>
                                        )}
                                      </div>

                                      {isEditingDay ? (
                                        <div className="flex items-center gap-1.5 pt-1">
                                          <span className="text-[11px] font-medium text-slate-400">Dia:</span>
                                          <input
                                            type="number"
                                            min="1"
                                            max="31"
                                            value={newDayInput}
                                            onChange={(e) => setNewDayInput(e.target.value)}
                                            className="w-16 bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-xs text-white font-mono font-bold focus:outline-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateSeriesDueDateDay(series.templateId, parseInt(newDayInput, 10))}
                                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-extrabold transition cursor-pointer"
                                          >
                                            Salvar p/ Futuros
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingSeriesDayId(null)}
                                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] transition cursor-pointer"
                                          >
                                            X
                                          </button>
                                        </div>
                                      ) : (
                                        <p className="text-[11px] font-mono text-emerald-400 font-bold">
                                          Vence todo dia {series.dueDateDay}
                                        </p>
                                      )}
                                    </div>

                                    {/* Value Mode Editor */}
                                    <div className="bg-slate-900/70 p-2.5 rounded-lg border border-slate-700/60 space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-slate-300 font-semibold">Valor Mensal:</span>
                                        {!isEditingAmount && (
                                          <div>
                                            {series.isVariableValue ? (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setEditingSeriesAmountId(series.templateId);
                                                  setNewAmountInput(series.amount > 0 ? series.amount.toString() : '');
                                                }}
                                                className="text-[10px] font-bold text-amber-300 hover:text-white bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/60 transition cursor-pointer"
                                              >
                                                📌 Mudar p/ Valor Fixo
                                              </button>
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => handleToggleSeriesVariableValue(series, true)}
                                                className="text-[10px] font-bold text-indigo-300 hover:text-white bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/60 transition cursor-pointer"
                                              >
                                                ⚡ Mudar p/ Valor Variável
                                              </button>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {isEditingAmount ? (
                                        <div className="flex items-center gap-1.5 pt-1">
                                          <span className="text-[11px] font-medium text-slate-400">Valor R$:</span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            value={newAmountInput}
                                            onChange={(e) => setNewAmountInput(e.target.value)}
                                            placeholder="0,00"
                                            className="w-24 bg-slate-950 border border-indigo-500 rounded px-2 py-1 text-xs text-white font-mono font-bold focus:outline-none"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleToggleSeriesVariableValue(series, false, parseFloat(newAmountInput))}
                                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-extrabold transition cursor-pointer"
                                          >
                                            Salvar Fixo
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setEditingSeriesAmountId(null)}
                                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] transition cursor-pointer"
                                          >
                                            X
                                          </button>
                                        </div>
                                      ) : (
                                        <div>
                                          {series.isVariableValue ? (
                                            <p className="text-[11px] font-bold text-amber-300">
                                              ⚡ Valor Variável (Preenchido ao receber a fatura)
                                            </p>
                                          ) : (
                                            <p className="text-[11px] font-mono text-indigo-200 font-bold">
                                              📌 Valor Fixo: R$ {series.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-2">
                                {series.isArchived ? (
                                  <button
                                    type="button"
                                    onClick={() => handleArchiveSeries(series.templateId, false)}
                                    className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                                  >
                                    <RotateCcw size={14} />
                                    <span>Desarquivar / Restaurar Série</span>
                                  </button>
                                ) : (
                                  <>
                                    {isPaused ? (
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePauseSeries(series.templateId, currentMonth, true)}
                                        className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black rounded-xl transition shadow-xs flex items-center justify-center gap-1 cursor-pointer uppercase tracking-wider"
                                      >
                                        <PlayCircle size={13} />
                                        <span>Reativar</span>
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePauseSeries(series.templateId, currentMonth, false)}
                                        className="flex-1 py-1.5 px-3 bg-slate-700/80 hover:bg-rose-900/60 text-slate-200 hover:text-rose-200 border border-slate-600 hover:border-rose-700 text-[10px] font-bold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                                      >
                                        <PauseCircle size={13} />
                                        <span>Pausar</span>
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => handleArchiveSeries(series.templateId, true)}
                                      className="px-2.5 py-1.5 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-800/80 text-amber-200 text-[10px] font-bold rounded-xl transition flex items-center gap-1 cursor-pointer shrink-0"
                                      title="Arquivar esta série para escondê-la sem excluir do histórico"
                                    >
                                      <Archive size={13} />
                                      <span>Arquivar</span>
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleInitiateDeleteSeries(series.templateId, series.description, currentMonth)}
                                      className="px-2.5 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800 text-rose-200 text-[10px] font-extrabold rounded-xl transition cursor-pointer shrink-0"
                                      title="Excluir ou encerrar esta série recorrente"
                                    >
                                      Excluir
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Summary of list */}
      <div className="bg-slate-50 p-5 rounded-xl flex justify-between items-center border border-slate-200 shadow-sm">
        <div>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">Total Filtrado do Mês</span>
          <h4 className="text-2xl font-bold text-slate-900 font-display">
            R$ {filteredTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h4>
        </div>
        <div className="text-right text-xs text-slate-500 font-semibold">
          <strong>{filteredExpenses.length}</strong> transações encontradas
        </div>
      </div>

      {/* Bulk Actions Panel */}
      {selectedIds.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-center gap-3 animate-fade-in shadow-sm">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-indigo-900">
              {selectedIds.length} {selectedIds.length === 1 ? 'despesa selecionada' : 'despesas selecionadas'}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleBulkMarkAsPaid}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition shadow-sm cursor-pointer"
            >
              <Check size={14} /> Marcar como Pago
            </button>
            <button
              onClick={handleBulkMarkAsPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 transition shadow-sm cursor-pointer"
            >
              <Clock size={14} /> Marcar como Pendente
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 text-white text-xs font-bold rounded-lg hover:bg-rose-700 transition shadow-sm cursor-pointer"
            >
              <Trash2 size={14} /> Excluir Selecionadas
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="px-3 py-1.5 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancelar Seleção
            </button>
          </div>
        </div>
      )}

      {/* Expenses Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[10px] font-display">
                <th className="px-4 py-4 text-center w-12">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    disabled={selectableExpenses.length === 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4 disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Valor</th>
                <th className="px-6 py-4 text-center">Vencimento</th>
                {type === 'third_party' && <th className="px-6 py-4">Responsável</th>}
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={type === 'third_party' ? 8 : 7} className="px-6 py-12 text-center text-slate-400">
                    Nenhuma despesa encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(exp => {
                  const todayStr = getLocalTodayStr();
                  const calc = calculateExpenseInterest(exp);
                  const isOverdue = calc.isOverdue;
                  const totalInterest = calc.dailyInterest + calc.manualInterest + (calc.autoOnceInterest || 0);

                  // Calculate days until due date
                  const today = new Date(todayStr + 'T12:00:00');
                  const due = new Date(exp.dueDate + 'T12:00:00');
                  const diffTime = due.getTime() - today.getTime();
                  const daysUntilDue = Math.round(diffTime / (1000 * 60 * 60 * 24));
                  const isUpcoming = !exp.isPaid && daysUntilDue >= 0 && daysUntilDue <= 3;

                  // Member-specific individual share calculation
                  const isSplitWithAll = exp.responsibleMemberId === 'all';
                  const myShare = isSplitWithAll 
                    ? calc.currentAmount / Math.max(1, members.length) 
                    : calc.currentAmount;

                  const myPaidShare = exp.isPaid
                    ? myShare
                    : (isSplitWithAll 
                        ? (exp.amountPaid || 0) / Math.max(1, members.length)
                        : (exp.amountPaid || 0));

                  const myPendingShare = Math.max(0, myShare - myPaidShare);
                  const selectedMemberName = members.find(m => m.id === selectedMemberFilter)?.name || '';

                  return (
                    <tr 
                      key={exp.id} 
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button') || target.closest('input') || target.closest('svg') || target.closest('.cursor-pointer')) {
                          return;
                        }
                        handleOpenEditForm(exp);
                      }}
                      className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${selectedIds.includes(exp.id) ? 'bg-indigo-50/30' : ''}`}
                    >
                      <td className="px-4 py-4 text-center w-12">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(exp.id)}
                          disabled={exp.isPaid}
                          onChange={(e) => handleSelectOne(exp.id, e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4 disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </td>
                      {/* Description */}
                      <td className="px-6 py-4">
                        <span className="font-semibold text-slate-900 block">{exp.description}</span>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-slate-500 bg-slate-100/80 border border-slate-200/50 px-1.5 py-0.5 rounded font-mono font-medium">
                            Compra: {exp.transactionDate.split('-').reverse().join('/')}
                          </span>
                          {exp.isInstallments && (
                            <>
                              <button
                                onClick={() => setViewingInstallmentsExpense(exp)}
                                className="text-[10px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 px-1.5 py-0.5 rounded font-medium inline-flex items-center space-x-1 transition cursor-pointer group/badge border border-slate-200/50 hover:border-indigo-100 font-semibold"
                                title="Ver todas as parcelas desta despesa"
                              >
                                <span>Parcela {exp.currentInstallment}/{exp.installmentsCount}</span>
                                <Layers size={10} className="text-slate-400 group-hover/badge:text-indigo-500 transition-colors" />
                              </button>
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100/50 px-1.5 py-0.5 rounded font-mono font-bold" title="Valor total do parcelamento">
                                Total: R$ {getInstallmentSeriesTotal(exp).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </>
                          )}
                          {exp.isRecurring && (
                            <div className="inline-flex items-center gap-1">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                exp.recurringActive === false ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-indigo-50 text-indigo-600'
                              }`}>
                                Recorrente {exp.recurringActive === false ? '(Pausada)' : ''}
                              </span>
                              <button
                                type="button"
                                onClick={() => onUpdateExpense(exp.id, { recurringActive: exp.recurringActive === false })}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition border cursor-pointer ${
                                  exp.recurringActive === false 
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                }`}
                                title={exp.recurringActive === false ? 'Reativar despesa recorrente nos próximos meses' : 'Pausar despesa nos próximos meses'}
                              >
                                {exp.recurringActive === false ? '🟢 Reativar' : '🔴 Pausar'}
                              </button>
                            </div>
                          )}
                          {(exp.needsAmount || (exp.isVariableValue && exp.amount === 0 && !exp.isPaid)) && (
                            <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded font-black">
                              ⚡ Falta Valor
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Category */}
                      <td className="px-6 py-4 text-slate-500">
                        {exp.category}
                      </td>
                      {/* Amount */}
                      <td className="px-6 py-4 font-mono">
                        {(exp.needsAmount || (exp.isVariableValue && exp.amount === 0 && !exp.isPaid)) ? (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg inline-block">
                              Aguardando Fatura
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setQuickFillExpense(exp);
                                setQuickFillAmount('');
                                setQuickFillMarkAsPaid(true);
                              }}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black rounded-lg shadow-sm flex items-center gap-1 transition cursor-pointer"
                            >
                              ✏️ Digitar Valor da Fatura
                            </button>
                          </div>
                        ) : type === 'third_party' && selectedMemberFilter !== 'all' ? (
                          <>
                            {myPaidShare > 0 && !exp.isPaid ? (
                              <div className="bg-indigo-600 text-white p-2 rounded-lg space-y-0.5 shadow-2xs">
                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-300 block">
                                  Falta Cota: R$ {myPendingShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-indigo-100 block">
                                  Cota Total: R$ {myShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • Pago: R$ {myPaidShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            ) : (
                              <>
                                <span className="font-extrabold text-indigo-700 block text-xs bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100/30 inline-block mb-1">
                                  Cota: R$ {myShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-semibold">
                                  Total despesa: R$ {calc.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </>
                            )}
                          </>
                        ) : (
                          <>
                            {exp.amountPaid !== undefined && exp.amountPaid > 0 && !exp.isPaid ? (
                              <div className="bg-amber-50 border border-amber-300 p-2 rounded-xl space-y-0.5 shadow-2xs">
                                <span className="text-[9px] font-black uppercase text-amber-900 tracking-wider block">
                                  Falta Pagar:
                                </span>
                                <span className="text-sm font-black text-amber-700 block font-mono">
                                  R$ {Math.max(0, calc.currentAmount - exp.amountPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <div className="text-[10px] text-slate-500 font-medium pt-1 border-t border-amber-200">
                                  <span className="line-through text-slate-400">Total: R$ {calc.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  <span className="text-emerald-700 font-bold block">Pago: R$ {exp.amountPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="font-bold text-slate-900 block">
                                R$ {calc.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </>
                        )}
                        {totalInterest > 0 && (
                          <span className="text-[9px] text-amber-600 block leading-tight mt-0.5">
                            Original: R$ {calc.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        )}
                      </td>
                      {/* Dates */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-center justify-center space-y-1">
                          {exp.isPaid ? (
                            <span className="inline-flex items-center justify-center gap-1 font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-xs shadow-sm w-full max-w-[130px]">
                              Venceu: {exp.dueDate.split('-').reverse().join('/')}
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center justify-center gap-1 font-mono font-extrabold text-rose-700 bg-rose-50 border border-rose-300 px-2.5 py-1 rounded-lg text-xs shadow-sm animate-pulse w-full max-w-[130px]">
                              Vence: {exp.dueDate.split('-').reverse().join('/')}
                            </span>
                          ) : isUpcoming ? (
                            <span className="inline-flex items-center justify-center gap-1 font-mono font-extrabold text-amber-700 bg-amber-50 border border-amber-300 px-2.5 py-1 rounded-lg text-xs shadow-sm w-full max-w-[130px]">
                              Vence: {exp.dueDate.split('-').reverse().join('/')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center gap-1 font-mono font-bold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg text-xs shadow-sm w-full max-w-[130px]">
                              Vence: {exp.dueDate.split('-').reverse().join('/')}
                            </span>
                          )}

                          {exp.isPaid && exp.paidAt && (
                            <span className="text-[10px] text-emerald-600 font-bold block text-center bg-emerald-100/30 py-0.5 px-1.5 rounded border border-emerald-200/20 w-full max-w-[130px]">
                              Pago em: {exp.paidAt.split('-').reverse().join('/')}
                            </span>
                          )}
                          {!exp.isPaid && isOverdue && (
                            <span className="text-[9px] text-rose-600 font-extrabold bg-rose-100/50 border border-rose-200/50 px-1.5 py-0.5 rounded block text-center uppercase tracking-wider w-full max-w-[130px]">
                              Atrasado!
                            </span>
                          )}
                          {!exp.isPaid && isUpcoming && (
                            <span className="text-[9px] text-amber-700 font-extrabold bg-amber-100/50 border border-amber-200/50 px-1.5 py-0.5 rounded block text-center uppercase tracking-wider animate-pulse w-full max-w-[130px]">
                              {daysUntilDue === 0 ? 'Vence HOJE!' : `Vence em ${daysUntilDue} dias`}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Responsible (Only for third-party) */}
                      {type === 'third_party' && (
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-1.5 text-slate-900">
                            <User size={12} className="text-slate-400" />
                            <span>
                              {exp.responsibleMemberId === 'all' 
                                ? 'Todos (Dividido)' 
                                : members.find(m => m.id === exp.responsibleMemberId)?.name || 'Carregando...'}
                            </span>
                          </div>
                        </td>
                      )}
                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => {
                            if (exp.isPaid) {
                              onUpdateExpense(exp.id, { isPaid: false });
                            } else {
                              setQuickPaymentDate(exp.dueDate);
                              setQuickPaymentAmount(exp.amount > 0 ? exp.amount.toString() : '');
                              setQuickPaymentExpense(exp);
                            }
                          }}
                          className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase transition cursor-pointer ${
                            exp.isPaid 
                              ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' 
                              : isOverdue
                              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 animate-pulse'
                              : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {exp.isPaid ? (
                            <>
                              <Check size={10} /> <span>Pago</span>
                            </>
                          ) : (
                            <>
                              <Clock size={10} /> <span>{isOverdue ? 'Atrasado' : 'Pendente'}</span>
                            </>
                          )}
                        </button>
                      </td>
                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-1">
                          {exp.isInstallments && (
                            <button
                              onClick={() => setViewingInstallmentsExpense(exp)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition cursor-pointer"
                              title="Ver todas as parcelas"
                            >
                              <Layers size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenEditForm(exp)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition"
                            title="Editar"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => onDeleteExpense(exp.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <InstallmentsModal
        isOpen={!!viewingInstallmentsExpense}
        onClose={() => setViewingInstallmentsExpense(null)}
        baseExpense={viewingInstallmentsExpense}
        expenses={expenses}
        onUpdateExpense={onUpdateExpense}
        onDeleteExpense={onDeleteExpense}
        members={members}
        customConfirm={customConfirm}
        onEditExpense={(exp) => {
          setViewingInstallmentsExpense(null);
          handleOpenEditForm(exp);
        }}
      />

      {/* Floating Pix Payment Bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40 w-[95%] max-w-2xl bg-[#f5c518] rounded-2xl shadow-xl px-6 py-4 flex items-center justify-between gap-4 border border-amber-500/20 animate-slide-up">
          <div className="flex items-center">
            {/* Number of selected items */}
            <div className="flex flex-col items-center justify-center text-slate-900 leading-none pr-4 border-r border-slate-900/15">
              <span className="text-3xl font-black font-display tracking-tight">{selectedIds.length}</span>
              <span className="text-[9px] font-black tracking-wider uppercase mt-1">Selecionados</span>
            </div>
            
            {/* Total to pay */}
            <div className="flex flex-col justify-center pl-4 text-slate-900 leading-none">
              <span className="text-xl md:text-2xl font-black font-mono">
                R$ {selectedTotalWithInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[9px] font-black tracking-wider uppercase mt-1 text-slate-850">Total Restante</span>
            </div>
          </div>
          
          {/* Action button */}
          <button
            onClick={() => setIsPixModalOpen(true)}
            className="bg-slate-50 hover:bg-white text-slate-900 px-5 py-3.5 rounded-xl md:rounded-2xl flex items-center gap-2 font-black text-xs uppercase tracking-wider shadow-sm hover:shadow-md transition duration-200 cursor-pointer"
          >
            <QrCode size={16} className="text-slate-900" />
            <span>Pagar com Pix</span>
          </button>
        </div>
      )}

      {/* Pix Payment Modal */}
      <PixPaymentModal
        isOpen={isPixModalOpen}
        onClose={() => setIsPixModalOpen(false)}
        selectedExpenses={selectedExpenses}
        onConfirmPayment={handleBulkMarkAsPaid}
      />

      {/* Quick Payment Date Modal */}
      <AnimatePresence>
        {quickPaymentExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuickPaymentExpense(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-150 p-6 space-y-5 z-10"
            >
              <div className="space-y-1">
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider block">Registrar Pagamento</span>
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {quickPaymentExpense.description}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Selecione o dia em que esta conta foi paga. Ideal para organizar históricos retroativos!
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">Data do Pagamento</label>
                <input
                  type="date"
                  required
                  value={quickPaymentDate}
                  onChange={(e) => setQuickPaymentDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition font-mono font-bold text-slate-800"
                />
              </div>

              {(quickPaymentExpense.needsAmount || (quickPaymentExpense.isVariableValue && quickPaymentExpense.amount === 0) || quickPaymentExpense.amount === 0) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-amber-700 uppercase tracking-wider block flex items-center gap-1">
                    ⚡ Valor da Fatura (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0,00"
                      value={quickPaymentAmount}
                      onChange={(e) => setQuickPaymentAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                    />
                  </div>
                </div>
              )}

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickPaymentExpense(null)}
                  className="flex-1 py-2.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-100 transition cursor-pointer text-center"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const parsedAmt = parseFloat(quickPaymentAmount);
                    const updateData: any = {
                      isPaid: true,
                      paidAt: quickPaymentDate || getLocalTodayStr()
                    };
                    if (!isNaN(parsedAmt) && parsedAmt > 0) {
                      updateData.amount = parsedAmt;
                      updateData.originalAmount = parsedAmt;
                      updateData.needsAmount = false;
                    }
                    await onUpdateExpense(quickPaymentExpense.id, updateData);
                    setQuickPaymentExpense(null);
                  }}
                  className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition shadow-md shadow-emerald-100 cursor-pointer text-center"
                >
                  Confirmar Pago
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Fill Bill Amount Modal */}
      <AnimatePresence>
        {quickFillExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuickFillExpense(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 z-10"
            >
              <div className="space-y-1">
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-wider block flex items-center gap-1">
                  ⚡ Preencher Fatura do Mês
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  {quickFillExpense.description}
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Digite o valor final gerado na fatura deste mês.
                </p>
              </div>

              <form onSubmit={handleSaveQuickFillAmount} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider block">
                    Valor da Fatura (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-xs text-slate-400 font-bold">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      autoFocus
                      placeholder="0,00"
                      value={quickFillAmount}
                      onChange={(e) => setQuickFillAmount(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white transition"
                    />
                  </div>
                </div>

                <label className="flex items-center space-x-2 cursor-pointer select-none bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  <input
                    type="checkbox"
                    checked={quickFillMarkAsPaid}
                    onChange={(e) => setQuickFillMarkAsPaid(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Marcar como PAGO agora mesmo
                  </span>
                </label>

                <div className="flex space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setQuickFillExpense(null)}
                    className="flex-1 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer text-center"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider rounded-xl transition shadow-md cursor-pointer text-center"
                  >
                    Salvar Valor
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal para Escolher o Tipo de Exclusão da Série Recorrente */}
      <AnimatePresence>
        {deleteSeriesTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-lg w-full p-6 text-slate-100 space-y-5"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
                    <Trash2 size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold font-display text-white">
                      Remover Despesa Recorrente
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Escolha como deseja excluir <strong className="text-indigo-300">"{deleteSeriesTarget.description}"</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteSeriesTarget(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Month Selection Box */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <label className="text-xs font-bold text-amber-300 uppercase tracking-wide block flex items-center gap-1.5">
                  📅 Mês de Início para Cancelamento / Exclusão:
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="month"
                    value={deleteSeriesTarget.fromMonth}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        const preservedCount = expenses.filter(exp => 
                          (exp.id === deleteSeriesTarget.templateId || exp.recurringTemplateId === deleteSeriesTarget.templateId) &&
                          (exp.isPaid || (exp.dueDate && exp.dueDate.substring(0, 7) < val))
                        ).length;
                        setDeleteSeriesTarget(prev => prev ? { ...prev, fromMonth: val, paidCount: preservedCount } : null);
                      }
                    }}
                    className="bg-slate-900 border border-indigo-500/60 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-300 font-semibold">
                    A partir de: <strong className="text-indigo-300 font-mono text-sm">{deleteSeriesTarget.fromMonth.split('-').reverse().join('/')}</strong>
                  </span>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-1 text-xs">
                <p className="text-slate-300">
                  Total de ocorrências da despesa: <strong className="text-white font-mono">{deleteSeriesTarget.totalCount}</strong>
                </p>
                <p className="text-slate-400">
                  Lançamentos anteriores a <strong className="text-amber-300 font-mono">{deleteSeriesTarget.fromMonth.split('-').reverse().join('/')}</strong> ou já pagos (preservados): <strong className="text-emerald-400 font-mono">{deleteSeriesTarget.paidCount}</strong>
                </p>
              </div>

              <div className="space-y-3 pt-1">
                {/* Opção 1: Encerrar a partir do mês selecionado mantendo o histórico */}
                <button
                  type="button"
                  onClick={() => handleEndSeriesKeepHistory(deleteSeriesTarget.templateId, deleteSeriesTarget.fromMonth)}
                  className="w-full text-left p-4 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-700/60 hover:border-indigo-500 rounded-xl transition cursor-pointer group space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-200 group-hover:text-white flex items-center gap-1.5 uppercase tracking-wide">
                      <Check size={14} className="text-emerald-400" />
                      1. Cancelar a partir de {deleteSeriesTarget.fromMonth.split('-').reverse().join('/')} (Manter Histórico Passado)
                    </span>
                    <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase">
                      Recomendado
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-normal leading-relaxed pl-5">
                    Exclui do banco de dados os lançamentos pendentes de <strong>{deleteSeriesTarget.fromMonth.split('-').reverse().join('/')} em diante</strong>. Os <strong>{deleteSeriesTarget.paidCount} lançamentos anteriores ao mês selecionado e/ou já pagos</strong> continuarão gravados intactos no seu histórico e relatórios.
                  </p>
                </button>

                {/* Opção 2: Excluir Tudo do Banco */}
                <button
                  type="button"
                  onClick={() => handleDeleteEntireSeries(deleteSeriesTarget.templateId)}
                  className="w-full text-left p-4 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-900/60 hover:border-rose-700 rounded-xl transition cursor-pointer group space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 group-hover:text-rose-100 flex items-center gap-1.5 uppercase tracking-wide">
                      <AlertCircle size={14} className="text-rose-400" />
                      2. Excluir TUDO do Banco (Apagar Todos os Meses)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-normal leading-relaxed pl-5">
                    Exclui permanentemente <strong>todas as {deleteSeriesTarget.totalCount} ocorrências</strong> de todos os meses (passados e futuros), apagando também o histórico.
                  </p>
                </button>

                {/* Opção 3: Arquivar Série (Ocultar do Gerenciador) */}
                <button
                  type="button"
                  onClick={() => {
                    handleArchiveSeries(deleteSeriesTarget.templateId, true);
                    setDeleteSeriesTarget(null);
                  }}
                  className="w-full text-left p-4 bg-amber-950/30 hover:bg-amber-900/50 border border-amber-900/60 hover:border-amber-700 rounded-xl transition cursor-pointer group space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-200 group-hover:text-white flex items-center gap-1.5 uppercase tracking-wide">
                      <Archive size={14} className="text-amber-400" />
                      3. Arquivar Série (Ocultar do Gerenciador sem Excluir)
                    </span>
                    <span className="text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase">
                      Oculta da Lista
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-normal leading-relaxed pl-5">
                    Mantém todos os lançamentos intactos no histórico e nos meses anteriores, mas oculta a série da aba de séries ativas do gerenciador para não poluir sua visualização.
                  </p>
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteSeriesTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
