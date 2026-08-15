import React, { useEffect, useState, useMemo } from 'react';
import { Member, Expense } from '../types';
import { sendSafeNotification } from '../utils/notifications';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { 
  ShieldCheck, 
  Calendar, 
  Download, 
  FileText, 
  Check, 
  Clock, 
  User, 
  TrendingUp, 
  QrCode, 
  AlertTriangle, 
  Layers, 
  Eye, 
  X,
  Sparkles,
  Info,
  Bell,
  BellOff,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  LogOut,
  Share2,
  Filter
} from 'lucide-react';
import { calculateExpenseInterest, getLocalTodayStr } from '../utils/interest';
import PixPaymentModal from './PixPaymentModal';
import { SecretLogo } from './SecretLogo';
import { motion, AnimatePresence } from 'motion/react';

interface MemberViewerProps {
  shareToken: string;
  onExitSharedView?: () => void;
  onInstallApp?: () => void;
  showInstallBtn?: boolean;
}

// Extract base description by removing "(current/total)" suffix for installments
function getBaseDescription(description: string): string {
  return description.replace(/\s*\(\d+\/\d+\)$/, '').trim();
}

export default function MemberViewer({ 
  shareToken, 
  onExitSharedView, 
  onInstallApp, 
  showInstallBtn 
}: MemberViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [groupMembers, setGroupMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Modal for PWA / Home Screen shortcut instructions
  const [showPwaGuideModal, setShowPwaGuideModal] = useState(false);

  // Persistent user selections (across months!)
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [isPixModalOpen, setIsPixModalOpen] = useState(false);
  const [activeInstallmentExpense, setActiveInstallmentExpense] = useState<Expense | null>(null);

  // Year-Month navigation for history viewing
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Local state for sorting and status filtering
  const [sortBy, setSortBy] = useState<'dueDate-asc' | 'dueDate-desc' | 'amount-asc' | 'amount-desc' | 'description-asc'>('dueDate-asc');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');

  // Browser notification subscription state
  const [isSubscribed, setIsSubscribed] = useState(() => {
    try {
      const saved = localStorage.getItem('subscribedShareTokens');
      if (saved) {
        const parsed = JSON.parse(saved) as Array<{ shareToken: string }>;
        return parsed.some(item => item.shareToken === shareToken);
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  });

  // Check notifications for subscribed share tokens (shared sheets)
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const checkSubscribedNotifications = async () => {
      const savedSubs = localStorage.getItem('subscribedShareTokens');
      if (!savedSubs) return;

      try {
        const subs = JSON.parse(savedSubs) as Array<{
          shareToken: string;
          name: string;
          userId: string;
          lastNotifiedDate?: string;
        }>;

        if (subs.length === 0) return;

        const todayStr = getLocalTodayStr();

        let updated = false;

        for (let i = 0; i < subs.length; i++) {
          const sub = subs[i];
          if (sub.lastNotifiedDate === todayStr) continue;

          const qExpenses = query(
            collection(db, 'expenses'),
            where('userId', '==', sub.userId),
            where('memberShareTokens', 'array-contains', sub.shareToken)
          );

          const [snap, membersSnap] = await Promise.all([
            getDocs(qExpenses),
            getDocs(query(collection(db, 'members'), where('userId', '==', sub.userId)))
          ]);

          const groupMembersList = membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Member);
          const totalMembersCount = groupMembersList.length || 1;

          const overdueItems: Array<{ 
            exp: Expense; 
            shareOriginal: number; 
            shareCurrent: number; 
            shareInterest: number; 
            daysOverdue: number 
          }> = [];

          const upcomingItems: Array<{ exp: Expense; shareAmount: number; daysUntilDue: number }> = [];

          const todayObj = new Date(todayStr + 'T12:00:00');

          snap.docs.forEach(doc => {
            const exp = doc.data() as Expense;
            if (exp.type === 'personal' || exp.isPaid || exp.recurringActive === false) return;

            const calc = calculateExpenseInterest(exp);
            const dueObj = new Date(exp.dueDate + 'T12:00:00');
            const diffTime = dueObj.getTime() - todayObj.getTime();
            const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            const isSplit = exp.responsibleMemberId === 'all';
            const shareOriginal = isSplit ? (calc.originalAmount / totalMembersCount) : calc.originalAmount;
            const shareCurrent = isSplit ? (calc.currentAmount / totalMembersCount) : calc.currentAmount;
            const shareInterest = isSplit ? ((calc.currentAmount - calc.originalAmount) / totalMembersCount) : (calc.currentAmount - calc.originalAmount);

            if (calc.daysOverdue > 0 || daysUntilDue < 0) {
              const daysOver = calc.daysOverdue || Math.abs(daysUntilDue);
              overdueItems.push({ 
                exp, 
                shareOriginal, 
                shareCurrent, 
                shareInterest, 
                daysOverdue: daysOver 
              });
            } else if (daysUntilDue >= 0 && daysUntilDue <= 3) {
              upcomingItems.push({ exp, shareAmount: shareCurrent, daysUntilDue });
            }
          });

          if (overdueItems.length > 0 || upcomingItems.length > 0) {
            const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            
            const overdueTextList = overdueItems.map(item => {
              const { exp, shareOriginal, shareCurrent, shareInterest, daysOverdue } = item;
              const isSplit = exp.responsibleMemberId === 'all';
              const interestText = shareInterest > 0 
                ? ` (Original: ${formatCurrency(shareOriginal)} + ${formatCurrency(shareInterest)} juros)` 
                : '';
              const valueText = isSplit 
                ? `Sua cota: ${formatCurrency(shareCurrent)}${interestText}` 
                : `${formatCurrency(shareCurrent)}${interestText}`;

              return `• ⚠️ ${exp.description}: ${valueText} - Vencida há ${daysOverdue} dia(s)`;
            });

            const upcomingTextList = upcomingItems.map(item => {
              const { exp, shareAmount, daysUntilDue } = item;
              const dueInfo = daysUntilDue === 0 ? 'Vence HOJE!' : `Vence em ${daysUntilDue} dia(s)`;
              return `• 🔔 ${exp.description}: ${formatCurrency(shareAmount)} [${dueInfo}]`;
            });

            const sections: string[] = [];
            if (overdueItems.length > 0) {
              sections.push(`⚠️ CONTAS VENCIDAS (Alerta Diário até Quitação):\n` + overdueTextList.join('\n'));
            }
            if (upcomingItems.length > 0) {
              sections.push(`🔔 VENCENDO EM BREVE:\n` + upcomingTextList.join('\n'));
            }

            const bodyText = sections.join('\n\n');

            await sendSafeNotification(
              overdueItems.length > 0 
                ? `⚠️ Contas Vencidas - ${sub.name} 🔔` 
                : `Lembrete de Despesas (${sub.name}) 🔔`, 
              {
                body: bodyText.length > 1000 ? bodyText.substring(0, 997) + '...' : bodyText,
                requireInteraction: true
              }
            );

            sub.lastNotifiedDate = todayStr;
            updated = true;
          }
        }

        if (updated) {
          localStorage.setItem('subscribedShareTokens', JSON.stringify(subs));
        }
      } catch (err) {
        console.error('Erro ao verificar notificações de links inscritos:', err);
      }
    };

    const timer = setTimeout(() => {
      checkSubscribedNotifications();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const handleToggleSubscription = async () => {
    const isIframe = window.self !== window.top;
    if (isIframe) {
      alert("⚠️ Limitação de iFrame do AI Studio:\n\nComo você está visualizando o aplicativo dentro do painel do AI Studio, os navegadores bloqueiam solicitações de notificação por segurança.\n\nPara ativar de verdade, por favor abra o aplicativo em uma NOVA ABA (clicando no botão de quadrado com seta no canto superior direito do painel) e depois clique em 'Ativar Lembretes'!");
      return;
    }

    if (!('Notification' in window)) {
      alert("Seu navegador não suporta notificações de desktop.");
      return;
    }

    if (Notification.permission === 'denied') {
      alert("As notificações foram bloqueadas no seu navegador para esta página. Para receber avisos, clique no ícone de cadeado na barra de endereço ao lado da URL, mude a permissão de notificações para 'Permitir' e recarregue a página.");
      return;
    }

    try {
      if (!isSubscribed) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const saved = localStorage.getItem('subscribedShareTokens');
          let list = [];
          if (saved) {
            try {
              list = JSON.parse(saved);
            } catch (e) {
              list = [];
            }
          }
          
          if (!list.some((item: any) => item.shareToken === shareToken)) {
            list.push({
              shareToken: shareToken,
              name: member?.name || 'Membro',
              userId: member?.userId || '',
              lastNotifiedDate: ''
            });
            localStorage.setItem('subscribedShareTokens', JSON.stringify(list));
          }
          setIsSubscribed(true);
          await sendSafeNotification(`Lembretes Ativados! 🔔`, {
            body: `Você começará a receber notificações de despesas de ${member?.name || 'Membro'} vencendo ou vencidas.`,
          });
        } else {
          alert("Permissão de notificação não concedida. Por favor, permita as notificações para ativar.");
        }
      } else {

        const saved = localStorage.getItem('subscribedShareTokens');
        if (saved) {
          try {
            let list = JSON.parse(saved);
            list = list.filter((item: any) => item.shareToken !== shareToken);
            localStorage.setItem('subscribedShareTokens', JSON.stringify(list));
          } catch (e) {
            console.error(e);
          }
        }
        setIsSubscribed(false);
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao configurar notificações.");
    }
  };

  useEffect(() => {
    if (!shareToken) return;

    setLoading(true);
    setError(null);

    // 1. Fetch the member document with the matching shareToken
    const fetchMember = async () => {
      const qMembers = query(collection(db, 'members'), where('shareToken', '==', shareToken));
      try {
        const snap = await getDocs(qMembers);
        if (snap.empty) {
          setError("Link de compartilhamento inválido ou expirado.");
          setLoading(false);
          return;
        }
        
        const mDoc = snap.docs[0];
        const mData = { id: mDoc.id, ...mDoc.data() } as Member;
        setMember(mData);

        // 2. Fetch all members in this group (to calculate split ratios correctly)
        const qAllMembers = query(collection(db, 'members'), where('userId', '==', mData.userId));
        const allSnap = await getDocs(qAllMembers);
        const allMembersList = allSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Member);
        setGroupMembers(allMembersList);

        // 3. Setup real-time listener for expenses that involve this member's shareToken
        const qExpenses = query(
          collection(db, 'expenses'),
          where('userId', '==', mData.userId),
          where('memberShareTokens', 'array-contains', shareToken)
        );

        const unsub = onSnapshot(qExpenses, (snapExp) => {
          const list = snapExp.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Expense);
          setExpenses(list);
          setLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.LIST, 'expenses');
          setError("Erro ao sincronizar despesas em tempo real.");
          setLoading(false);
        });

        return unsub;
      } catch (err) {
        console.error(err);
        setError("Não foi possível carregar as despesas.");
        setLoading(false);
      }
    };

    let unsubscribe: any;
    fetchMember().then(unsub => {
      unsubscribe = unsub;
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [shareToken]);

  // List of months for dropdown historical switcher
  const availableMonths = useMemo(() => {
    if (expenses.length === 0) return [currentMonth];
    const monthsSet = new Set<string>();
    expenses.forEach(e => {
      if (e.dueDate && e.recurringActive !== false) {
        monthsSet.add(e.dueDate.substring(0, 7));
      }
    });
    monthsSet.add(currentMonth); // ensure current is always there
    return Array.from(monthsSet).sort().reverse();
  }, [expenses, currentMonth]);

  // Filtered expenses for selected month & status
  const filteredExpenses = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return expenses
      .filter(exp => exp.type === 'third_party' || exp.type !== 'personal')
      .filter(exp => exp.recurringActive !== false)
      .filter(exp => exp.dueDate.startsWith(currentMonth))
      .filter(exp => {
        if (statusFilter === 'pending') {
          return !exp.isPaid;
        }
        if (statusFilter === 'paid') {
          return exp.isPaid;
        }
        if (statusFilter === 'overdue') {
          return !exp.isPaid && new Date(exp.dueDate) < new Date(todayStr);
        }
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
  }, [expenses, currentMonth, statusFilter, sortBy]);

  // Overdue expenses calculation for this shared link view (all unpaid overdue items)
  const overdueExpensesList = useMemo(() => {
    const memberCount = Math.max(1, groupMembers.length);
    return expenses
      .filter(exp => exp.type !== 'personal' && exp.recurringActive !== false && !exp.isPaid)
      .map(exp => {
        const calc = calculateExpenseInterest(exp);
        const isSplit = exp.responsibleMemberId === 'all';
        const myShareCurrent = isSplit ? (calc.currentAmount / memberCount) : calc.currentAmount;
        const myShareOriginal = isSplit ? (calc.originalAmount / memberCount) : calc.originalAmount;
        const myShareInterest = isSplit ? ((calc.currentAmount - calc.originalAmount) / memberCount) : (calc.currentAmount - calc.originalAmount);
        return {
          exp,
          calc,
          myShareCurrent,
          myShareOriginal,
          myShareInterest
        };
      })
      .filter(item => item.calc.daysOverdue > 0);
  }, [expenses, groupMembers]);

  // Active notification trigger for guest currently viewing their link
  useEffect(() => {
    if (!shareToken || !expenses.length || !member) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const todayStr = getLocalTodayStr();
    const lastNotifiedKey = `lastNotified_share_${shareToken}`;
    if (localStorage.getItem(lastNotifiedKey) === todayStr) return;

    if (overdueExpensesList.length > 0) {
      const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const details = overdueExpensesList.map(({ exp, calc, myShareCurrent, myShareOriginal, myShareInterest }) => {
        const isSplit = exp.responsibleMemberId === 'all';
        const interestText = myShareInterest > 0 
          ? ` (Original: ${formatCurrency(myShareOriginal)} + ${formatCurrency(myShareInterest)} juros)` 
          : '';
        const valueText = isSplit 
          ? `Sua cota: ${formatCurrency(myShareCurrent)}${interestText}` 
          : `${formatCurrency(myShareCurrent)}${interestText}`;

        return `• ⚠️ ${exp.description}: ${valueText} - Vencida há ${calc.daysOverdue} dia(s)`;
      }).join('\n');

      const bodyText = `Lembrete Diário: Você possui ${overdueExpensesList.length} despesa(s) vencida(s). Você receberá este alerta diariamente até que a despesa seja quitada:\n\n${details}`;

      sendSafeNotification(`⚠️ Alerta Diário: Despesas Vencidas (${member.name}) 🔔`, {
        body: bodyText.length > 1000 ? bodyText.substring(0, 997) + '...' : bodyText,
        requireInteraction: true
      });

      localStorage.setItem(lastNotifiedKey, todayStr);
    }
  }, [shareToken, expenses, member, overdueExpensesList]);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    let newYear = year;
    let newMonth = month - 1;
    if (newMonth === 0) {
      newMonth = 12;
      newYear -= 1;
    }
    setCurrentMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    let newYear = year;
    let newMonth = month + 1;
    if (newMonth === 13) {
      newMonth = 1;
      newYear += 1;
    }
    setCurrentMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  // Today's formatted date
  const formattedToday = useMemo(() => {
    const today = new Date();
    return today.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }, []);

  const currentYear = useMemo(() => {
    return currentMonth.substring(0, 4);
  }, [currentMonth]);

  // Calculate high-level summary cards stats (Month vs Year)
  const monthStats = useMemo(() => {
    if (!member || groupMembers.length === 0) {
      return { total: 0, pending: 0, paid: 0, overdueCount: 0, overdueTotal: 0 };
    }
    let total = 0;
    let pending = 0;
    let paid = 0;
    let overdueCount = 0;
    let overdueTotal = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    const getPaidShare = (exp: Expense, currentAmt: number) => {
      if (exp.isPaid) {
        return exp.responsibleMemberId === 'all' 
          ? currentAmt / groupMembers.length 
          : currentAmt;
      } else {
        return exp.responsibleMemberId === 'all'
          ? (exp.amountPaid || 0) / groupMembers.length
          : (exp.amountPaid || 0);
      }
    };

    const getPendingShare = (exp: Expense, currentAmt: number) => {
      if (exp.isPaid) return 0;
      const totalShare = exp.responsibleMemberId === 'all'
        ? currentAmt / groupMembers.length
        : currentAmt;
      const paidShare = exp.responsibleMemberId === 'all'
        ? (exp.amountPaid || 0) / groupMembers.length
        : (exp.amountPaid || 0);
      return Math.max(0, totalShare - paidShare);
    };

    filteredExpenses.forEach(exp => {
      const calc = calculateExpenseInterest(exp);
      const myShare = exp.responsibleMemberId === 'all' 
        ? calc.currentAmount / groupMembers.length 
        : calc.currentAmount;

      total += myShare;
      
      const paidShare = getPaidShare(exp, calc.currentAmount);
      const pendingShare = getPendingShare(exp, calc.currentAmount);

      paid += paidShare;
      pending += pendingShare;

      if (!exp.isPaid) {
        const isOverdue = todayStr > exp.dueDate;
        if (isOverdue) {
          overdueCount += 1;
          overdueTotal += pendingShare;
        }
      }
    });

    return {
      total: parseFloat(total.toFixed(2)),
      pending: parseFloat(pending.toFixed(2)),
      paid: parseFloat(paid.toFixed(2)),
      overdueCount,
      overdueTotal: parseFloat(overdueTotal.toFixed(2))
    };
  }, [filteredExpenses, member, groupMembers]);

  const yearStats = useMemo(() => {
    if (!member || groupMembers.length === 0) {
      return { total: 0, pending: 0, paid: 0 };
    }
    let total = 0;
    let pending = 0;
    let paid = 0;

    const yearExpenses = expenses.filter(exp => exp.dueDate.startsWith(currentYear) && exp.recurringActive !== false);

    const getPaidShare = (exp: Expense, currentAmt: number) => {
      if (exp.isPaid) {
        return exp.responsibleMemberId === 'all' 
          ? currentAmt / groupMembers.length 
          : currentAmt;
      } else {
        return exp.responsibleMemberId === 'all'
          ? (exp.amountPaid || 0) / groupMembers.length
          : (exp.amountPaid || 0);
      }
    };

    const getPendingShare = (exp: Expense, currentAmt: number) => {
      if (exp.isPaid) return 0;
      const totalShare = exp.responsibleMemberId === 'all'
        ? currentAmt / groupMembers.length
        : currentAmt;
      const paidShare = exp.responsibleMemberId === 'all'
        ? (exp.amountPaid || 0) / groupMembers.length
        : (exp.amountPaid || 0);
      return Math.max(0, totalShare - paidShare);
    };

    yearExpenses.forEach(exp => {
      const calc = calculateExpenseInterest(exp);
      const myShare = exp.responsibleMemberId === 'all' 
        ? calc.currentAmount / groupMembers.length 
        : calc.currentAmount;

      total += myShare;
      paid += getPaidShare(exp, calc.currentAmount);
      pending += getPendingShare(exp, calc.currentAmount);
    });

    return {
      total: parseFloat(total.toFixed(2)),
      pending: parseFloat(pending.toFixed(2)),
      paid: parseFloat(paid.toFixed(2))
    };
  }, [expenses, currentYear, member, groupMembers]);

  const selectableExpenses = useMemo(() => {
    return filteredExpenses.filter(e => !e.isPaid);
  }, [filteredExpenses]);

  // Handle row selection
  const handleToggleSelect = (id: string) => {
    const exp = expenses.find(e => e.id === id);
    if (exp?.isPaid) return; // Prevent selecting already paid ones
    setSelectedExpenseIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const isAllSelectedInMonth = useMemo(() => {
    if (selectableExpenses.length === 0) return false;
    return selectableExpenses.every(exp => selectedExpenseIds.includes(exp.id));
  }, [selectableExpenses, selectedExpenseIds]);

  const handleToggleSelectAllInMonth = () => {
    if (isAllSelectedInMonth) {
      setSelectedExpenseIds(prev => prev.filter(id => !selectableExpenses.some(exp => exp.id === id)));
    } else {
      const newIds = selectableExpenses.map(exp => exp.id);
      setSelectedExpenseIds(prev => Array.from(new Set([...prev, ...newIds])));
    }
  };

  // Get full objects of selected expenses across all months
  const selectedExpensesList = useMemo(() => {
    return expenses.filter(exp => selectedExpenseIds.includes(exp.id));
  }, [expenses, selectedExpenseIds]);

  // Compute selected totals sum
  const selectedOwedTotal = useMemo(() => {
    if (!member || groupMembers.length === 0) return 0;
    let total = 0;
    selectedExpensesList.forEach(exp => {
      const calc = calculateExpenseInterest(exp);
      const currentVal = calc.currentAmount;
      const paidAmt = exp.amountPaid || 0;
      const remainingVal = Math.max(0, currentVal - paidAmt);
      
      if (exp.responsibleMemberId === 'all') {
        total += remainingVal / groupMembers.length;
      } else if (exp.responsibleMemberId === member.id) {
        total += remainingVal;
      }
    });
    return parseFloat(total.toFixed(2));
  }, [selectedExpensesList, member, groupMembers]);

  // Installment view logic
  const relatedInstallments = useMemo(() => {
    if (!activeInstallmentExpense) return [];
    const baseDesc = getBaseDescription(activeInstallmentExpense.description);
    return expenses
      .filter(exp => {
        if (!exp.isInstallments) return false;
        
        // If both have installmentGroupId, compare them strictly
        if (exp.installmentGroupId && activeInstallmentExpense.installmentGroupId) {
          return exp.installmentGroupId === activeInstallmentExpense.installmentGroupId;
        }
        
        // Fallback for older data without installmentGroupId
        return getBaseDescription(exp.description) === baseDesc &&
               exp.installmentsCount === activeInstallmentExpense.installmentsCount &&
               exp.transactionDate === activeInstallmentExpense.transactionDate;
      })
      .sort((a, b) => (a.currentInstallment || 0) - (b.currentInstallment || 0));
  }, [expenses, activeInstallmentExpense]);

  const seriesStats = useMemo(() => {
    if (relatedInstallments.length === 0 || !member) {
      return { totalAmount: 0, paidAmount: 0, pendingAmount: 0, totalCount: 0, paidCount: 0 };
    }
    let totalAmount = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let paidCount = 0;

    relatedInstallments.forEach(inst => {
      const calc = calculateExpenseInterest(inst);
      const myShare = inst.responsibleMemberId === 'all' 
        ? calc.currentAmount / groupMembers.length 
        : calc.currentAmount;

      totalAmount += myShare;
      if (inst.isPaid) {
        paidAmount += myShare;
        paidCount += 1;
      } else {
        pendingAmount += myShare;
      }
    });

    return {
      totalAmount,
      paidAmount,
      pendingAmount,
      totalCount: relatedInstallments.length,
      paidCount
    };
  }, [relatedInstallments, member, groupMembers]);

  // Export to CSV function
  const handleExportCSV = () => {
    if (filteredExpenses.length === 0 || !member) return;

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Descricao;Categoria;Valor Total;Minha Cota;Data da Compra;Data de Vencimento;Status;Responsavel\r\n";

    filteredExpenses.forEach(exp => {
      const calc = calculateExpenseInterest(exp);
      const myShare = exp.responsibleMemberId === 'all' 
        ? calc.currentAmount / groupMembers.length 
        : calc.currentAmount;

      const row = [
        exp.description,
        exp.category,
        calc.currentAmount.toFixed(2).replace('.', ','),
        myShare.toFixed(2).replace('.', ','),
        exp.transactionDate,
        exp.dueDate,
        exp.isPaid ? "Pago" : "Pendente",
        exp.responsibleMemberId === 'all' ? "Todos (Dividido)" : member.name
      ].map(field => `"${field}"`).join(";");

      csvContent += row + "\r\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `minhas_despesas_${currentMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 font-medium font-display">Sincronizando despesas em tempo real...</p>
        </div>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-slate-100 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto text-xl font-bold">!</div>
          <h2 className="text-base font-bold text-slate-800 font-display">Acesso não autorizado</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{error || "Não conseguimos localizar o convite correspondente."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Top Banner (Read Only Mode Header) */}
      <div className="bg-indigo-950 text-indigo-200 py-2.5 px-4 text-xs font-semibold shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SecretLogo size="sm" dark={true} variant="full" />
          <div className="h-4 w-px bg-indigo-800 hidden sm:block" />
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider hidden sm:inline-flex items-center gap-1">
            <Smartphone size={11} /> Salvo no Aparelho
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {showInstallBtn ? (
            <button
              onClick={onInstallApp}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 px-3 py-1 rounded-lg text-[11px] font-extrabold flex items-center gap-1.5 transition shadow-sm cursor-pointer animate-pulse"
              title="Instalar aplicativo no celular ou computador"
            >
              <Download size={13} />
              <span>Baixar / Instalar App</span>
            </button>
          ) : (
            <button
              onClick={() => setShowPwaGuideModal(true)}
              className="bg-indigo-900/80 hover:bg-indigo-800 text-indigo-100 border border-indigo-700/60 px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Como colocar ícone na tela de início do celular"
            >
              <Smartphone size={13} className="text-amber-400" />
              <span>Instalar / Atalho</span>
            </button>
          )}

          <button
            onClick={handleToggleSubscription}
            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
              isSubscribed 
                ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                : 'bg-indigo-800 hover:bg-indigo-700 text-white border border-indigo-700'
            }`}
            title={isSubscribed ? "Notificações Ativas! Clique para desativar." : "Ativar Lembretes de Vencimento"}
          >
            <Bell size={13} className={isSubscribed ? "animate-pulse" : ""} />
            <span>{isSubscribed ? "Avisos Ativos" : "Ativar Avisos"}</span>
          </button>

          {onExitSharedView && (
            <button
              onClick={onExitSharedView}
              className="bg-rose-950/60 hover:bg-rose-900 text-rose-200 border border-rose-800/60 px-3 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Sair do link e ir para tela de login principal"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Sair / Logar</span>
            </button>
          )}
        </div>
      </div>

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mt-4 sm:mt-6 space-y-5 sm:space-y-6">
        {/* Member Greeting Card */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center space-x-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center font-display text-lg shrink-0 shadow-2xs border border-indigo-200/60">
                  {member.name[0].toUpperCase()}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-extrabold text-slate-900 font-display tracking-tight">
                      Olá, {member.name}!
                    </h1>
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full font-mono border border-slate-200 shrink-0">
                      Hoje: {formattedToday}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Histórico financeiro e taxa pessoal de despesas</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Historical Month Switcher */}
            <div className="flex items-center space-x-1.5 bg-slate-100 p-1.5 rounded-lg border border-slate-200">
              <button
                onClick={handlePrevMonth}
                className="p-1 hover:bg-white rounded transition text-slate-500 hover:text-slate-700 cursor-pointer"
                title="Mês Anterior"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center space-x-1 px-1">
                <Calendar size={13} className="text-slate-500 mr-1" />
                <select
                  value={currentMonth}
                  onChange={(e) => setCurrentMonth(e.target.value)}
                  className="bg-transparent border-none text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  {availableMonths.map(m => {
                    const [year, month] = m.split('-');
                    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
                    return (
                      <option key={m} value={m}>{monthNames[parseInt(month) - 1]} de {year}</option>
                    );
                  })}
                </select>
              </div>

              <button
                onClick={handleNextMonth}
                className="p-1 hover:bg-white rounded transition text-slate-500 hover:text-slate-700 cursor-pointer"
                title="Próximo Mês"
              >
                <ChevronRight size={16} />
              </button>
            </div>



            <button
              onClick={handleExportCSV}
              disabled={filteredExpenses.length === 0}
              className="p-2 bg-white text-slate-700 border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 disabled:opacity-50 transition flex items-center gap-1 text-xs font-bold"
              title="Exportar CSV"
            >
              <Download size={14} /> Exportar
            </button>
            <button
              onClick={() => window.print()}
              disabled={filteredExpenses.length === 0}
              className="p-2 bg-white text-slate-700 border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 disabled:opacity-50 transition flex items-center gap-1 text-xs font-bold"
              title="Gerar PDF"
            >
              <FileText size={14} /> Imprimir
            </button>
          </div>

          {/* Overdue alert banner for individual shared link */}
          {overdueExpensesList.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-950 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 font-black text-rose-950 uppercase tracking-wide">
                  <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                  <span>⚠️ {overdueExpensesList.length} Despesa(s) Vencida(s) Pendente(s)</span>
                </div>
                <span className="px-2.5 py-1 bg-rose-200/80 text-rose-900 text-[10px] font-extrabold uppercase rounded-full">
                  Notificação Diária Ativa
                </span>
              </div>
              <p className="text-[11px] text-rose-800 font-medium leading-relaxed">
                Você receberá uma notificação diariamente contendo o nome da despesa, valor atual com juros e dias em atraso até a confirmação do pagamento.
              </p>
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {overdueExpensesList.map(({ exp, calc, myShareCurrent, myShareOriginal, myShareInterest }) => (
                  <div key={exp.id} className="bg-white p-2.5 rounded-lg border border-rose-200 flex items-center justify-between gap-2 shadow-2xs">
                    <div>
                      <p className="font-bold text-slate-900">{exp.description}</p>
                      <p className="text-[10px] text-rose-600 font-semibold">Vencida há {calc.daysOverdue} dia(s) ({exp.dueDate.split('-').reverse().join('/')})</p>
                    </div>
                    <div className="text-right font-mono">
                      <p className="font-bold text-rose-700">
                        R$ {myShareCurrent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {myShareInterest > 0 ? (
                        <p className="text-[10px] text-amber-600 font-extrabold">
                          + R$ {myShareInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} juros
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 font-medium">Sem juros</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Persistent Shared Link Status Banner */}
          <div className="p-3 bg-indigo-50/80 border border-indigo-100 rounded-xl text-xs text-indigo-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
                <Smartphone size={16} />
              </span>
              <div>
                <p className="font-extrabold text-[11px] text-indigo-950 uppercase tracking-wide">
                  📱 Link Salvo no Seu Aparelho
                </p>
                <p className="text-[11px] text-indigo-800/90 font-medium leading-relaxed">
                  Ao abrir o aplicativo novamente no seu celular ou computador, você entrará direto nesta visualização de despesas sem precisar de login ou senha!
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setShowPwaGuideModal(true)}
              className="px-3 py-1.5 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] rounded-lg transition shrink-0 cursor-pointer shadow-2xs"
            >
              Criar Atalho / Instalar
            </button>
          </div>
        </div>

        {/* 4 Dashboard Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Month Total */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Minha Cota no Mês</span>
              <h2 className="text-lg font-extrabold text-slate-900 font-display">
                R$ {monthStats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="mt-3 text-[10px] text-slate-500 font-medium flex justify-between border-t border-slate-100 pt-2">
              <span className="text-emerald-600">Paga: R$ {monthStats.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              <span className="text-amber-600 font-bold">Pendente: R$ {monthStats.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Card 2: Overdue Month */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Vencido no Mês</span>
              <h2 className="text-lg font-extrabold text-rose-600 font-display flex items-center gap-1">
                R$ {monthStats.overdueTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {monthStats.overdueCount > 0 && <AlertTriangle size={15} className="text-rose-500" />}
              </h2>
            </div>
            <div className="mt-3 text-[10px] text-slate-500 font-medium border-t border-slate-100 pt-2">
              {monthStats.overdueCount === 0 ? (
                <span className="text-emerald-600 font-semibold">Nenhuma conta vencida este mês</span>
              ) : (
                <span className="text-rose-600 font-bold">{monthStats.overdueCount} {monthStats.overdueCount === 1 ? 'conta vencida' : 'contas vencidas'}</span>
              )}
            </div>
          </div>

          {/* Card 3: Year Total */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Total Acumulado ({currentYear})</span>
              <h2 className="text-lg font-extrabold text-slate-900 font-display">
                R$ {yearStats.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="mt-3 text-[10px] text-slate-500 font-medium border-t border-slate-100 pt-2 flex justify-between">
              <span>Gasto anual total</span>
              <span className="text-emerald-600 font-semibold">Pago: R$ {yearStats.paid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Card 4: Year Pending */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="space-y-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Falta Pagar no Ano ({currentYear})</span>
              <h2 className="text-lg font-extrabold text-amber-600 font-display">
                R$ {yearStats.pending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h2>
            </div>
            <div className="mt-3 text-[10px] text-slate-500 font-medium border-t border-slate-100 pt-2 flex items-center justify-between">
              <span>Restante pendente</span>
              <span className="font-bold text-amber-600">A pagar</span>
            </div>
          </div>
        </div>

        {/* Specific expenses table for member */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detalhamento de Despesas do Período</h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                Selecione itens nas caixas de seleção ao lado para acumular e pagar via Pix.
              </p>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status Filter Dropdown */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
                <Filter size={12} className="text-slate-500 shrink-0" />
                <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="bg-transparent border-none text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas as Despesas</option>
                  <option value="pending">⏳ Pendentes (A Pagar)</option>
                  <option value="paid">✅ Pagas</option>
                  <option value="overdue">⚠️ Vencidas</option>
                </select>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold uppercase shrink-0">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent border-none text-[11px] font-bold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="dueDate-asc">Vencimento (Próximas 1º)</option>
                  <option value="dueDate-desc">Vencimento (Longe 1º)</option>
                  <option value="amount-asc">Valor (Menor 1º)</option>
                  <option value="amount-desc">Valor (Maior 1º)</option>
                  <option value="description-asc">Nome (A-Z)</option>
                </select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[10px] font-display">
                  <th className="px-4 py-4 text-center w-12">
                    <input
                      type="checkbox"
                      checked={isAllSelectedInMonth}
                      disabled={selectableExpenses.length === 0}
                      onChange={handleToggleSelectAllInMonth}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5 disabled:opacity-45 disabled:cursor-not-allowed"
                    />
                  </th>
                  <th className="px-4 py-4">Descrição / Categoria</th>
                  <th className="px-4 py-4">Valor</th>
                  <th className="px-4 py-4 text-center">Vencimento</th>
                  <th className="px-4 py-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                      Nenhuma despesa encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map(exp => {
                    const calc = calculateExpenseInterest(exp);
                    const isSplit = exp.responsibleMemberId === 'all';
                    const memberCount = Math.max(1, groupMembers.length);
                    
                    // Exact share calculation for this member
                    const myShare = isSplit 
                      ? calc.currentAmount / memberCount 
                      : calc.currentAmount;

                    const myPaidShare = exp.isPaid 
                      ? myShare 
                      : (isSplit ? (exp.amountPaid || 0) / memberCount : (exp.amountPaid || 0));

                    const myPendingShare = Math.max(0, myShare - myPaidShare);

                    const todayStr = getLocalTodayStr();
                    const isOverdue = calc.isOverdue;
                    const totalInterest = calc.dailyInterest + calc.manualInterest + (calc.autoOnceInterest || 0);
                    const isSelected = selectedExpenseIds.includes(exp.id);

                    // Calculate remaining days
                    const todayObj = new Date(todayStr + 'T12:00:00');
                    const dueObj = new Date(exp.dueDate + 'T12:00:00');
                    const diffTime = dueObj.getTime() - todayObj.getTime();
                    const daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));
                    const isUpcoming = !exp.isPaid && daysRemaining >= 0 && daysRemaining <= 3;

                    return (
                      <tr key={exp.id} className={`hover:bg-slate-50/50 transition-colors ${isSelected ? 'bg-indigo-50/10' : ''}`}>
                        {/* Checkbox for multiple selection */}
                        <td className="px-4 py-4 text-center w-12">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={exp.isPaid}
                            onChange={() => handleToggleSelect(exp.id)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer h-3.5 w-3.5 disabled:opacity-40 disabled:cursor-not-allowed"
                          />
                        </td>

                        <td className="px-4 py-4">
                          <span className="font-semibold text-slate-900 block text-xs">{exp.description}</span>
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1 mt-1.5">
                            <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono font-medium">{exp.category}</span>
                            
                            <span className="text-[10px] text-slate-500 bg-slate-100/70 border border-slate-200/50 px-1.5 py-0.5 rounded font-mono font-medium">
                              Compra: {exp.transactionDate.split('-').reverse().join('/')}
                            </span>

                            {exp.isInstallments && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveInstallmentExpense(exp);
                                }}
                                className="inline-flex items-center gap-1 text-[9px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-100 px-2 py-0.5 rounded font-bold transition"
                                title="Clique para ver todas as parcelas"
                              >
                                <Layers size={10} />
                                <span>Parcela {exp.currentInstallment}/{exp.installmentsCount}</span>
                                <Eye size={10} className="opacity-70 ml-0.5" />
                              </button>
                            )}

                            {isOverdue && (
                              <span className="text-[9px] bg-rose-50 text-rose-600 border border-rose-100 px-1.5 py-0.5 rounded font-bold flex items-center gap-1">
                                <AlertTriangle size={10} />
                                {calc.daysOverdue}d atrasado
                              </span>
                            )}
                          </div>

                          {/* Interactive Transparent Overdue Details */}
                          {isOverdue && (
                            <div className="mt-2 bg-rose-50/70 border border-rose-100 rounded-lg p-2.5 space-y-1 text-[11px] text-rose-800">
                              <p className="font-bold flex items-center gap-1">
                                <AlertTriangle size={11} className="text-rose-600" />
                                Esta conta está atrasada há {calc.daysOverdue} {calc.daysOverdue === 1 ? 'dia' : 'dias'}.
                              </p>
                              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500 font-medium">
                                <span>Valor Original: <strong className="text-slate-700">R$ {calc.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                                <span>Juros Acumulados: <strong className="text-amber-700 font-bold">+R$ {totalInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                              </div>
                            </div>
                          )}

                          {totalInterest > 0 && exp.isPaid && (
                            <div className="mt-2 bg-emerald-50/50 border border-emerald-100 rounded-lg p-2 text-[10px] text-slate-500 font-medium flex items-center justify-between">
                              <span>Valor Original: <strong>R$ {calc.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                              <span>Juros Inclusos: <strong className="text-amber-700 font-bold">+R$ {totalInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></span>
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-4 font-mono">
                          {exp.amountPaid !== undefined && exp.amountPaid > 0 && !exp.isPaid ? (
                            <div className="bg-amber-50 border-2 border-amber-400 p-2.5 rounded-xl space-y-1 shadow-2xs max-w-xs">
                              <div className="flex items-center gap-1 text-[10px] font-black uppercase text-amber-900 tracking-wider">
                                <Clock size={12} className="text-amber-600 shrink-0" />
                                <span>Falta Pagar:</span>
                              </div>
                              <div className="text-base font-black text-amber-700 font-mono tracking-tight">
                                R$ {myPendingShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <div className="pt-1.5 border-t border-amber-200 text-[10px] space-y-0.5 font-medium leading-tight">
                                <span className="text-slate-400 block font-semibold">
                                  Valor total cota: <span className="line-through">R$ {myShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </span>
                                <span className="text-emerald-700 block font-bold">
                                  Já pago: R$ {myPaidShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <span className="text-slate-900 block text-sm font-bold">
                                R$ {myShare.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              {isSplit && (
                                <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-semibold inline-block mt-1">
                                  Despesa Compartilhada (Dividida por {groupMembers.length} • Total: R$ {calc.currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                </span>
                              )}
                              {totalInterest > 0 && !isOverdue && !exp.isPaid && (
                                <span className="text-[9px] text-amber-600 block mt-0.5">
                                  (Original: R$ {calc.originalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • Juros: +R$ {totalInterest.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})
                                </span>
                              )}
                            </>
                          )}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex flex-col items-center justify-center space-y-1">
                            {exp.isPaid ? (
                              <span className="inline-flex items-center justify-center gap-1 font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl text-xs shadow-sm">
                                Venceu: {exp.dueDate.split('-').reverse().join('/')}
                              </span>
                            ) : isOverdue ? (
                              <span className="inline-flex items-center justify-center gap-1 font-mono font-extrabold text-rose-700 bg-rose-50 border border-rose-300 px-2.5 py-1.5 rounded-xl text-xs shadow-sm animate-pulse">
                                Vence: {exp.dueDate.split('-').reverse().join('/')}
                              </span>
                            ) : isUpcoming ? (
                              <span className="inline-flex items-center justify-center gap-1 font-mono font-extrabold text-amber-700 bg-amber-50 border border-amber-300 px-2.5 py-1.5 rounded-xl text-xs shadow-sm">
                                Vence: {exp.dueDate.split('-').reverse().join('/')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center gap-1 font-mono font-bold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs shadow-sm">
                                Vence: {exp.dueDate.split('-').reverse().join('/')}
                              </span>
                            )}

                            {exp.isPaid && exp.paidAt && (
                              <span className="text-[10px] text-emerald-600 font-bold block text-center bg-emerald-100/30 py-0.5 px-1.5 rounded border border-emerald-200/20">
                                Pago em: {exp.paidAt.split('-').reverse().join('/')}
                              </span>
                            )}
                            {!exp.isPaid && isOverdue && (
                              <span className="text-[9px] text-rose-600 font-extrabold bg-rose-100/50 border border-rose-200/50 px-1.5 py-0.5 rounded block text-center uppercase tracking-wider">
                                Atrasado!
                              </span>
                            )}
                            {!exp.isPaid && isUpcoming && (
                              <span className="text-[9px] text-amber-700 font-extrabold bg-amber-100/50 border border-amber-200/50 px-1.5 py-0.5 rounded block text-center uppercase tracking-wider animate-pulse">
                                {daysRemaining === 0 ? 'Vence HOJE!' : `Vence em ${daysRemaining} dias`}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-4 text-center">
                          <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                            exp.isPaid 
                              ? 'bg-emerald-50 text-emerald-700' 
                              : isOverdue
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {exp.isPaid ? <Check size={10} /> : <Clock size={10} />}
                            <span>{exp.isPaid ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente'}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Floating Action Bar at the bottom */}
      <AnimatePresence>
        {selectedExpenseIds.length > 0 && (
          <motion.div 
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.1)] py-4 px-6"
          >
            <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-bold relative">
                  <span className="absolute -top-1.5 -right-1.5 bg-indigo-600 text-white text-[10px] h-5 w-5 rounded-full flex items-center justify-center font-bold font-mono">
                    {selectedExpenseIds.length}
                  </span>
                  <Sparkles size={18} className="animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Minhas Despesas Selecionadas</h4>
                  <p className="text-[11px] text-slate-500 font-medium">Acumulado total para pagamento via Pix</p>
                </div>
              </div>

              <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                <div className="text-right">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">Minha Cota Acumulada</span>
                  <span className="text-xl font-extrabold text-indigo-600 font-mono">
                    R$ {selectedOwedTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedExpenseIds([])}
                    className="px-3 py-2 border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl text-xs font-bold transition"
                  >
                    Limpar
                  </button>
                  <button
                    onClick={() => setIsPixModalOpen(true)}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-black rounded-xl text-xs transition flex items-center gap-1.5 shadow-md shadow-amber-500/10 uppercase tracking-wider"
                  >
                    <QrCode size={14} /> Pagar via Pix
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SECURE READ ONLY PIX PAYMENT MODAL */}
      <PixPaymentModal
        isOpen={isPixModalOpen}
        onClose={() => setIsPixModalOpen(false)}
        selectedExpenses={selectedExpensesList}
        readOnly={true}
        member={member}
        groupMembers={groupMembers}
      />

      {/* READ ONLY INSTALLMENTS VIEWER MODAL */}
      <AnimatePresence>
        {activeInstallmentExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveInstallmentExpense(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col max-h-[80vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <Layers size={18} />
                    <span className="text-xs font-bold uppercase tracking-wider">Histórico de Parcelas</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {getBaseDescription(activeInstallmentExpense.description)}
                  </h3>
                  <p className="text-xs text-slate-500 font-semibold">
                    Categoria: <span className="text-slate-700">{activeInstallmentExpense.category}</span>
                  </p>
                </div>
                <button
                  onClick={() => setActiveInstallmentExpense(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Installment series stats */}
              <div className="grid grid-cols-3 gap-3 p-6 bg-slate-50/30 border-b border-slate-100 text-xs">
                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Minha Cota Total</span>
                  <span className="text-xs font-bold text-slate-900 font-mono block mt-1">
                    R$ {seriesStats.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] text-slate-400 font-semibold block mt-0.5">{seriesStats.totalCount} parcelas</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm border-l-emerald-500 border-l-4">
                  <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">Minha Cota Paga</span>
                  <span className="text-xs font-bold text-slate-900 font-mono block mt-1">
                    R$ {seriesStats.paidAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-semibold block mt-0.5">{seriesStats.paidCount} pagas</span>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm border-l-amber-500 border-l-4">
                  <span className="text-[9px] font-bold text-amber-600 uppercase tracking-wider block">Falta Pagar</span>
                  <span className="text-xs font-bold text-slate-900 font-mono block mt-1">
                    R$ {seriesStats.pendingAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] text-amber-600 font-semibold block mt-0.5">{seriesStats.totalCount - seriesStats.paidCount} pendentes</span>
                </div>
              </div>

              {/* Installment List */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <div className="space-y-2">
                  {relatedInstallments.map(inst => {
                    const instCalc = calculateExpenseInterest(inst);
                    const instMyShare = inst.responsibleMemberId === 'all' 
                      ? instCalc.currentAmount / groupMembers.length 
                      : instCalc.currentAmount;

                    const todayStr = new Date().toISOString().split('T')[0];
                    const instOverdue = !inst.isPaid && new Date(inst.dueDate) < new Date(todayStr);

                    return (
                      <div 
                        key={inst.id} 
                        className={`flex justify-between items-center p-3 rounded-xl border text-xs font-semibold ${
                          inst.isPaid 
                            ? 'bg-emerald-50/20 border-emerald-100 text-slate-700' 
                            : instOverdue 
                            ? 'bg-rose-50/20 border-rose-100 text-rose-800' 
                            : 'bg-slate-50/50 border-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-900 block text-xs">
                            Parcela {inst.currentInstallment} / {inst.installmentsCount}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium font-mono block">
                            Vencimento: {inst.dueDate.split('-').reverse().join('/')}
                          </span>
                        </div>

                        <div className="flex items-center space-x-3 text-right">
                          <div className="font-mono">
                            <span className="font-bold block text-slate-800">
                              R$ {instMyShare.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                            <span className="text-[9px] text-slate-400 block font-normal">Sua Cota</span>
                          </div>

                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase ${
                            inst.isPaid 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : instOverdue 
                              ? 'bg-rose-100 text-rose-800' 
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {inst.isPaid ? 'Pago' : instOverdue ? 'Atrasado' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setActiveInstallmentExpense(null)}
                  className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      </div>

      {/* PWA / HOME SCREEN SHORTCUT GUIDE MODAL */}
      <AnimatePresence>
        {showPwaGuideModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPwaGuideModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-10 flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-indigo-950 text-white">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-indigo-800 rounded-xl text-amber-400">
                    <Smartphone size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold font-display">Instalar Aplicativo no Celular</h3>
                    <p className="text-[10px] text-indigo-200 font-medium">Como salvar o ícone na tela de início</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPwaGuideModal(false)}
                  className="text-indigo-300 hover:text-white p-1 rounded-lg transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-5 text-xs text-slate-700">
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-emerald-900 font-medium">
                  <p className="font-bold mb-0.5 flex items-center gap-1">
                    <Check size={14} className="text-emerald-600" /> Seu link já está salvo!
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    Mesmo que você feche esta página, quando voltar a acessar o site, ele lembrará das suas despesas automaticamente sem pedir login!
                  </p>
                </div>

                {showInstallBtn ? (
                  <div className="space-y-2 text-center">
                    <p className="font-bold text-slate-800">Pronto para instalar em 1 clique:</p>
                    <button
                      onClick={() => {
                        setShowPwaGuideModal(false);
                        if (onInstallApp) onInstallApp();
                      }}
                      className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-md transition flex items-center justify-center gap-2 text-xs cursor-pointer"
                    >
                      <Download size={16} />
                      Instalar Aplicativo Agora
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="font-bold text-slate-900 text-xs">
                      Para criar o ícone na tela do seu celular e abrir como um App:
                    </p>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                      <p className="font-bold text-slate-900 text-[11px] flex items-center gap-1.5 text-indigo-600">
                        📱 No iPhone (Safari):
                      </p>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 pl-1 font-medium">
                        <li>Toque no botão de <strong>Compartilhar</strong> (ícone de quadrado com seta no rodapé do Safari).</li>
                        <li>Role para baixo e selecione <strong>&quot;Adicionar à Tela de Início&quot;</strong>.</li>
                        <li>Confirme no canto superior direito. Prontinho!</li>
                      </ol>
                    </div>

                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                      <p className="font-bold text-slate-900 text-[11px] flex items-center gap-1.5 text-indigo-600">
                        🤖 No Android (Chrome):
                      </p>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-600 pl-1 font-medium">
                        <li>Toque nos <strong>3 pontinhos</strong> no canto superior direito do navegador.</li>
                        <li>Selecione <strong>&quot;Instalar aplicativo&quot;</strong> ou <strong>&quot;Adicionar à Tela inicial&quot;</strong>.</li>
                        <li>Aperte Instalar. O ícone aparecerá entre seus apps!</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowPwaGuideModal(false)}
                  className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Entendi!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
