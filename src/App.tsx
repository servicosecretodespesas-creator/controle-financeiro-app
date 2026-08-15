import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType,
  cleanUndefined
} from './firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { Expense, Member, Budget, Category, FinancingContract } from './types';
import { sendSafeNotification, registerServiceWorker, syncExpensesToServiceWorker, scheduleBackgroundTestNotification } from './utils/notifications';
import { requestPushPermissionAndSaveToken } from './utils/pushNotifications';

// Importing components
import Dashboard from './components/Dashboard';
import ExpensesTab from './components/ExpensesTab';
import MembersTab from './components/MembersTab';
import BudgetsTab from './components/BudgetsTab';
import MemberViewer from './components/MemberViewer';
import ConfirmModal from './components/ConfirmModal';
import AuthScreen from './components/AuthScreen';
import CategoriesModal from './components/CategoriesModal';
import OverdueTab from './components/OverdueTab';
import PixConfigTab from './components/PixConfigTab';
import ControleRendaTab from './components/ControleRendaTab';
import { SecretLogo } from './components/SecretLogo';
import { LogoPreviewModal } from './components/LogoPreviewModal';
import FinanciamentoTab, { calculateContractTimeline } from './components/FinanciamentoTab';
import RelatorioAnualTab from './components/RelatorioAnualTab';
import { calculateExpenseInterest, getLocalTodayStr } from './utils/interest';

// Lucide icons
import { 
  LayoutDashboard, 
  User as UserIcon, 
  Users, 
  Wallet, 
  LogOut, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle,
  Menu,
  X,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Building,
  Sun,
  Moon,
  Bell,
  Mail,
  AlertCircle,
  AlertTriangle,
  Download,
  BarChart3,
  Eye,
  EyeOff
} from 'lucide-react';

const DEFAULT_CATEGORIES = ['Alimentação', 'Transporte', 'Moradia/Aluguel', 'Saúde', 'Educação', 'Lazer', 'Assinaturas/Serviços', 'Outros'];

export default function App() {
  // Authentication & Loading
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Theme State (Persisted)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  // Public Mode State (hides/blurs sensitive financial values globally across all screens)
  const [hideValues, setHideValues] = useState<boolean>(() => {
    return localStorage.getItem('hideSensitiveValues') === 'true';
  });

  const toggleHideValues = () => {
    setHideValues(prev => {
      const newVal = !prev;
      localStorage.setItem('hideSensitiveValues', String(newVal));
      return newVal;
    });
  };

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Custom Promise-based Confirmation Modal State
  const [confirmPromise, setConfirmPromise] = useState<{
    resolve: (value: boolean) => void;
    title: string;
    message: string;
  } | null>(null);

  const customConfirm = (title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmPromise({
        resolve,
        title,
        message
      });
    });
  };
  
  // App navigation
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, pessoais, terceiros, membros, orcamentos, atraso
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(() => {
    return localStorage.getItem('desktopSidebarOpen') !== 'false';
  });
  const [externalEditingId, setExternalEditingId] = useState<string | null>(null);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  const handleEditExpenseGlobally = (expense: Expense) => {
    setExternalEditingId(expense.id);
    if (expense.dueDate) {
      const expMonth = expense.dueDate.substring(0, 7);
      setCurrentMonth(expMonth);
    }
    if (expense.type === 'personal') {
      setActiveTab('pessoais');
    } else {
      setActiveTab('terceiros');
    }
  };

  // Notification states and logic moved globally
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(() => {
    return localStorage.getItem('browserNotificationsEnabled') === 'true';
  });
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [daysBeforeDue, setDaysBeforeDue] = useState(3);
  const [isSavingNotificationSettings, setIsSavingNotificationSettings] = useState(false);

  // Load existing settings
  useEffect(() => {
    if (!user) return;
    
    const loadSettings = async () => {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const docRef = doc(db, 'user_notification_settings', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setEmailNotificationsEnabled(data.emailEnabled || false);
          setNotificationEmail(data.email || user.email || '');
          setDaysBeforeDue(data.daysBeforeDue ?? 3);
        } else {
          setNotificationEmail(user.email || '');
        }
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          requestPushPermissionAndSaveToken(user.uid);
        }
      } catch (err) {
        console.error('Error loading notification settings:', err);
      }
    };
    
    loadSettings();
  }, [user]);

  // Firestore Real-Time state
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [financingContracts, setFinancingContracts] = useState<FinancingContract[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isCategoriesModalOpen, setIsCategoriesModalOpen] = useState(false);

  // PWA Install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If already installed, hide button
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setShowInstallBtn(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Usuário respondeu ao prompt de instalação: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  // Dynamic merged categories list
  const allCategoryNames = useMemo(() => {
    const customNames = categories.map(c => c.name);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...customNames]));
  }, [categories]);

  // Current calendar month view (default: current year-month)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  // Check if viewing a shared link or have a saved share token (does not require login)
  const [shareToken, setShareToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('shareToken');
    if (tokenFromUrl) {
      localStorage.setItem('saved_share_token', tokenFromUrl);
      return tokenFromUrl;
    }
    return localStorage.getItem('saved_share_token');
  });

  const handleExitSharedView = () => {
    localStorage.removeItem('saved_share_token');
    const url = new URL(window.location.href);
    if (url.searchParams.has('shareToken')) {
      url.searchParams.delete('shareToken');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
    setShareToken(null);
  };

  // Virtual Financing Expenses Generator (to sync current month installments)
  const virtualFinancingExpenses = useMemo(() => {
    const list: Expense[] = [];

    financingContracts.forEach(contract => {
      try {
        const timeline = calculateContractTimeline(contract);
        timeline.forEach(item => {
          if (item.dueDate.startsWith(currentMonth)) {
            list.push({
              id: `virtual_financing_${contract.id}_${item.number}`,
              description: `Parcela ${item.number} - ${contract.propertyName}`,
              category: 'Moradia/Aluguel',
              amount: item.totalValue,
              transactionDate: item.dueDate,
              dueDate: item.dueDate,
              type: 'personal',
              isPaid: item.isPaid,
              paidAt: item.paidAt || "",
              userId: contract.userId,
              notes: item.notes || contract.customDescription || `Parcela de ${contract.contractType || 'financiamento'}.`,
              isFinancing: true,
              financingContractId: contract.id,
              installmentNumber: item.number
            } as any);
          }
        });
      } catch (err) {
        console.error('Error generating virtual financing expenses:', err);
      }
    });

    return list;
  }, [financingContracts, currentMonth]);

  const mergedExpenses = useMemo(() => {
    return [...expenses, ...virtualFinancingExpenses];
  }, [expenses, virtualFinancingExpenses]);

  const overdueExpensesInfo = useMemo(() => {
    const items: Array<{ exp: Expense; calc: ReturnType<typeof calculateExpenseInterest> }> = [];
    mergedExpenses.forEach(exp => {
      if (exp.isPaid) return;
      const calc = calculateExpenseInterest(exp);
      if (calc.daysOverdue > 0) {
        items.push({ exp, calc });
      }
    });
    return {
      totalCount: items.length,
      items
    };
  }, [mergedExpenses]);

  const activeOverdueCount = overdueExpensesInfo.totalCount;

  const upcomingExpensesInfo = useMemo(() => {
    const todayStr = getLocalTodayStr();
    const today = new Date(todayStr + 'T12:00:00');
    
    let personalCount = 0;
    let thirdPartyCount = 0;
    const items: Array<{ exp: Expense; daysUntilDue: number }> = [];
    
    mergedExpenses.forEach(exp => {
      if (exp.isPaid) return;
      const due = new Date(exp.dueDate + 'T12:00:00');
      const diffTime = due.getTime() - today.getTime();
      const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue >= 0 && daysUntilDue <= daysBeforeDue) {
        if (exp.type === 'personal') {
          personalCount++;
        } else {
          thirdPartyCount++;
        }
        items.push({ exp, daysUntilDue });
      }
    });
    
    return {
      personalCount,
      thirdPartyCount,
      totalCount: personalCount + thirdPartyCount,
      items
    };
  }, [mergedExpenses, daysBeforeDue]);

  // Auto trigger push notification on mount/change & sync with SW
  useEffect(() => {
    const hasOverdue = overdueExpensesInfo.totalCount > 0;
    const hasUpcoming = upcomingExpensesInfo.totalCount > 0;

    if (hasOverdue || hasUpcoming) {
      const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      
      const overdueDetails = overdueExpensesInfo.items.map(({ exp, calc }) => {
        const totalInterest = calc.currentAmount - calc.originalAmount;
        const interestText = totalInterest > 0 
          ? ` (Original: ${formatCurrency(calc.originalAmount)} + ${formatCurrency(totalInterest)} juros)` 
          : '';
        return `• ⚠️ ${exp.description}: ${formatCurrency(calc.currentAmount)}${interestText} - Vencida há ${calc.daysOverdue} dia(s)`;
      }).join('\n');

      const upcomingDetails = upcomingExpensesInfo.items.map(({ exp, daysUntilDue }) => {
        const ownerName = exp.type === 'personal'
          ? 'Pessoal (Você)'
          : (exp.responsibleMemberId === 'all'
            ? 'Todos (Dividido)'
            : (members.find(m => m.id === exp.responsibleMemberId)?.name || 'Outro'));
            
        const dueInfo = daysUntilDue === 0 ? 'Vence HOJE!' : `Vence em ${daysUntilDue} dia(s)`;
        
        return `• 🔔 ${exp.description}: ${formatCurrency(exp.amount)} - ${ownerName} [${dueInfo}]`;
      }).join('\n');

      const sections: string[] = [];
      if (hasOverdue) {
        sections.push(`⚠️ CONTAS VENCIDAS (Alerta Diário até Quitação):\n` + overdueDetails);
      }
      if (hasUpcoming) {
        sections.push(`🔔 VENCENDO EM BREVE:\n` + upcomingDetails);
      }

      const fullDetails = sections.join('\n\n');

      // Keep Service Worker synced for background periodic checks
      syncExpensesToServiceWorker(overdueExpensesInfo.totalCount + upcomingExpensesInfo.totalCount, fullDetails);

      if (browserNotificationsEnabled) {
        if ('Notification' in window && Notification.permission === 'granted') {
          const lastNotified = localStorage.getItem('lastNotifiedExpenses');
          const todayStr = getLocalTodayStr();
          
          if (lastNotified !== todayStr) {
            const title = hasOverdue 
              ? `⚠️ Alerta Diário: ${overdueExpensesInfo.totalCount} Conta(s) Vencida(s)! 🔔` 
              : `Contas Vencendo em Breve! 🔔`;

            sendSafeNotification(title, {
              body: fullDetails.length > 1000 ? fullDetails.substring(0, 997) + '...' : fullDetails,
              requireInteraction: true
            });
            localStorage.setItem('lastNotifiedExpenses', todayStr);
          }
        }
      }
    }
  }, [browserNotificationsEnabled, overdueExpensesInfo, upcomingExpensesInfo, members]);

  const requestBrowserPermission = async () => {
    const isIframe = window.self !== window.top;
    
    if (isIframe) {
      alert("⚠️ Limitação de iFrame do AI Studio:\n\nComo o aplicativo está rodando dentro do painel do AI Studio, os navegadores bloqueiam notificações por segurança.\n\nPara ativar e usar as notificações, por favor abra o aplicativo em uma NOVA ABA (clicando no botão com ícone de seta/quadrado no canto superior direito do painel) e depois clique em 'Ativar Notificações'!");
      return;
    }

    if (!('Notification' in window)) {
      alert("Seu navegador ou dispositivo não oferece suporte a notificações push.");
      return;
    }
    
    if (Notification.permission === 'denied') {
      alert("As notificações foram bloqueadas no seu navegador para esta página.\n\nPara ativar no celular:\n1. Toque no ícone de opções/configurações (três pontinhos ou cadeado na barra de endereço).\n2. Vá em 'Configurações do site' ou 'Permissões'.\n3. Mude as Notificações de 'Bloqueado' para 'Permitir'.\n4. Atualize a página.");
      return;
    }
    
    try {
      await registerServiceWorker();

      // Handle both Promise and Callback implementations of requestPermission
      const requestPermission = () => {
        return new Promise<NotificationPermission>((resolve, reject) => {
          try {
            const res = Notification.requestPermission(resolve);
            if (res && typeof res.then === 'function') {
              res.then(resolve, reject);
            }
          } catch (e) {
            reject(e);
          }
        });
      };

      const permission = await requestPermission();
      if (permission === 'granted') {
        setBrowserNotificationsEnabled(true);
        localStorage.setItem('browserNotificationsEnabled', 'true');
        
        if (user?.uid) {
          await requestPushPermissionAndSaveToken(user.uid);
        }

        await sendSafeNotification("Lembretes Ativados! 🔔", {
          body: "Você será notificado sobre despesas próximas do vencimento.",
        });
      } else {
        setBrowserNotificationsEnabled(false);
        localStorage.setItem('browserNotificationsEnabled', 'false');
        alert("Permissão de notificação negada pelo usuário.");
      }
    } catch (err) {
      console.error('Erro ao solicitar permissão de notificação:', err);
      alert("Seu navegador ou dispositivo restringiu a solicitação de notificações.\n\nPara resolver no celular:\n1. Clique nos três pontinhos (menu) do navegador.\n2. Vá em Configurações > Configurações do site > Notificações e ative para este site.\n3. Ou use 'Adicionar à tela de início' para instalar o app no celular e liberar as notificações!");
    }
  };

  const testPushNotification = async () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const hasOverdue = overdueExpensesInfo.totalCount > 0;
      const hasUpcoming = upcomingExpensesInfo.totalCount > 0;

      if (hasOverdue || hasUpcoming) {
        const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        const overdueDetails = overdueExpensesInfo.items.map(({ exp, calc }) => {
          const totalInterest = calc.currentAmount - calc.originalAmount;
          const interestText = totalInterest > 0 
            ? ` (Original: ${formatCurrency(calc.originalAmount)} + ${formatCurrency(totalInterest)} juros)` 
            : '';
          return `• ⚠️ ${exp.description}: ${formatCurrency(calc.currentAmount)}${interestText} - Vencida há ${calc.daysOverdue} dia(s)`;
        }).join('\n');

        const upcomingDetails = upcomingExpensesInfo.items.map(({ exp, daysUntilDue }) => {
          const ownerName = exp.type === 'personal'
            ? 'Pessoal (Você)'
            : (exp.responsibleMemberId === 'all'
              ? 'Todos (Dividido)'
              : (members.find(m => m.id === exp.responsibleMemberId)?.name || 'Outro'));
              
          const dueInfo = daysUntilDue === 0 ? 'Vence HOJE!' : `Vence em ${daysUntilDue} dia(s)`;
          
          return `• 🔔 ${exp.description}: ${formatCurrency(exp.amount)} - ${ownerName} [${dueInfo}]`;
        }).join('\n');

        const sections: string[] = [];
        if (hasOverdue) {
          sections.push(`⚠️ CONTAS VENCIDAS:\n` + overdueDetails);
        }
        if (hasUpcoming) {
          sections.push(`🔔 VENCENDO EM BREVE:\n` + upcomingDetails);
        }

        const details = sections.join('\n\n');

        await sendSafeNotification(hasOverdue ? "Teste: Alerta Diário de Vencidas! 🔔" : "Teste: Contas Vencendo! 🔔", {
          body: details,
          requireInteraction: true
        });
      } else {
        await sendSafeNotification("Teste: Lembretes Ativados! 🔔", {
          body: `Tudo em dia! Nenhuma despesa pendente vencida ou vencendo nos próximos dias.\n\nExemplo de Notificação Diária para Vencidas:\n• ⚠️ Aluguel: R$ 1.250,00 (Original: R$ 1.200,00 + R$ 50,00 juros) - Vencida há 5 dia(s)`,
          requireInteraction: true
        });
      }
    } else {
      alert("Ative as notificações do navegador primeiro!");
    }
  };

  const testBackgroundNotification = async () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      alert("Ative as notificações do navegador primeiro!");
      return;
    }

    const scheduled = await scheduleBackgroundTestNotification(
      10000,
      upcomingExpensesInfo.totalCount > 0
        ? `Você possui ${upcomingExpensesInfo.totalCount} despesa(s) próxima(s) do vencimento!`
        : 'Sua notificação em segundo plano funcionou com sucesso! O aplicativo enviou este alerta mesmo com o app/navegador fechado.'
    );

    if (scheduled) {
      alert("⏳ Teste de Segundo Plano Agendado para daqui a 10 SEGUNDOS!\n\n👉 Feche ou minimize o aplicativo / navegador AGORA MESMO para ver a notificação de teste chegar no seu dispositivo!");
    } else {
      alert("Não foi possível agendar o teste via Service Worker. Certifique-se de que o aplicativo está instalado (PWA) ou que o Service Worker está ativo.");
    }
  };


  const handleSaveNotificationSettings = async () => {
    if (!user) return;
    setIsSavingNotificationSettings(true);
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, 'user_notification_settings', user.uid), {
        email: notificationEmail,
        emailEnabled: emailNotificationsEnabled,
        daysBeforeDue: daysBeforeDue,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      alert("Configurações de notificação salvas com sucesso! 🔔");
    } catch (err) {
      console.error('Error saving notification settings:', err);
      alert("Erro ao salvar configurações no servidor.");
    } finally {
      setIsSavingNotificationSettings(false);
    }
  };

  // 1. Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Sync shareToken state based on URL search params and auth state
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('shareToken');
    
    if (tokenFromUrl) {
      localStorage.setItem('saved_share_token', tokenFromUrl);
      setShareToken(tokenFromUrl);
    } else if (user) {
      // Logged in owner/admin accessing main URL -> view Admin Dashboard
      setShareToken(null);
    } else {
      // Unauthenticated guest without shareToken in URL -> check if they have a saved share token
      const saved = localStorage.getItem('saved_share_token');
      if (saved) {
        setShareToken(saved);
      }
    }
  }, [user]);

  // 2. Real-Time Firestore Sync (Only run if user is authenticated and not on a shared link)
  useEffect(() => {
    if (!user || shareToken) return;

    const expensesQuery = query(
      collection(db, 'expenses'),
      where('userId', '==', user.uid)
    );
    const membersQuery = query(
      collection(db, 'members'),
      where('userId', '==', user.uid)
    );
    const budgetsQuery = query(
      collection(db, 'budgets'),
      where('userId', '==', user.uid)
    );
    const categoriesQuery = query(
      collection(db, 'categories'),
      where('userId', '==', user.uid)
    );
    const financingQuery = query(
      collection(db, 'financing_contracts'),
      where('userId', '==', user.uid)
    );

    // Sync Expenses
    const unsubExpenses = onSnapshot(expensesQuery, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Expense);
      setExpenses(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'expenses');
    });

    // Sync Financing Contracts
    const unsubFinancing = onSnapshot(financingQuery, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as FinancingContract);
      setFinancingContracts(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'financing_contracts');
    });

    // Sync Members
    const unsubMembers = onSnapshot(membersQuery, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Member);
      setMembers(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'members');
    });

    // Sync Budgets
    const unsubBudgets = onSnapshot(budgetsQuery, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Budget);
      setBudgets(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'budgets');
    });

    // Sync Categories
    const unsubCategories = onSnapshot(categoriesQuery, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Category);
      setCategories(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'categories');
    });

    return () => {
      unsubExpenses();
      unsubFinancing();
      unsubMembers();
      unsubBudgets();
      unsubCategories();
    };
  }, [user, shareToken]);

  // Lock ref to prevent concurrent generation calls for same template and month
  const generatingRef = useRef<Set<string>>(new Set());

  // Auto-generator for active recurring expenses in currentMonth
  useEffect(() => {
    if (!user || shareToken || !expenses.length) return;

    const generateMissingRecurring = async () => {
      // Group recurring expenses by templateId
      const seriesMap = new Map<string, Expense[]>();

      for (const exp of expenses) {
        if (!exp.isRecurring && !exp.recurringTemplateId) continue;
        const templateId = exp.recurringTemplateId || exp.id;
        if (!seriesMap.has(templateId)) {
          seriesMap.set(templateId, []);
        }
        seriesMap.get(templateId)!.push(exp);
      }

      for (const [templateId, seriesItems] of seriesMap.entries()) {
        const rootTpl = seriesItems.find(e => e.id === templateId) || seriesItems[0];
        if (!rootTpl) continue;

        // Check if recurring is paused as of currentMonth by looking at the latest item on or before currentMonth
        const itemsUpToCurrentMonth = seriesItems
          .filter(e => e.dueDate.substring(0, 7) <= currentMonth)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

        let isPaused = false;
        let isArchived = seriesItems.some(e => e.isArchived === true);
        if (itemsUpToCurrentMonth.length > 0) {
          const latestItem = itemsUpToCurrentMonth[itemsUpToCurrentMonth.length - 1];
          isPaused = latestItem.recurringActive === false;
          if (latestItem.isArchived !== undefined) {
            isArchived = latestItem.isArchived;
          }
        } else {
          isPaused = rootTpl.recurringActive === false;
          if (rootTpl.isArchived !== undefined) {
            isArchived = rootTpl.isArchived;
          }
        }

        if (isPaused || isArchived) {
          // Do not auto-generate if series is paused or archived
          continue;
        }

        const templateStartMonth = rootTpl.dueDate.substring(0, 7); // YYYY-MM

        if (currentMonth >= templateStartMonth) {
          const existsInCurrentMonth = seriesItems.some(e => e.dueDate.startsWith(currentMonth));

          if (!existsInCurrentMonth) {
            // Check in-flight lock key
            const lockKey = `${templateId}_${currentMonth}`;
            if (generatingRef.current.has(lockKey)) continue;

            // Deterministic document ID to guarantee idempotency and prevent duplicates
            const docId = `rec_${templateId}_${currentMonth.replace('-', '_')}`;
            if (expenses.some(e => e.id === docId)) continue;

            // Use the latest available item in the series to inherit updated due day, variable setting, or amount
            const refItem = itemsUpToCurrentMonth.length > 0
              ? itemsUpToCurrentMonth[itemsUpToCurrentMonth.length - 1]
              : rootTpl;

            const dayStr = refItem.dueDate.split('-')[2] || rootTpl.dueDate.split('-')[2] || '10';
            const dayNum = parseInt(dayStr, 10);
            
            const [yearStr, monthStr] = currentMonth.split('-');
            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10);
            
            const maxDaysInMonth = new Date(year, month, 0).getDate();
            const actualDay = Math.min(dayNum, maxDaysInMonth);
            const formattedDay = String(actualDay).padStart(2, '0');
            const targetDueDate = `${currentMonth}-${formattedDay}`;

            const isVar = refItem.isVariableValue ?? rootTpl.isVariableValue ?? false;
            const refAmt = isVar ? 0 : (refItem.amount || rootTpl.amount || 0);

            const expType = refItem.type || rootTpl.type || 'third_party';
            const respMemberId = refItem.responsibleMemberId || rootTpl.responsibleMemberId || 'all';
            let tokens: string[] = [];
            if (expType === 'third_party') {
              if (respMemberId === 'all') {
                tokens = members.map(m => m.shareToken).filter(Boolean);
              } else {
                const m = members.find(mem => mem.id === respMemberId || mem.name.trim().toLowerCase() === respMemberId.trim().toLowerCase());
                if (m?.shareToken) tokens = [m.shareToken];
              }
            }

            const newDocRef = doc(db, 'expenses', docId);
            const payload: any = cleanUndefined({
              description: refItem.description || rootTpl.description,
              category: refItem.category || rootTpl.category,
              amount: refAmt,
              originalAmount: refAmt,
              amountPaid: 0,
              transactionDate: `${currentMonth}-01`,
              dueDate: targetDueDate,
              type: refItem.type || rootTpl.type,
              userId: user.uid,
              isPaid: false,
              isRecurring: true,
              recurrenceFrequency: 'monthly',
              recurringActive: true,
              isVariableValue: isVar,
              needsAmount: isVar,
              recurringTemplateId: templateId,
              responsibleMemberId: respMemberId,
              memberShareTokens: tokens,
              dailyInterestType: refItem.dailyInterestType || rootTpl.dailyInterestType || 'none',
              dailyInterestValue: refItem.dailyInterestValue || rootTpl.dailyInterestValue || 0,
              interestType: refItem.interestType || rootTpl.interestType || 'none',
              interestValue: refItem.interestValue || rootTpl.interestValue || 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });

            try {
              generatingRef.current.add(lockKey);
              await setDoc(newDocRef, payload);
            } catch (err) {
              console.error('Error auto-generating recurring expense:', err);
            } finally {
              generatingRef.current.delete(lockKey);
            }
          }
        }
      }
    };

    generateMissingRecurring();
  }, [user, shareToken, expenses, members, currentMonth]);

  // Auth Handlers
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      alert("Falha no login com Google. Verifique sua conexão.");
    }
  };

  const handleLogout = async () => {
    if (await customConfirm("Sair da Conta", "Deseja realmente sair?")) {
      await signOut(auth);
    }
  };

  // Firestore Database Mutations
  const handleAddExpense = async (
    expenseData: Omit<Expense, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
    installments?: number,
    installmentOverrides?: { [key: number]: { isPaid: boolean, paidAt?: string } }
  ) => {
    if (!user) return;

    try {
      if (installments && installments > 1) {
        const baseAmount = expenseData.amount / installments;
        const groupId = `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        let remainingAmountPaid = expenseData.isPaid 
          ? expenseData.amount 
          : (expenseData.amountPaid || 0);
        
        for (let i = 1; i <= installments; i++) {
          const docId = doc(collection(db, 'expenses')).id;
          
          // Calculate due date incremented month-by-month
          const baseDueDate = new Date(expenseData.dueDate + 'T12:00:00');
          baseDueDate.setMonth(baseDueDate.getMonth() + (i - 1));
          const yr = baseDueDate.getFullYear();
          const mo = String(baseDueDate.getMonth() + 1).padStart(2, '0');
          const dy = String(baseDueDate.getDate()).padStart(2, '0');
          const formattedDueDate = `${yr}-${mo}-${dy}`;

          // Use the original transaction date (date of purchase/registration) for all installments
          const formattedTxDate = expenseData.transactionDate;

          // Set share tokens safely (only third_party expenses get tokens)
          let tokens: string[] = [];
          if (expenseData.type === 'third_party') {
            if (expenseData.responsibleMemberId === 'all') {
              tokens = members.map(m => m.shareToken).filter(Boolean);
            } else if (expenseData.responsibleMemberId) {
              const m = members.find(m => m.id === expenseData.responsibleMemberId || m.name.trim().toLowerCase() === expenseData.responsibleMemberId.trim().toLowerCase());
              if (m?.shareToken) tokens = [m.shareToken];
            }
          }

          // Calculate current installment amount
          const currentInstAmt = parseFloat(baseAmount.toFixed(2));

          // Allocate amountPaid to this installment
          const currentInstPaid = Math.min(currentInstAmt, remainingAmountPaid);
          remainingAmountPaid = Math.max(0, remainingAmountPaid - currentInstPaid);

          // It is paid if the whole expense is paid, or if we allocated enough to fully cover this installment
          let isInstPaid = expenseData.isPaid || (currentInstPaid >= currentInstAmt - 0.01);
          let instPaidAt = isInstPaid ? (expenseData.paidAt || formattedDueDate) : "";
          let finalInstAmtPaid = parseFloat(currentInstPaid.toFixed(2));

          if (installmentOverrides && installmentOverrides[i]) {
            isInstPaid = installmentOverrides[i].isPaid;
            instPaidAt = isInstPaid ? (installmentOverrides[i].paidAt || formattedDueDate) : "";
            finalInstAmtPaid = isInstPaid ? currentInstAmt : 0;
          }

          await setDoc(doc(db, 'expenses', docId), cleanUndefined({
            ...expenseData,
            description: `${expenseData.description} (${i}/${installments})`,
            amount: currentInstAmt,
            originalAmount: currentInstAmt,
            amountPaid: finalInstAmtPaid,
            transactionDate: formattedTxDate,
            dueDate: formattedDueDate,
            currentInstallment: i,
            installmentsCount: installments,
            installmentGroupId: groupId,
            isInstallments: true,
            isPaid: isInstPaid,
            paidAt: instPaidAt,
            memberShareTokens: tokens,
            userId: user.uid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }));
        }
      } else {
        // Single Expense
        const docId = doc(collection(db, 'expenses')).id;
        
        let tokens: string[] = [];
        if (expenseData.type === 'third_party') {
          if (expenseData.responsibleMemberId === 'all') {
            tokens = members.map(m => m.shareToken).filter(Boolean);
          } else if (expenseData.responsibleMemberId) {
            const m = members.find(m => m.id === expenseData.responsibleMemberId || m.name.trim().toLowerCase() === expenseData.responsibleMemberId.trim().toLowerCase());
            if (m?.shareToken) tokens = [m.shareToken];
          }
        }

        const isRec = !!expenseData.isRecurring;
        const isVar = !!expenseData.isVariableValue;
        const needsAmt = isVar || (isRec && (expenseData.amount === 0 || expenseData.needsAmount));

        await setDoc(doc(db, 'expenses', docId), cleanUndefined({
          ...expenseData,
          isRecurring: isRec,
          recurrenceFrequency: isRec ? 'monthly' : 'none',
          recurringActive: isRec ? (expenseData.recurringActive !== undefined ? expenseData.recurringActive : true) : undefined,
          isVariableValue: isVar,
          needsAmount: needsAmt,
          recurringTemplateId: isRec ? (expenseData.recurringTemplateId || docId) : undefined,
          memberShareTokens: tokens,
          userId: user.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'expenses');
    }
  };

  const handleUpdateExpense = async (id: string, expenseData: Partial<Expense>) => {
    try {
      if (id.startsWith('virtual_financing_')) {
        const parts = id.replace('virtual_financing_', '').split('_');
        const contractId = parts[0];
        const installmentNum = parseInt(parts[1]);
        const contract = financingContracts.find(c => c.id === contractId);
        if (contract) {
          const overrides = { ...(contract.installmentsOverride || {}) };
          const currentOverride = overrides[String(installmentNum)] || { isPaid: false };
          const isPaid = expenseData.isPaid !== undefined ? expenseData.isPaid : !currentOverride.isPaid;
          overrides[String(installmentNum)] = {
            ...currentOverride,
            isPaid,
            paidAt: isPaid ? (expenseData.paidAt || getLocalTodayStr()) : ""
          };
          const docRef = doc(db, 'financing_contracts', contractId);
          await updateDoc(docRef, {
            installmentsOverride: overrides,
            updatedAt: new Date().toISOString()
          });
        }
        return;
      }

      const docRef = doc(db, 'expenses', id);
      let updatedPayload = { ...expenseData };

      const currentExp = expenses.find(e => e.id === id);
      const targetType = updatedPayload.type !== undefined ? updatedPayload.type : currentExp?.type;

      let tokens: string[] = [];
      if (targetType === 'third_party') {
        const targetRespId = updatedPayload.responsibleMemberId !== undefined 
          ? updatedPayload.responsibleMemberId 
          : (currentExp?.responsibleMemberId || 'all');

        if (targetRespId === 'all') {
          tokens = members.map(m => m.shareToken).filter(Boolean);
        } else if (targetRespId) {
          const m = members.find(mem => mem.id === targetRespId || mem.name.trim().toLowerCase() === targetRespId.trim().toLowerCase());
          if (m?.shareToken) tokens = [m.shareToken];
        }
      }
      updatedPayload.memberShareTokens = tokens;

      if (updatedPayload.amount !== undefined && updatedPayload.amount > 0 && updatedPayload.needsAmount === undefined) {
        updatedPayload.needsAmount = false;
      }
      if (expenseData.isPaid !== undefined) {
        if (expenseData.isPaid) {
          const currentExp = expenses.find(e => e.id === id);
          if (currentExp) {
            const calc = calculateExpenseInterest(currentExp);
            updatedPayload.paidAt = expenseData.paidAt || getLocalTodayStr();
            if (expenseData.amount === undefined) {
              updatedPayload.amount = calc.currentAmount;
              updatedPayload.originalAmount = calc.originalAmount;
              updatedPayload.manualInterestApplied = calc.manualInterest;
            } else {
              if (updatedPayload.originalAmount === undefined) {
                updatedPayload.originalAmount = expenseData.amount;
              }
            }
          }
        } else {
          updatedPayload.paidAt = "";
        }
      }
      await updateDoc(docRef, cleanUndefined({
        ...updatedPayload,
        updatedAt: new Date().toISOString()
      }));

      // Sync recurring active status across the series if toggled
      if (updatedPayload.recurringActive !== undefined) {
        const currentExp = expenses.find(e => e.id === id);
        if (currentExp && (currentExp.isRecurring || currentExp.recurringTemplateId)) {
          const templateId = currentExp.recurringTemplateId || currentExp.id;
          const expMonth = currentExp.dueDate.substring(0, 7);
          const newActiveState = updatedPayload.recurringActive;

          const matchingExpenses = expenses.filter(e => e.id === templateId || e.recurringTemplateId === templateId);

          const syncPayload = cleanUndefined({
            recurringActive: newActiveState,
            updatedAt: new Date().toISOString()
          });

          for (const match of matchingExpenses) {
            if (match.id !== id) {
              const matchMonth = match.dueDate.substring(0, 7);
              // Update all instances on or after the month being toggled (future and current month only)
              if (matchMonth >= expMonth) {
                try {
                  await updateDoc(doc(db, 'expenses', match.id), syncPayload);
                } catch (e) {
                  console.warn("Could not sync recurring status for item:", match.id, e);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `expenses/${id}`);
    }
  };

  const handleDeleteExpense = async (id: string, skipConfirm = false) => {
    if (id.startsWith('virtual_financing_')) {
      await customConfirm(
        "Ação Bloqueada",
        "Esta é uma despesa virtual vinculada ao seu Financiamento Imobiliário. Para removê-la, vá até a aba de 'Financiamentos' e ajuste as parcelas ou exclua o contrato."
      );
      return;
    }

    if (!skipConfirm && !(await customConfirm("Excluir Despesa", "Tem certeza que deseja excluir esta despesa?"))) return;
    try {
      const docRef = doc(db, 'expenses', id);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `expenses/${id}`);
    }
  };

  const handleAddCategory = async (name: string) => {
    if (!user) return;
    try {
      const docId = doc(collection(db, 'categories')).id;
      await setDoc(doc(db, 'categories', docId), {
        name,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'categories');
    }
  };

  const handleUpdateCategory = async (id: string, name: string) => {
    try {
      const docRef = doc(db, 'categories', id);
      await updateDoc(docRef, {
        name,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `categories/${id}`);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      const docRef = doc(db, 'categories', id);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `categories/${id}`);
    }
  };

  const handleAddMember = async (name: string) => {
    if (!user) return;
    try {
      const docId = doc(collection(db, 'members')).id;
      // Simple robust random unique token generator
      const shareToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      await setDoc(doc(db, 'members', docId), {
        name,
        userId: user.uid,
        shareToken,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'members');
    }
  };

  const handleDeleteMember = async (id: string) => {
    if (!(await customConfirm("Excluir Integrante", "Excluir este integrante fará com que o link compartilhado dele pare de funcionar. Deseja continuar?"))) return;
    try {
      const docRef = doc(db, 'members', id);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `members/${id}`);
    }
  };

  const handleAddBudget = async (category: string, amount: number, month: string) => {
    if (!user) return;
    try {
      const docId = doc(collection(db, 'budgets')).id;
      await setDoc(doc(db, 'budgets', docId), {
        category,
        amount,
        month,
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'budgets');
    }
  };

  const handleDeleteBudget = async (id: string) => {
    if (!(await customConfirm("Excluir Orçamento", "Deseja remover este orçamento de categoria?"))) return;
    try {
      const docRef = doc(db, 'budgets', id);
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `budgets/${id}`);
    }
  };

  // Switch month toolbar
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

  const formattedMonthLabel = useMemo(() => {
    const [year, month] = currentMonth.split('-');
    const monthNames = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", 
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    return `${monthNames[parseInt(month) - 1]} de ${year}`;
  }, [currentMonth]);

  // If loading authentication state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 font-semibold font-display">Carregando sistema financeiro...</p>
        </div>
      </div>
    );
  }

  // Render PUBLIC MEMBER VIEWER route
  if (shareToken) {
    return (
      <MemberViewer 
        shareToken={shareToken} 
        onExitSharedView={handleExitSharedView}
        onInstallApp={handleInstallApp}
        showInstallBtn={showInstallBtn}
      />
    );
  }

  // Render LOGIN SCREEN if user is not logged in
  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar navigation Menu (Fully custom styled with collapse feature) */}
      <aside className={`fixed inset-y-0 left-0 z-50 bg-slate-900 text-slate-300 flex flex-col transform transition-all duration-300 ease-in-out ${
        isDesktopSidebarOpen ? 'w-64 md:relative opacity-100 pointer-events-auto' : 'w-0 md:w-0 overflow-hidden md:relative pointer-events-none opacity-0'
      } ${
        isSidebarOpen ? 'translate-x-0 w-64 opacity-100 pointer-events-auto' : '-translate-x-full md:translate-x-0'
      }`}>
        <div className="flex flex-col h-full w-64 min-w-[256px]">
          {/* Header inside sidebar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between min-w-[250px]">
          <button 
            onClick={() => setIsLogoModalOpen(true)}
            className="flex items-center text-left hover:opacity-90 transition cursor-pointer group"
            title="Clique para visualizar/aprovar a Logo"
          >
            <SecretLogo size="sm" dark={true} variant="full" />
          </button>
          <div className="flex items-center space-x-1.5">
            <button 
              className="md:hidden text-slate-400 hover:text-white p-1 rounded-lg transition"
              onClick={() => setIsSidebarOpen(false)}
            >
              <X size={18} />
            </button>
            <button 
              className="hidden md:flex text-slate-400 hover:text-white hover:bg-slate-800 p-1 rounded-lg transition"
              onClick={() => {
                setIsDesktopSidebarOpen(false);
                localStorage.setItem('desktopSidebarOpen', 'false');
              }}
              title="Ocultar Menu"
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        </div>

        {/* User Card */}
        <div className="p-4 border-b border-slate-800 flex items-center space-x-3">
          {user.photoURL ? (
            <img src={user.photoURL} alt={user.displayName || 'User'} className="w-9 h-9 rounded-full" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold">
              {user.displayName?.[0] || 'U'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate">{user.displayName}</p>
            <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
          </div>
        </div>

        {/* Navigation Tabs List */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <button
            onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'dashboard' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-3">
              <LayoutDashboard size={16} />
              <span>Painel Geral</span>
            </div>
            {upcomingExpensesInfo.totalCount > 0 && (
              <span 
                className={`font-bold text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === 'dashboard' ? 'bg-indigo-200 text-indigo-900 font-bold' : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                }`}
                title={`${upcomingExpensesInfo.totalCount} despesa(s) próxima(s) de vencer (3 dias)`}
              >
                {upcomingExpensesInfo.totalCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('relatorio_anual'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'relatorio_anual' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <BarChart3 size={16} />
            <span>Relatório Anual</span>
          </button>

          <button
            onClick={() => { setActiveTab('controle_renda'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'controle_renda' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-3">
              <TrendingUp size={16} />
              <span>Controle de Renda</span>
            </div>
          </button>

          <button
            onClick={() => { setActiveTab('pessoais'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'pessoais' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Wallet size={16} />
              <span>Despesas Pessoais</span>
            </div>
            {upcomingExpensesInfo.personalCount > 0 && (
              <span 
                className={`font-bold text-[10px] px-1.5 py-0.5 rounded-full animate-pulse transition-all ${
                  activeTab === 'pessoais' ? 'bg-amber-300 text-amber-950 font-bold' : 'bg-amber-500 text-white'
                }`}
                title={`${upcomingExpensesInfo.personalCount} despesa(s) próxima(s) de vencer (3 dias)`}
              >
                {upcomingExpensesInfo.personalCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('terceiros'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'terceiros' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Users size={16} />
              <span>Despesas de Terceiros</span>
            </div>
            {upcomingExpensesInfo.thirdPartyCount > 0 && (
              <span 
                className={`font-bold text-[10px] px-1.5 py-0.5 rounded-full animate-pulse transition-all ${
                  activeTab === 'terceiros' ? 'bg-amber-300 text-amber-950 font-bold' : 'bg-amber-500 text-white'
                }`}
                title={`${upcomingExpensesInfo.thirdPartyCount} despesa(s) próxima(s) de vencer (3 dias)`}
              >
                {upcomingExpensesInfo.thirdPartyCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('membros'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'membros' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <UserIcon size={16} />
            <span>Membros & Divisão</span>
          </button>

          <button
            onClick={() => { setActiveTab('orcamentos'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'orcamentos' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <CheckCircle size={16} />
            <span>Metas e Orçamentos</span>
          </button>

          <button
            onClick={() => { setActiveTab('financiamento'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'financiamento' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Building size={16} />
            <span>Financiamentos</span>
          </button>

          <button
            onClick={() => { setActiveTab('atraso'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'atraso' ? 'bg-indigo-600 text-white font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-3">
              <ShieldAlert size={16} />
              <span>Atraso & Juros</span>
            </div>
            {activeOverdueCount > 0 && (
              <span className="bg-rose-500 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
                {activeOverdueCount}
              </span>
            )}
          </button>

          <button
            onClick={() => { setActiveTab('recebimentos'); setIsSidebarOpen(false); }}
            className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'recebimentos' ? 'bg-amber-500 text-slate-950 font-bold' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <ShieldCheck size={16} className={activeTab === 'recebimentos' ? 'fill-slate-950 text-amber-500' : ''} />
            <span>Dados de Recebimento</span>
          </button>
        </nav>

        {/* Theme and Logout Area */}
        <div className="p-4 border-t border-slate-800 space-y-4">
          {/* Theme Selector */}
          <div className="flex items-center justify-between bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 flex items-center justify-center space-x-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                theme === 'light' 
                  ? 'bg-indigo-600 text-white font-black shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sun size={13} />
              <span>Claro</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 flex items-center justify-center space-x-2 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                theme === 'dark' 
                  ? 'bg-indigo-600 text-white font-black shadow' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Moon size={13} />
              <span>Escuro</span>
            </button>
          </div>

          {showInstallBtn && (
            <button
              onClick={handleInstallApp}
              className="w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-lg shadow-emerald-950/10 cursor-pointer animate-bounce"
            >
              <Download size={16} />
              <span>Instalar Aplicativo</span>
            </button>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-2 rounded-lg text-xs font-semibold hover:bg-rose-950 hover:text-rose-200 transition text-rose-400"
          >
            <LogOut size={16} />
            <span>Sair do Aplicativo</span>
          </button>
        </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top navigation header */}
        <header className="bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between md:hidden shadow-sm flex-shrink-0">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 text-slate-600 hover:bg-slate-50 rounded-lg transition relative"
          >
            <Menu size={20} />
            {(upcomingExpensesInfo.totalCount > 0 || activeOverdueCount > 0) && (
              <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${activeOverdueCount > 0 ? 'bg-rose-500' : 'bg-amber-500'} animate-ping`} />
            )}
            {(upcomingExpensesInfo.totalCount > 0 || activeOverdueCount > 0) && (
              <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${activeOverdueCount > 0 ? 'bg-rose-500' : 'bg-amber-500'}`} />
            )}
          </button>
          <button
            onClick={() => setIsLogoModalOpen(true)}
            className="flex items-center cursor-pointer hover:opacity-90 transition"
          >
            <SecretLogo size="sm" dark={false} variant="full" />
          </button>
          
          <div className="flex items-center space-x-2">
            {/* Mobile Modo Público Button */}
            <button
              onClick={toggleHideValues}
              className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center justify-center ${
                hideValues 
                  ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold shadow-xs' 
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title={hideValues ? "Modo Público Ativo (Valores Ocultos)" : "Ativar Modo Público"}
            >
              {hideValues ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>

            <button
              onClick={() => setIsNotificationModalOpen(true)}
              className="p-1.5 text-slate-600 hover:bg-slate-50 rounded-lg transition relative cursor-pointer"
              title="Lembretes e Alertas"
            >
              <Bell size={20} className={(upcomingExpensesInfo.totalCount > 0 || activeOverdueCount > 0) ? "text-indigo-600" : ""} />
              {(upcomingExpensesInfo.totalCount > 0 || activeOverdueCount > 0) && (
                <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${activeOverdueCount > 0 ? 'bg-rose-500' : 'bg-amber-500'} animate-ping`} />
              )}
              {(upcomingExpensesInfo.totalCount > 0 || activeOverdueCount > 0) && (
                <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full ${activeOverdueCount > 0 ? 'bg-rose-500' : 'bg-amber-500'}`} />
              )}
            </button>
          </div>
        </header>

        {/* Global switched month bar */}
        <div className="bg-white border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-4 flex-shrink-0">
          {/* Switched Month Controls */}
          <div className="flex items-center space-x-2">
            {/* Desktop Toggle Menu Button */}
            <button
              onClick={() => {
                const newState = !isDesktopSidebarOpen;
                setIsDesktopSidebarOpen(newState);
                localStorage.setItem('desktopSidebarOpen', newState ? 'true' : 'false');
              }}
              className="hidden md:flex p-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 hover:text-indigo-600 transition mr-2 items-center justify-center cursor-pointer shadow-sm"
              title={isDesktopSidebarOpen ? "Ocultar Menu Lateral" : "Mostrar Menu Lateral"}
            >
              <Menu size={16} className={isDesktopSidebarOpen ? "text-indigo-600" : "text-slate-500"} />
            </button>

            <button
              onClick={handlePrevMonth}
              className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-800 transition"
              title="Mês Anterior"
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="flex items-center space-x-1.5 px-4 py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-700">
              <Calendar size={14} className="text-indigo-500" />
              <span className="text-sm font-bold font-display">{formattedMonthLabel}</span>
            </div>

            <button
              onClick={handleNextMonth}
              className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-800 transition"
              title="Próximo Mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="hidden sm:block text-xs text-slate-500 font-medium">
              Sincronização em tempo real ativa • <span className="text-emerald-500 font-bold">Online</span>
            </div>
            
            <div className="h-4 w-px bg-slate-200 hidden sm:block"></div>

            {/* Desktop Modo Público Toggle Button in Top Header Bar */}
            <button
              onClick={toggleHideValues}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all duration-200 cursor-pointer flex items-center space-x-1.5 shadow-xs ${
                hideValues 
                  ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-sm' 
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
              }`}
              title="Alternar Modo Público (ocultar valores na tela)"
            >
              {hideValues ? (
                <>
                  <EyeOff size={15} />
                  <span>Modo Público: ON</span>
                </>
              ) : (
                <>
                  <Eye size={15} />
                  <span>Modo Público</span>
                </>
              )}
            </button>

            {/* Notification Bell Icon "no cantinho, lá em cima" */}
            <button
              onClick={() => setIsNotificationModalOpen(true)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition relative border border-slate-200 hover:border-slate-300 shadow-sm flex items-center justify-center bg-white cursor-pointer"
              title="Central de Alertas & Lembretes"
            >
              <Bell size={18} className={(upcomingExpensesInfo.totalCount > 0 || activeOverdueCount > 0) ? "animate-bounce text-indigo-600" : ""} />
              {(upcomingExpensesInfo.totalCount > 0 || activeOverdueCount > 0) && (
                <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${activeOverdueCount > 0 ? 'bg-rose-500' : 'bg-amber-500'} animate-ping`} />
              )}
              {(upcomingExpensesInfo.totalCount > 0 || activeOverdueCount > 0) && (
                <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${activeOverdueCount > 0 ? 'bg-rose-500' : 'bg-amber-500'}`} />
              )}
            </button>
          </div>
        </div>

        {/* Active viewport content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {activeTab === 'dashboard' && (
            <Dashboard 
              expenses={mergedExpenses} 
              members={members} 
              budgets={budgets} 
              currentMonth={currentMonth}
              onNavigateTab={setActiveTab}
              onUpdateExpense={handleUpdateExpense}
              user={user}
              onEditExpense={handleEditExpenseGlobally}
              hideValues={hideValues}
              onToggleHideValues={toggleHideValues}
            />
          )}

          {activeTab === 'relatorio_anual' && (
            <RelatorioAnualTab 
              expenses={mergedExpenses}
              members={members}
              categoriesList={allCategoryNames}
              hideValues={hideValues}
            />
          )}

          {activeTab === 'controle_renda' && user && (
            <ControleRendaTab 
              userId={user.uid}
              currentMonth={currentMonth}
              hideValues={hideValues}
            />
          )}

          {activeTab === 'financiamento' && user && (
            <FinanciamentoTab 
              userId={user.uid}
              currentMonth={currentMonth}
              customConfirm={customConfirm}
              hideValues={hideValues}
            />
          )}

          {activeTab === 'pessoais' && (
            <ExpensesTab 
              type="personal"
              expenses={mergedExpenses}
              members={members}
              onAddExpense={handleAddExpense}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
              currentMonth={currentMonth}
              onSelectMonth={setCurrentMonth}
              customConfirm={customConfirm}
              categoriesList={allCategoryNames}
              onManageCategories={() => setIsCategoriesModalOpen(true)}
              externalEditingId={externalEditingId}
              onClearExternalEditingId={() => setExternalEditingId(null)}
              hideValues={hideValues}
            />
          )}

          {activeTab === 'terceiros' && (
            <ExpensesTab 
              type="third_party"
              expenses={mergedExpenses}
              members={members}
              onAddExpense={handleAddExpense}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
              currentMonth={currentMonth}
              onSelectMonth={setCurrentMonth}
              customConfirm={customConfirm}
              categoriesList={allCategoryNames}
              onManageCategories={() => setIsCategoriesModalOpen(true)}
              externalEditingId={externalEditingId}
              onClearExternalEditingId={() => setExternalEditingId(null)}
              hideValues={hideValues}
            />
          )}

          {activeTab === 'membros' && (
            <MembersTab 
              members={members}
              expenses={mergedExpenses}
              onAddMember={handleAddMember}
              onDeleteMember={handleDeleteMember}
              currentMonth={currentMonth}
              hideValues={hideValues}
            />
          )}

          {activeTab === 'orcamentos' && (
            <BudgetsTab 
              budgets={budgets}
              expenses={mergedExpenses}
              onAddBudget={handleAddBudget}
              onDeleteBudget={handleDeleteBudget}
              currentMonth={currentMonth}
              categoriesList={allCategoryNames}
              hideValues={hideValues}
            />
          )}

          {activeTab === 'atraso' && (
            <OverdueTab
              expenses={mergedExpenses}
              members={members}
              onUpdateExpense={handleUpdateExpense}
              onDeleteExpense={handleDeleteExpense}
              customConfirm={customConfirm}
              onEditExpense={handleEditExpenseGlobally}
              hideValues={hideValues}
            />
          )}

          {activeTab === 'recebimentos' && (
            <PixConfigTab />
          )}
        </main>
      </div>

      <ConfirmModal
        isOpen={!!confirmPromise}
        title={confirmPromise?.title || ''}
        message={confirmPromise?.message || ''}
        onConfirm={() => {
          confirmPromise?.resolve(true);
          setConfirmPromise(null);
        }}
        onCancel={() => {
          confirmPromise?.resolve(false);
          setConfirmPromise(null);
        }}
      />

      <CategoriesModal
        isOpen={isCategoriesModalOpen}
        onClose={() => setIsCategoriesModalOpen(false)}
        categories={categories}
        defaultCategories={DEFAULT_CATEGORIES}
        onAddCategory={handleAddCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
        customConfirm={customConfirm}
      />

      {/* Central de Lembretes e Alertas Modal */}
      {isNotificationModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
                  <Bell size={20} className="animate-swing" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 tracking-wider uppercase font-display italic">
                    Configurar Alertas & Lembretes
                  </h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                    Canais táticos via Navegador e E-mail
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNotificationModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Overdue alert banner inside modal */}
              {overdueExpensesInfo.totalCount > 0 && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-xs text-rose-900 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-black text-rose-950 uppercase tracking-wide">
                      <AlertTriangle size={18} className="text-rose-600 shrink-0" />
                      <span>{overdueExpensesInfo.totalCount} Despesa(s) Vencida(s) - Notificação Diária</span>
                    </div>
                    <span className="px-2 py-0.5 bg-rose-200 text-rose-900 text-[10px] font-bold rounded-full">
                      Até Quitação
                    </span>
                  </div>
                  <p className="text-[11px] text-rose-800 font-medium leading-relaxed">
                    Você receberá um alerta diariamente no navegador contendo o nome, valor atualizado com juros e dias em atraso até a confirmação do pagamento.
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {overdueExpensesInfo.items.map(({ exp, calc }) => {
                      const totalInterest = calc.currentAmount - calc.originalAmount;
                      const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                      return (
                        <div key={exp.id} className="bg-white p-2.5 rounded-lg border border-rose-200 text-xs flex items-center justify-between gap-2 shadow-2xs">
                          <div>
                            <p className="font-bold text-slate-900">{exp.description}</p>
                            <p className="text-[10px] text-rose-600 font-semibold">Vencida há {calc.daysOverdue} dia(s) ({exp.dueDate.split('-').reverse().join('/')})</p>
                          </div>
                          <div className="text-right font-mono">
                            <p className="font-bold text-rose-700">{formatCurrency(calc.currentAmount)}</p>
                            {totalInterest > 0 ? (
                              <p className="text-[10px] text-amber-600 font-bold">+ {formatCurrency(totalInterest)} juros</p>
                            ) : (
                              <p className="text-[10px] text-slate-400 font-medium">Sem juros</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upcoming alert banner inside modal */}
              {upcomingExpensesInfo.totalCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-800 font-bold flex items-start gap-2.5">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold uppercase tracking-wide text-[10px] text-amber-900 mb-0.5">Alerta de Despesas Próximas</p>
                    <p className="font-medium text-amber-800">Você possui {upcomingExpensesInfo.totalCount} despesa(s) vencendo nos próximos {daysBeforeDue} dias!</p>
                  </div>
                </div>
              )}

              {/* Explanation Banner for Background Notifications */}
              <div className="p-4 rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/80 to-blue-50/50 space-y-2.5">
                <div className="flex items-center gap-2 text-indigo-900 font-extrabold text-xs uppercase tracking-wider">
                  <ShieldCheck size={16} className="text-indigo-600 shrink-0" />
                  <span>Como Notificar Fora do Aplicativo (App Fechado)</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  • <strong>Instale o Aplicativo (PWA):</strong> Para o seu celular (Android/iOS) ou PC emitir notificações com a tela bloqueada ou o navegador fechado, o aplicativo precisa estar instalado no dispositivo como PWA.
                </p>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  • <strong>Service Worker em Segundo Plano:</strong> Após permitir as notificações e instalar o App, o Service Worker verifica periodicamente os vencimentos e emite alertas na central de notificações do seu celular/PC!
                </p>
                <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                  • <strong>Canal de E-mail Recomendado:</strong> Ative também os alertas por e-mail abaixo para garantir 100% de entrega diária na sua caixa de entrada.
                </p>
              </div>

              {/* PWA Installation Card */}
              {showInstallBtn ? (
                <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-emerald-950 uppercase tracking-wide flex items-center gap-1.5">
                      📱 Instalar Aplicativo no Dispositivo
                    </p>
                    <p className="text-[11px] text-emerald-800 font-medium leading-relaxed">
                      Instale na tela inicial para receber alertas com o navegador fechado.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleInstallApp}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition shadow-sm shrink-0 cursor-pointer"
                  >
                    Instalar App Agora
                  </button>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] text-slate-600 leading-relaxed">
                  <p className="font-bold text-slate-800 text-xs mb-1">💡 Como instalar no seu celular/computador:</p>
                  <p>• <strong>No Android (Chrome):</strong> Toque nos 3 pontinhos do navegador e escolha <em>"Instalar aplicativo"</em> ou <em>"Adicionar à tela inicial"</em>.</p>
                  <p>• <strong>No iPhone (Safari):</strong> Toque no botão de Compartilhar e selecione <em>"Adicionar à Tela de Início"</em>.</p>
                </div>
              )}

              {/* Browser Notifications Channel */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col space-y-3">
                {window.self !== window.top && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-normal flex gap-2">
                    <span className="text-sm">⚠️</span>
                    <div>
                      <p className="font-bold mb-0.5">Visualização em iFrame</p>
                      <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                        Como você está visualizando o aplicativo dentro do painel do AI Studio (iframe), os navegadores modernos bloqueiam o recebimento de notificações por segurança. 
                        <strong> Para ativar e testar as notificações de verdade, por favor abra o aplicativo em uma nova aba</strong> (clique no botão de quadrado com seta no topo superior direito do AI Studio) e ative por lá!
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Bell size={16} className="text-indigo-600" /> Notificações no Dispositivo
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    browserNotificationsEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {browserNotificationsEnabled ? 'Ativo' : 'Desativado'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Receba alertas push instantâneos sobre despesas a vencer diretamente no seu celular ou computador.
                </p>
                
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={requestBrowserPermission}
                    className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                      browserNotificationsEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                    }`}
                  >
                    <Bell size={15} />
                    {browserNotificationsEnabled ? 'Notificações Ativadas!' : 'Ativar Notificações no Navegador'}
                  </button>

                  {browserNotificationsEnabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={testPushNotification}
                        className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        🔔 Testar Agora (Aberto)
                      </button>

                      <button
                        type="button"
                        onClick={testBackgroundNotification}
                        className="py-2 px-3 bg-indigo-100 hover:bg-indigo-200 text-indigo-900 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 border border-indigo-200"
                      >
                        ⏳ Testar em Segundo Plano (10s)
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Email Notifications Channel */}
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                    <Mail size={16} className="text-indigo-600" /> Canal de Notificações por E-mail
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    emailNotificationsEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {emailNotificationsEnabled ? 'Ativo' : 'Desativado'}
                  </span>
                </div>
                
                <p className="text-xs text-slate-500 leading-relaxed">
                  Envie relatórios automáticos e lembretes diários de contas a pagar para o seu endereço de e-mail cadastrado.
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 flex flex-col space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">E-mail para Alertas</label>
                    <input
                      type="email"
                      placeholder="seu-email@exemplo.com"
                      value={notificationEmail}
                      onChange={(e) => setNotificationEmail(e.target.value)}
                      disabled={!emailNotificationsEnabled}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                    />
                  </div>

                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Antecedência</label>
                    <select
                      value={daysBeforeDue}
                      onChange={(e) => setDaysBeforeDue(Number(e.target.value))}
                      disabled={!emailNotificationsEnabled}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 disabled:text-slate-400 font-bold"
                    >
                      <option value="1">1 dia antes</option>
                      <option value="2">2 dias antes</option>
                      <option value="3">3 dias antes</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-2">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={emailNotificationsEnabled}
                      onChange={(e) => setEmailNotificationsEnabled(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">Ativar Canal de E-mail</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleSaveNotificationSettings}
                    disabled={isSavingNotificationSettings}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1 cursor-pointer"
                  >
                    {isSavingNotificationSettings ? 'Salvando...' : 'Salvar Canal'}
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsNotificationModalOpen(false)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition shadow-sm cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logo Preview Modal */}
      <LogoPreviewModal
        isOpen={isLogoModalOpen}
        onClose={() => setIsLogoModalOpen(false)}
        onApprove={() => {
          setIsLogoModalOpen(false);
        }}
      />
    </div>
  );
}
