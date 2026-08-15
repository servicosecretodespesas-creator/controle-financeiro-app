import React, { useState, useMemo, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, cleanUndefined } from '../firebase';
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
import { FinancingContract, InstallmentOverride } from '../types';
import { getLocalTodayStr } from '../utils/interest';
import { 
  Home, 
  TrendingUp, 
  DollarSign, 
  Calendar, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  Clock, 
  AlertCircle, 
  FileText, 
  ChevronRight, 
  ChevronLeft, 
  Info, 
  Building,
  Hammer,
  HelpCircle,
  Eye,
  RefreshCw,
  X,
  Key,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

// Helper functions for contract timeline and stats calculations
export function calculateContractTimeline(contract: FinancingContract) {
  const list: Array<{
    number: number;
    dueDate: string;
    amortization: number;
    interest: number;
    insurance: number;
    constructionFee: number;
    iptu: number;
    condominio: number;
    reforms: number;
    extraPaid: number;
    totalValue: number;
    outstandingBefore: number;
    outstandingAfter: number;
    isPaid: boolean;
    paidAt?: string;
    isObra: boolean;
    notes?: string;
  }> = [];

  const {
    contractType = 'financing',
    financedAmount = 0,
    totalInstallments = 1,
    startDate,
    amortizationSystem = 'SAC',
    interestRateAnnum = 0,
    monthlyInsurance = 0,
    hasKeysHandover = false,
    keysHandoverDate,
    installmentsOverride = {},
    customDescription = '',
    paymentType = 'installments',
    isRecurring = false,
    recurrenceFrequency = 'single',
    recurrenceCount = 1
  } = contract;

  const baseDate = new Date(startDate + 'T12:00:00');

  if (contractType === 'financing') {
    const monthlyRate = (interestRateAnnum / 100) / 12;
    let outstandingPrincipal = financedAmount;

    const priceInstallment = monthlyRate > 0 
      ? (financedAmount * monthlyRate * Math.pow(1 + monthlyRate, totalInstallments)) / (Math.pow(1 + monthlyRate, totalInstallments) - 1)
      : financedAmount / totalInstallments;

    const sacAmortization = financedAmount / totalInstallments;

    for (let k = 1; k <= totalInstallments; k++) {
      const currentDate = new Date(baseDate.getTime());
      currentDate.setMonth(currentDate.getMonth() + (k - 1));
      const defaultDueDateStr = currentDate.toISOString().split('T')[0];

      const override = installmentsOverride[String(k)] || { isPaid: false };
      const dueDate = override.dueDate || defaultDueDateStr;
      const isPaid = override.isPaid;
      const paidAt = override.paidAt;
      const iptu = override.iptu || 0;
      const condominio = override.condominio || 0;
      const reforms = override.reforms || 0;
      const constructionFee = override.constructionFee || 0;
      const extraPaid = override.extraPaid || 0;
      const notes = override.notes || '';

      let isObra = false;
      if (hasKeysHandover && keysHandoverDate) {
        isObra = defaultDueDateStr < keysHandoverDate;
      }

      let amortization = 0;
      let interest = 0;
      let insurance = override.insurance !== undefined ? override.insurance : monthlyInsurance;
      const outstandingBefore = outstandingPrincipal;

      if (override.interest !== undefined) {
        interest = override.interest;
      } else {
        interest = outstandingPrincipal * monthlyRate;
      }

      if (override.amortization !== undefined) {
        amortization = override.amortization;
      } else {
        if (isObra) {
          amortization = 0;
        } else {
          if (amortizationSystem === 'SAC') {
            amortization = sacAmortization;
          } else {
            const calculatedInterest = outstandingPrincipal * monthlyRate;
            amortization = Math.max(0, priceInstallment - calculatedInterest);
          }
        }
      }

      if (amortization > outstandingPrincipal) {
        amortization = outstandingPrincipal;
      }

      const totalAmortizedThisMonth = amortization + extraPaid;
      const outstandingAfter = Math.max(0, outstandingPrincipal - totalAmortizedThisMonth);

      let totalValueForThisInstallment = 0;
      if (isObra) {
        totalValueForThisInstallment = (constructionFee > 0 ? constructionFee : interest + insurance) + iptu + condominio + reforms;
      } else {
        totalValueForThisInstallment = amortization + interest + insurance + iptu + condominio + reforms + extraPaid;
      }

      list.push({
        number: k,
        dueDate,
        amortization: parseFloat(amortization.toFixed(2)),
        interest: parseFloat(interest.toFixed(2)),
        insurance: parseFloat(insurance.toFixed(2)),
        constructionFee: parseFloat(constructionFee.toFixed(2)),
        iptu: parseFloat(iptu.toFixed(2)),
        condominio: parseFloat(condominio.toFixed(2)),
        reforms: parseFloat(reforms.toFixed(2)),
        extraPaid: parseFloat(extraPaid.toFixed(2)),
        totalValue: parseFloat(totalValueForThisInstallment.toFixed(2)),
        outstandingBefore: parseFloat(outstandingBefore.toFixed(2)),
        outstandingAfter: parseFloat(outstandingAfter.toFixed(2)),
        isPaid,
        paidAt,
        isObra,
        notes
      });

      outstandingPrincipal = outstandingAfter;
    }
  } else if (contractType === 'construction') {
    const monthlyFee = totalInstallments > 0 ? (financedAmount / totalInstallments) : 0;
    let outstandingPrincipal = financedAmount;

    for (let k = 1; k <= totalInstallments; k++) {
      const currentDate = new Date(baseDate.getTime());
      currentDate.setMonth(currentDate.getMonth() + (k - 1));
      const defaultDueDateStr = currentDate.toISOString().split('T')[0];

      const override = installmentsOverride[String(k)] || { isPaid: false };
      const dueDate = override.dueDate || defaultDueDateStr;
      const isPaid = override.isPaid;
      const paidAt = override.paidAt;
      const iptu = override.iptu || 0;
      const condominio = override.condominio || 0;
      const reforms = override.reforms || 0;
      const constructionFeeOverride = override.constructionFee;
      const constructionFee = constructionFeeOverride !== undefined ? constructionFeeOverride : monthlyFee;
      const extraPaid = override.extraPaid || 0;
      const notes = override.notes || '';

      const amortization = override.amortization !== undefined ? override.amortization : 0;
      const interest = override.interest !== undefined ? override.interest : 0;
      const insurance = override.insurance !== undefined ? override.insurance : 0;
      const outstandingBefore = outstandingPrincipal;
      const totalAmortizedThisMonth = amortization + extraPaid;
      const outstandingAfter = Math.max(0, outstandingPrincipal - totalAmortizedThisMonth);

      const totalValueForThisInstallment = amortization + interest + insurance + constructionFee + iptu + condominio + reforms + extraPaid;

      list.push({
        number: k,
        dueDate,
        amortization,
        interest,
        insurance,
        constructionFee: parseFloat(constructionFee.toFixed(2)),
        iptu: parseFloat(iptu.toFixed(2)),
        condominio: parseFloat(condominio.toFixed(2)),
        reforms: parseFloat(reforms.toFixed(2)),
        extraPaid: parseFloat(extraPaid.toFixed(2)),
        totalValue: parseFloat(totalValueForThisInstallment.toFixed(2)),
        outstandingBefore: parseFloat(outstandingBefore.toFixed(2)),
        outstandingAfter: parseFloat(outstandingAfter.toFixed(2)),
        isPaid,
        paidAt,
        isObra: true,
        notes
      });

      outstandingPrincipal = outstandingAfter;
    }
  } else if (contractType === 'down_payment') {
    const installmentsNum = paymentType === 'cash' ? 1 : totalInstallments;
    const monthlyFee = installmentsNum > 0 ? (financedAmount / installmentsNum) : 0;
    let outstandingPrincipal = financedAmount;

    for (let k = 1; k <= installmentsNum; k++) {
      const currentDate = new Date(baseDate.getTime());
      currentDate.setMonth(currentDate.getMonth() + (k - 1));
      const defaultDueDateStr = currentDate.toISOString().split('T')[0];

      const override = installmentsOverride[String(k)] || { isPaid: false };
      const dueDate = override.dueDate || defaultDueDateStr;
      const isPaid = override.isPaid;
      const paidAt = override.paidAt;
      const iptu = override.iptu || 0;
      const condominio = override.condominio || 0;
      const reforms = override.reforms || 0;
      const extraPaid = override.extraPaid || 0;
      const notes = override.notes || '';

      const amortization = override.amortization !== undefined ? override.amortization : monthlyFee;
      const interest = override.interest !== undefined ? override.interest : 0;
      const insurance = override.insurance !== undefined ? override.insurance : 0;
      const outstandingBefore = outstandingPrincipal;

      const totalAmortizedThisMonth = amortization + extraPaid;
      const outstandingAfter = Math.max(0, outstandingPrincipal - totalAmortizedThisMonth);

      const totalValueForThisInstallment = amortization + interest + insurance + iptu + condominio + reforms + extraPaid;

      list.push({
        number: k,
        dueDate,
        amortization: parseFloat(amortization.toFixed(2)),
        interest,
        insurance,
        constructionFee: 0,
        iptu: parseFloat(iptu.toFixed(2)),
        condominio: parseFloat(condominio.toFixed(2)),
        reforms: parseFloat(reforms.toFixed(2)),
        extraPaid: parseFloat(extraPaid.toFixed(2)),
        totalValue: parseFloat(totalValueForThisInstallment.toFixed(2)),
        outstandingBefore: parseFloat(outstandingBefore.toFixed(2)),
        outstandingAfter: parseFloat(outstandingAfter.toFixed(2)),
        isPaid,
        paidAt,
        isObra: false,
        notes
      });

      outstandingPrincipal = outstandingAfter;
    }
  } else if (contractType === 'other_installments') {
    const installmentsNum = isRecurring ? (recurrenceCount || 1) : 1;
    let outstandingPrincipal = financedAmount * installmentsNum;

    for (let k = 1; k <= installmentsNum; k++) {
      const currentDate = new Date(baseDate.getTime());
      if (isRecurring) {
        if (recurrenceFrequency === 'semiannual') {
          currentDate.setMonth(currentDate.getMonth() + (k - 1) * 6);
        } else if (recurrenceFrequency === 'annual') {
          currentDate.setMonth(currentDate.getMonth() + (k - 1) * 12);
        } else {
          currentDate.setMonth(currentDate.getMonth() + (k - 1));
        }
      }
      const defaultDueDateStr = currentDate.toISOString().split('T')[0];

      const override = installmentsOverride[String(k)] || { isPaid: false };
      const dueDate = override.dueDate || defaultDueDateStr;
      const isPaid = override.isPaid;
      const paidAt = override.paidAt;
      const iptu = override.iptu || 0;
      const condominio = override.condominio || 0;
      const reforms = override.reforms || 0;
      const extraPaid = override.extraPaid || 0;
      const notes = override.notes || '';

      const amortization = override.amortization !== undefined ? override.amortization : financedAmount;
      const interest = override.interest !== undefined ? override.interest : 0;
      const insurance = override.insurance !== undefined ? override.insurance : 0;
      const outstandingBefore = outstandingPrincipal;

      const totalAmortizedThisMonth = amortization + extraPaid;
      const outstandingAfter = Math.max(0, outstandingPrincipal - totalAmortizedThisMonth);

      const totalValueForThisInstallment = amortization + interest + insurance + iptu + condominio + reforms + extraPaid;

      list.push({
        number: k,
        dueDate,
        amortization: parseFloat(amortization.toFixed(2)),
        interest,
        insurance,
        constructionFee: 0,
        iptu: parseFloat(iptu.toFixed(2)),
        condominio: parseFloat(condominio.toFixed(2)),
        reforms: parseFloat(reforms.toFixed(2)),
        extraPaid: parseFloat(extraPaid.toFixed(2)),
        totalValue: parseFloat(totalValueForThisInstallment.toFixed(2)),
        outstandingBefore: parseFloat(outstandingBefore.toFixed(2)),
        outstandingAfter: parseFloat(outstandingAfter.toFixed(2)),
        isPaid,
        paidAt,
        isObra: false,
        notes: notes || customDescription
      });

      outstandingPrincipal = outstandingAfter;
    }
  } else if (contractType === 'other_fees') {
    const installmentsNum = totalInstallments || 1;
    const monthlyFee = installmentsNum > 0 ? (financedAmount / installmentsNum) : 0;
    let outstandingPrincipal = financedAmount;

    for (let k = 1; k <= installmentsNum; k++) {
      const currentDate = new Date(baseDate.getTime());
      currentDate.setMonth(currentDate.getMonth() + (k - 1));
      const defaultDueDateStr = currentDate.toISOString().split('T')[0];

      const override = installmentsOverride[String(k)] || { isPaid: false };
      const dueDate = override.dueDate || defaultDueDateStr;
      const isPaid = override.isPaid;
      const paidAt = override.paidAt;
      const iptu = override.iptu || 0;
      const condominio = override.condominio || 0;
      const reforms = override.reforms || 0;
      const extraPaid = override.extraPaid || 0;
      const notes = override.notes || '';

      const amortization = override.amortization !== undefined ? override.amortization : monthlyFee;
      const interest = override.interest !== undefined ? override.interest : 0;
      const insurance = override.insurance !== undefined ? override.insurance : 0;
      const outstandingBefore = outstandingPrincipal;

      const totalAmortizedThisMonth = amortization + extraPaid;
      const outstandingAfter = Math.max(0, outstandingPrincipal - totalAmortizedThisMonth);

      const totalValueForThisInstallment = amortization + interest + insurance + iptu + condominio + reforms + extraPaid;

      list.push({
        number: k,
        dueDate,
        amortization: parseFloat(amortization.toFixed(2)),
        interest,
        insurance,
        constructionFee: 0,
        iptu: parseFloat(iptu.toFixed(2)),
        condominio: parseFloat(condominio.toFixed(2)),
        reforms: parseFloat(reforms.toFixed(2)),
        extraPaid: parseFloat(extraPaid.toFixed(2)),
        totalValue: parseFloat(totalValueForThisInstallment.toFixed(2)),
        outstandingBefore: parseFloat(outstandingBefore.toFixed(2)),
        outstandingAfter: parseFloat(outstandingAfter.toFixed(2)),
        isPaid,
        paidAt,
        isObra: false,
        notes: notes || customDescription
      });

      outstandingPrincipal = outstandingAfter;
    }
  }

  return list;
}

export function calculateContractStats(contract: FinancingContract, timeline: Array<any>) {
  const { totalValue = 0, financedAmount = 0, contractType = 'financing' } = contract;

  let totalAmortizedPaid = 0;
  let totalObraPaid = 0;
  let totalTaxesPaid = 0;
  let totalMaintenancePaid = 0;
  let totalInstallmentsPaidValue = 0;
  let paidCount = 0;

  let totalTimelineValue = 0;

  timeline.forEach(item => {
    totalTimelineValue += item.totalValue;
    if (item.isPaid) {
      paidCount++;
      totalInstallmentsPaidValue += item.totalValue;
      totalAmortizedPaid += item.amortization + item.extraPaid;
      totalTaxesPaid += item.interest + item.insurance;
      totalMaintenancePaid += item.iptu + item.condominio + item.reforms;
      if (item.isObra) {
        totalObraPaid += item.constructionFee > 0 ? item.constructionFee : (item.interest + item.insurance);
      }
    }
  });

  const isBankFinancing = contractType === 'financing';
  
  let effectiveTotalValue = 0;
  let initialEquity = 0;
  let totalPaid = 0;
  let outstandingDebt = 0;
  let ownershipPercent = 0;

  if (isBankFinancing) {
    effectiveTotalValue = totalValue > 0 ? totalValue : financedAmount;
    initialEquity = Math.max(0, effectiveTotalValue - financedAmount);
    totalPaid = initialEquity + totalInstallmentsPaidValue;
    outstandingDebt = Math.max(0, financedAmount - totalAmortizedPaid);
    ownershipPercent = effectiveTotalValue > 0
      ? Math.min(100, ((initialEquity + totalAmortizedPaid) / effectiveTotalValue) * 100)
      : 0;
  } else {
    // For construction, down_payment, other_installments, other_fees, other:
    effectiveTotalValue = totalTimelineValue > 0 ? totalTimelineValue : financedAmount;
    initialEquity = 0;
    totalPaid = totalInstallmentsPaidValue;
    outstandingDebt = Math.max(0, effectiveTotalValue - totalPaid);
    ownershipPercent = effectiveTotalValue > 0
      ? Math.min(100, (totalPaid / effectiveTotalValue) * 100)
      : 0;
  }

  return {
    ownershipPercent,
    totalPaid,
    totalInstallmentsPaidValue,
    initialEquity,
    effectiveTotalValue,
    outstandingDebt,
    totalAmortizedPaid,
    totalObraPaid,
    totalTaxesPaid,
    totalMaintenancePaid,
    paidCount,
    totalInstallmentsCount: timeline.length
  };
}

interface FinanciamentoTabProps {
  userId: string;
  currentMonth: string;
  customConfirm: (title: string, message: string) => Promise<boolean>;
  hideValues?: boolean;
}

export default function FinanciamentoTab({ userId, currentMonth, customConfirm, hideValues = false }: FinanciamentoTabProps) {
  // Financing contracts list loaded from firestore
  const [contracts, setContracts] = useState<FinancingContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<FinancingContract | null>(null);
  const [modalStep, setModalStep] = useState<'choose_type' | 'fill_form'>('choose_type');
  
  // Property grouping states
  const [selectedPropertyChoice, setSelectedPropertyChoice] = useState<'existing' | 'new'>('existing');
  const [existingPropertySelect, setExistingPropertySelect] = useState('');
  const [newPropertyNameInput, setNewPropertyNameInput] = useState('');
  const [totalPropertyValueInput, setTotalPropertyValueInput] = useState('');

  // Form fields (General)
  const [propertyName, setPropertyName] = useState('');
  const [contractType, setContractType] = useState<'financing' | 'down_payment' | 'construction' | 'other' | 'other_installments' | 'other_fees'>('financing');
  const [totalValue, setTotalValue] = useState('');
  const [financedAmount, setFinancedAmount] = useState('');
  const [totalInstallments, setTotalInstallments] = useState('360');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [amortizationSystem, setAmortizationSystem] = useState<'SAC' | 'PRICE'>('SAC');
  const [interestRateAnnum, setInterestRateAnnum] = useState('9.5');
  const [monthlyInsurance, setMonthlyInsurance] = useState('75');
  const [hasKeysHandover, setHasKeysHandover] = useState(false);
  const [keysHandoverDate, setKeysHandoverDate] = useState('');

  // 1. Fase de Obra state
  const [constructionMonthlyFee, setConstructionMonthlyFee] = useState('1500');
  const [constructionMonths, setConstructionMonths] = useState('24');
  const [constructionStartDate, setConstructionStartDate] = useState(() => new Date().toISOString().split('T')[0]);

  // 2. Down Payment (Entrada) state
  const [downPaymentValue, setDownPaymentValue] = useState('50000');
  const [downPaymentMode, setDownPaymentMode] = useState<'cash' | 'installments'>('cash');
  const [downPaymentMonths, setDownPaymentMonths] = useState('12');
  const [downPaymentStartDate, setDownPaymentStartDate] = useState(() => new Date().toISOString().split('T')[0]);

  // 3. Balloon / Intercalares (Outras Parcelas) state
  const [balloonDescription, setBalloonDescription] = useState('Parcela das Chaves');
  const [balloonValue, setBalloonValue] = useState('20000');
  const [balloonDate, setBalloonDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [balloonIsRecurring, setBalloonIsRecurring] = useState(false);
  const [balloonFrequency, setBalloonFrequency] = useState<'semiannual' | 'annual'>('semiannual');
  const [balloonCount, setBalloonCount] = useState('4');

  // 4. Outras Taxas state
  const [feeDescription, setFeeDescription] = useState('ITBI');
  const [feeValue, setFeeValue] = useState('12000');
  const [feeDate, setFeeDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [feeInstallments, setFeeInstallments] = useState('1');

  // Timeline / Installments state
  const [timelinePage, setTimelinePage] = useState(0);
  const [timelineStatusFilter, setTimelineStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [timelineYearFilter, setTimelineYearFilter] = useState<string>('all');
  const [goToInstallmentNumber, setGoToInstallmentNumber] = useState('');

  // Quick custom input state for an installment override
  const [overrideInstallmentNum, setOverrideInstallmentNum] = useState<number | null>(null);
  const [overrideAmortization, setOverrideAmortization] = useState('');
  const [overrideInterest, setOverrideInterest] = useState('');
  const [overrideInsurance, setOverrideInsurance] = useState('');
  const [overrideConstructionFee, setOverrideConstructionFee] = useState('');
  const [overrideIptu, setOverrideIptu] = useState('');
  const [overrideCondominio, setOverrideCondominio] = useState('');
  const [overrideReforms, setOverrideReforms] = useState('');
  const [overrideExtraPaid, setOverrideExtraPaid] = useState('');
  const [overrideNotes, setOverrideNotes] = useState('');
  const [overrideIsPaid, setOverrideIsPaid] = useState(false);
  const [propagateFutureChanges, setPropagateFutureChanges] = useState(false);

  // Selected installments for multi-selection sum
  const [selectedInstallmentNumbers, setSelectedInstallmentNumbers] = useState<number[]>([]);

  // Overrides configured for the current contract form (pre-saved state)
  const [formInstallmentsOverride, setFormInstallmentsOverride] = useState<{[num: string]: any}>({});

  // Copy-paste import feature states
  const [showImportArea, setShowImportArea] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<{ success: boolean; count?: number; error?: string } | null>(null);

  // Direct paste import feature states for active contract
  const [showDirectImportArea, setShowDirectImportArea] = useState(false);
  const [directImportText, setDirectImportText] = useState('');
  const [directImportResult, setDirectImportResult] = useState<{ success: boolean; count?: number; error?: string } | null>(null);

  // 1. Load contracts from Firestore in real-time
  useEffect(() => {
    if (!userId) return;

    const q = query(
      collection(db, 'financing_contracts'),
      where('userId', '==', userId)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }) as FinancingContract);
      setContracts(list);
      setLoading(false);
      
      // Auto select first contract if none is selected
      if (list.length > 0 && !selectedContractId) {
        setSelectedContractId('all');
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'financing_contracts');
      setLoading(false);
    });

    return unsub;
  }, [userId, selectedContractId]);

  // Existing property names for dropdown groupings
  const existingPropertyNames = useMemo(() => {
    return Array.from(new Set(contracts.map(c => c.propertyName))).filter(Boolean);
  }, [contracts]);

  // Current active contract
  const activeContract = useMemo(() => {
    return contracts.find(c => c.id === selectedContractId) || null;
  }, [contracts, selectedContractId]);

  // Open Form for Adding
  const handleOpenAddForm = () => {
    setEditingContract(null);
    setModalStep('choose_type');
    setContractType('financing');
    setFormInstallmentsOverride({});
    setShowImportArea(false);
    setImportText('');
    setImportResult(null);

    if (existingPropertyNames.length > 0) {
      setSelectedPropertyChoice('existing');
      setExistingPropertySelect(existingPropertyNames[0]);
    } else {
      setSelectedPropertyChoice('new');
      setExistingPropertySelect('');
    }
    setNewPropertyNameInput('');
    setTotalPropertyValueInput('');

    setPropertyName('');
    setTotalValue('');
    setFinancedAmount('');
    setTotalInstallments('360');
    setStartDate(new Date().toISOString().split('T')[0]);
    setAmortizationSystem('SAC');
    setInterestRateAnnum('9.5');
    setMonthlyInsurance('75');
    setHasKeysHandover(false);
    setKeysHandoverDate('');

    setConstructionMonthlyFee('1500');
    setConstructionMonths('24');
    setConstructionStartDate(new Date().toISOString().split('T')[0]);

    setDownPaymentValue('50000');
    setDownPaymentMode('cash');
    setDownPaymentMonths('12');
    setDownPaymentStartDate(new Date().toISOString().split('T')[0]);

    setBalloonDescription('Parcela das Chaves');
    setBalloonValue('20000');
    setBalloonDate(new Date().toISOString().split('T')[0]);
    setBalloonIsRecurring(false);
    setBalloonFrequency('semiannual');
    setBalloonCount('4');

    setFeeDescription('ITBI');
    setFeeValue('12000');
    setFeeDate(new Date().toISOString().split('T')[0]);
    setFeeInstallments('1');

    setIsFormOpen(true);
  };

  // Import automatic contract data for Carlos Edgar (IDEAL PORTO BURITI)
  const handleImportCarlosEdgarData = async () => {
    if (!userId) return;

    const confirmed = await customConfirm(
      "Importação de Contrato",
      "Deseja importar automaticamente todas as informações financeiras reais da sua unidade no IDEAL PORTO BURITI? Isso configurará os 5 componentes do contrato de forma isolada."
    );
    if (!confirmed) return;

    try {
      // Find existing contracts for "IDEAL PORTO BURITI" to clean them up
      const existingContracts = contracts.filter(c => c.propertyName === 'IDEAL PORTO BURITI');
      if (existingContracts.length > 0) {
        const clearConfirmed = await customConfirm(
          "Limpar Dados Existentes",
          `Foram encontrados ${existingContracts.length} componentes para o "IDEAL PORTO BURITI". Deseja excluí-los para evitar duplicidade de parcelas antes de importar?`
        );
        if (clearConfirmed) {
          for (const c of existingContracts) {
            await deleteDoc(doc(db, 'financing_contracts', c.id));
          }
        }
      }

      const nowIso = new Date().toISOString();
      const contractsToCreate = [
        // 1. Financiamento Bancário (CAIXA)
        {
          propertyName: "IDEAL PORTO BURITI",
          contractType: "financing" as const,
          totalValue: 227930.00,
          financedAmount: 148693.50,
          totalInstallments: 420,
          startDate: "2028-09-18",
          amortizationSystem: "PRICE" as const,
          interestRateAnnum: 4.75,
          monthlyInsurance: 25.82,
          hasKeysHandover: true,
          keysHandoverDate: "2028-08-18",
          userId,
          createdAt: nowIso,
          updatedAt: nowIso
        },
        // 2. Sinal da Entrada (Morar Mais)
        {
          propertyName: "IDEAL PORTO BURITI",
          contractType: "down_payment" as const,
          totalValue: 227930.00,
          financedAmount: 2400.08,
          totalInstallments: 5,
          startDate: "2025-07-18",
          amortizationSystem: "SAC" as const,
          interestRateAnnum: 0,
          monthlyInsurance: 0,
          hasKeysHandover: false,
          paymentType: "installments" as const,
          customDescription: "Sinal da Entrada",
          userId,
          createdAt: nowIso,
          updatedAt: nowIso
        },
        // 3. Parcelas Mensais Construtora (59 parcelas de R$ 1.111,38)
        {
          propertyName: "IDEAL PORTO BURITI",
          contractType: "down_payment" as const,
          totalValue: 227930.00,
          financedAmount: 65571.42,
          totalInstallments: 59,
          startDate: "2025-12-15",
          amortizationSystem: "SAC" as const,
          interestRateAnnum: 0,
          monthlyInsurance: 0,
          hasKeysHandover: false,
          paymentType: "installments" as const,
          customDescription: "Mensais Construtora",
          userId,
          createdAt: nowIso,
          updatedAt: nowIso
        },
        // 4. Parcelas Semestrais Construtora (4 parcelas de R$ 1.700,00)
        {
          propertyName: "IDEAL PORTO BURITI",
          contractType: "other_installments" as const,
          totalValue: 227930.00,
          financedAmount: 1700.00,
          totalInstallments: 4,
          startDate: "2025-12-15",
          amortizationSystem: "SAC" as const,
          interestRateAnnum: 0,
          monthlyInsurance: 0,
          hasKeysHandover: false,
          isRecurring: true,
          recurrenceFrequency: "semiannual" as const,
          recurrenceCount: 4,
          customDescription: "Semestrais Construtora",
          userId,
          createdAt: nowIso,
          updatedAt: nowIso
        },
        // 5. Subsídio MCMV
        {
          propertyName: "IDEAL PORTO BURITI",
          contractType: "down_payment" as const,
          totalValue: 227930.00,
          financedAmount: 4465.00,
          totalInstallments: 1,
          startDate: "2025-07-18",
          amortizationSystem: "SAC" as const,
          interestRateAnnum: 0,
          monthlyInsurance: 0,
          hasKeysHandover: false,
          paymentType: "cash" as const,
          customDescription: "Subsídio MCMV",
          userId,
          createdAt: nowIso,
          updatedAt: nowIso
        }
      ];

      for (const contract of contractsToCreate) {
        const newDocRef = doc(collection(db, 'financing_contracts'));
        await setDoc(newDocRef, contract);
      }

      setSelectedContractId('all');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'financing_contracts/import');
    }
  };

  // Open Form for Editing
  const handleOpenEditForm = (contract: FinancingContract) => {
    setEditingContract(contract);
    setModalStep('fill_form');
    setContractType(contract.contractType || 'financing');
    setFormInstallmentsOverride(contract.installmentsOverride || {});
    setShowImportArea(false);
    setImportText('');
    setImportResult(null);

    setSelectedPropertyChoice('existing');
    setExistingPropertySelect(contract.propertyName);
    setPropertyName(contract.propertyName);
    setTotalValue(String(contract.totalValue));

    if (contract.contractType === 'financing') {
      setFinancedAmount(String(contract.financedAmount));
      setTotalInstallments(String(contract.totalInstallments));
      setStartDate(contract.startDate);
      setAmortizationSystem(contract.amortizationSystem || 'SAC');
      setInterestRateAnnum(String(contract.interestRateAnnum));
      setMonthlyInsurance(String(contract.monthlyInsurance));
      setHasKeysHandover(contract.hasKeysHandover || false);
      setKeysHandoverDate(contract.keysHandoverDate || '');
    } else if (contract.contractType === 'construction') {
      const estimatedMonthlyFee = contract.totalInstallments > 0 ? (contract.financedAmount / contract.totalInstallments) : 0;
      setConstructionMonthlyFee(String(estimatedMonthlyFee));
      setConstructionMonths(String(contract.totalInstallments));
      setConstructionStartDate(contract.startDate);
    } else if (contract.contractType === 'down_payment') {
      setDownPaymentValue(String(contract.financedAmount));
      setDownPaymentMode(contract.paymentType || 'cash');
      setDownPaymentMonths(String(contract.totalInstallments || 12));
      setDownPaymentStartDate(contract.startDate);
    } else if (contract.contractType === 'other_installments') {
      setBalloonDescription(contract.customDescription || '');
      setBalloonValue(String(contract.financedAmount));
      setBalloonDate(contract.startDate);
      setBalloonIsRecurring(contract.isRecurring || false);
      setBalloonFrequency((contract.recurrenceFrequency as any) || 'semiannual');
      setBalloonCount(String(contract.recurrenceCount || 4));
    } else if (contract.contractType === 'other_fees') {
      setFeeDescription(contract.customDescription || '');
      setFeeValue(String(contract.financedAmount));
      setFeeDate(contract.startDate);
      setFeeInstallments(String(contract.totalInstallments || 1));
    }

    setIsFormOpen(true);
  };

  const getFormContractTimeline = () => {
    let finalPropertyName = '';
    let finalTotalPropertyValue = 0;

    if (selectedPropertyChoice === 'existing') {
      finalPropertyName = existingPropertySelect;
      const existingOfSame = contracts.find(c => c.propertyName === existingPropertySelect);
      if (existingOfSame) {
        finalTotalPropertyValue = existingOfSame.totalValue;
      }
    } else {
      finalPropertyName = newPropertyNameInput.trim();
      finalTotalPropertyValue = parseFloat(totalPropertyValueInput) || 0;
    }

    const tempContract: any = {
      propertyName: finalPropertyName,
      contractType,
      totalValue: finalTotalPropertyValue,
      financedAmount: 0,
      totalInstallments: 1,
      startDate: new Date().toISOString().split('T')[0],
      amortizationSystem: 'SAC',
      interestRateAnnum: 0,
      monthlyInsurance: 0,
      hasKeysHandover: false,
      installmentsOverride: formInstallmentsOverride
    };

    if (contractType === 'financing') {
      tempContract.financedAmount = parseFloat(financedAmount) || 0;
      tempContract.totalInstallments = parseInt(totalInstallments) || 360;
      tempContract.startDate = startDate;
      tempContract.amortizationSystem = amortizationSystem;
      tempContract.interestRateAnnum = parseFloat(interestRateAnnum) || 0;
      tempContract.monthlyInsurance = parseFloat(monthlyInsurance) || 0;
      tempContract.hasKeysHandover = hasKeysHandover;
      tempContract.keysHandoverDate = hasKeysHandover ? keysHandoverDate : undefined;
    } else if (contractType === 'construction') {
      const hasOverrides = Object.keys(formInstallmentsOverride).length > 0;
      let finalMonths = parseInt(constructionMonths) || 1;
      let finalFinancedAmount = 0;

      if (hasOverrides) {
        const overrideKeys = Object.keys(formInstallmentsOverride).map(Number);
        const maxOverrideNum = overrideKeys.length > 0 ? Math.max(...overrideKeys) : 1;
        finalMonths = Math.max(finalMonths, maxOverrideNum);

        let sumOfFees = 0;
        for (let k = 1; k <= finalMonths; k++) {
          const override = formInstallmentsOverride[String(k)];
          if (override && override.constructionFee !== undefined) {
            sumOfFees += override.constructionFee;
          } else {
            sumOfFees += parseFloat(constructionMonthlyFee) || 0;
          }
        }
        finalFinancedAmount = sumOfFees;
      } else {
        const monthly = parseFloat(constructionMonthlyFee) || 0;
        finalFinancedAmount = monthly * finalMonths;
      }

      tempContract.financedAmount = finalFinancedAmount;
      tempContract.totalInstallments = finalMonths;
      tempContract.startDate = constructionStartDate;
    } else if (contractType === 'down_payment') {
      const value = parseFloat(downPaymentValue) || 0;
      tempContract.financedAmount = value;
      tempContract.paymentType = downPaymentMode;
      tempContract.totalInstallments = downPaymentMode === 'cash' ? 1 : (parseInt(downPaymentMonths) || 12);
      tempContract.startDate = downPaymentStartDate;
    } else if (contractType === 'other_installments') {
      const value = parseFloat(balloonValue) || 0;
      const count = balloonIsRecurring ? (parseInt(balloonCount) || 4) : 1;
      tempContract.financedAmount = value;
      tempContract.isRecurring = balloonIsRecurring;
      tempContract.recurrenceFrequency = balloonIsRecurring ? balloonFrequency : undefined;
      tempContract.recurrenceCount = count;
      tempContract.totalInstallments = count;
      tempContract.startDate = balloonDate;
      tempContract.customDescription = balloonDescription;
    } else if (contractType === 'other_fees') {
      const value = parseFloat(feeValue) || 0;
      const installments = parseInt(feeInstallments) || 1;
      tempContract.financedAmount = value;
      tempContract.totalInstallments = installments;
      tempContract.startDate = feeDate;
      tempContract.customDescription = feeDescription;
    }

    try {
      return calculateContractTimeline(tempContract);
    } catch (e) {
      return [];
    }
  };

  const handlePasteImport = (text: string) => {
    if (!text.trim()) {
      setImportResult({ success: false, error: 'Por favor, cole algum texto antes de tentar importar.' });
      return;
    }

    const lines = text.split('\n');
    const newOverrides = { ...formInstallmentsOverride };
    let successCount = 0;
    let maxInstallmentNum = 0;
    let firstInstallmentDate = '';

    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // Extract installment number: e.g. "1 / 36" or starting with "1"
      let installmentNumber = null;
      const installmentMatch = cleanLine.match(/^(\d+)\s*(?:\/\s*\d+)?/);
      if (installmentMatch) {
        installmentNumber = parseInt(installmentMatch[1]);
      } else {
        const genericMatch = cleanLine.match(/\b(\d+)\b/);
        if (genericMatch) {
          installmentNumber = parseInt(genericMatch[1]);
        }
      }

      if (!installmentNumber || isNaN(installmentNumber)) return;

      // Extract Date: e.g. "16/09/2025"
      let dueDateStr = undefined;
      const dateMatch = cleanLine.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (dateMatch) {
        const [_, day, month, year] = dateMatch;
        dueDateStr = `${year}-${month}-${day}`;
      } else {
        const dateIsoMatch = cleanLine.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
        if (dateIsoMatch) {
          dueDateStr = dateIsoMatch[0].replace(/\//g, '-');
        }
      }

      // Extract Status: "LIQUIDADO" or "PAGO" vs "PENDENTE"
      const normalizedLine = cleanLine.toUpperCase();
      const isPaid = normalizedLine.includes('LIQUIDADO') || 
                     normalizedLine.includes('LIQUIDADA') || 
                     normalizedLine.includes('PAGO') || 
                     normalizedLine.includes('PAGA');

      // Extract Value: R$ 86,98 or similar
      let parsedValue = undefined;
      const moneyMatches = cleanLine.match(/(?:R\$)?\s*([0-9\.\s]+,\d{2})/) || cleanLine.match(/(?:R\$)?\s*([0-9,\s]+\.\d{2})/);
      if (moneyMatches) {
        const moneyStr = moneyMatches[1].replace(/\s/g, '');
        if (moneyStr.includes(',')) {
          parsedValue = parseFloat(moneyStr.replace(/\./g, '').replace(',', '.'));
        } else {
          parsedValue = parseFloat(moneyStr.replace(/,/g, ''));
        }
      } else {
        const fallbackMatches = cleanLine.match(/(\d+[\.,]\d{2})/);
        if (fallbackMatches) {
          const moneyStr = fallbackMatches[1];
          if (moneyStr.includes(',')) {
            parsedValue = parseFloat(moneyStr.replace(/\./g, '').replace(',', '.'));
          } else {
            parsedValue = parseFloat(moneyStr);
          }
        } else {
          const floatMatch = cleanLine.match(/(\d+(?:\.\d+)?)$/);
          if (floatMatch) {
            parsedValue = parseFloat(floatMatch[1]);
          }
        }
      }

      if (installmentNumber > 0) {
        const key = String(installmentNumber);
        const currentOverride = newOverrides[key] || {};
        
        const updatedOverride: any = {
          ...currentOverride,
          isPaid,
          paidAt: isPaid ? (dueDateStr || currentOverride.paidAt || new Date().toISOString().split('T')[0]) : undefined
        };

        if (dueDateStr) {
          updatedOverride.dueDate = dueDateStr;
          if (installmentNumber === 1) {
            firstInstallmentDate = dueDateStr;
          }
        }

        if (parsedValue !== undefined && !isNaN(parsedValue)) {
          if (contractType === 'construction') {
            updatedOverride.constructionFee = parsedValue;
          } else if (contractType === 'financing') {
            updatedOverride.constructionFee = parsedValue;
            updatedOverride.amortization = parsedValue;
            updatedOverride.interest = 0;
            updatedOverride.insurance = 0;
          } else {
            updatedOverride.amortization = parsedValue;
          }
        }

        newOverrides[key] = updatedOverride;
        successCount++;
        if (installmentNumber > maxInstallmentNum) {
          maxInstallmentNum = installmentNumber;
        }
      }
    });

    if (successCount > 0) {
      setFormInstallmentsOverride(newOverrides);
      setImportResult({ success: true, count: successCount });
      setImportText('');

      if (maxInstallmentNum > 0) {
        if (contractType === 'construction') {
          setConstructionMonths(String(maxInstallmentNum));
          if (firstInstallmentDate) {
            setConstructionStartDate(firstInstallmentDate);
          }
          setConstructionMonthlyFee('');
        } else if (contractType === 'financing') {
          setTotalInstallments(String(maxInstallmentNum));
          if (firstInstallmentDate) {
            setStartDate(firstInstallmentDate);
          }
        }
      }
    } else {
      setImportResult({ success: false, error: 'Não foi possível identificar nenhuma parcela válida no texto colado. Verifique o formato e tente novamente.' });
    }
  };

  const handleDirectPasteImport = async (text: string) => {
    if (!activeContract) return;
    if (!text.trim()) {
      setDirectImportResult({ success: false, error: 'Por favor, cole algum texto antes de tentar importar.' });
      return;
    }

    const lines = text.split('\n');
    const newOverrides = { ...(activeContract.installmentsOverride || {}) };
    let successCount = 0;

    lines.forEach(line => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      // Extract installment number: e.g. "1 / 36" or starting with "1"
      let installmentNumber = null;
      const installmentMatch = cleanLine.match(/^(\d+)\s*(?:\/\s*\d+)?/);
      if (installmentMatch) {
        installmentNumber = parseInt(installmentMatch[1]);
      } else {
        const genericMatch = cleanLine.match(/\b(\d+)\b/);
        if (genericMatch) {
          installmentNumber = parseInt(genericMatch[1]);
        }
      }

      if (!installmentNumber || isNaN(installmentNumber)) return;

      // Extract Date: e.g. "16/09/2025"
      let dueDateStr = undefined;
      const dateMatch = cleanLine.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
      if (dateMatch) {
        const [_, day, month, year] = dateMatch;
        dueDateStr = `${year}-${month}-${day}`;
      } else {
        const dateIsoMatch = cleanLine.match(/(\d{4})[\/\-](\d{2})[\/\-](\d{2})/);
        if (dateIsoMatch) {
          dueDateStr = dateIsoMatch[0].replace(/\//g, '-');
        }
      }

      // Extract Status: "LIQUIDADO" or "PAGO" vs "PENDENTE"
      const normalizedLine = cleanLine.toUpperCase();
      const isPaid = normalizedLine.includes('LIQUIDADO') || 
                     normalizedLine.includes('LIQUIDADA') || 
                     normalizedLine.includes('PAGO') || 
                     normalizedLine.includes('PAGA');

      // Extract Value: R$ 86,98 or similar
      let parsedValue = undefined;
      const moneyMatches = cleanLine.match(/(?:R\$)?\s*([0-9\.\s]+,\d{2})/) || cleanLine.match(/(?:R\$)?\s*([0-9,\s]+\.\d{2})/);
      if (moneyMatches) {
        const moneyStr = moneyMatches[1].replace(/\s/g, '');
        if (moneyStr.includes(',')) {
          parsedValue = parseFloat(moneyStr.replace(/\./g, '').replace(',', '.'));
        } else {
          parsedValue = parseFloat(moneyStr.replace(/,/g, ''));
        }
      } else {
        const fallbackMatches = cleanLine.match(/(\d+[\.,]\d{2})/);
        if (fallbackMatches) {
          const moneyStr = fallbackMatches[1];
          if (moneyStr.includes(',')) {
            parsedValue = parseFloat(moneyStr.replace(/\./g, '').replace(',', '.'));
          } else {
            parsedValue = parseFloat(moneyStr);
          }
        } else {
          const floatMatch = cleanLine.match(/(\d+(?:\.\d+)?)$/);
          if (floatMatch) {
            parsedValue = parseFloat(floatMatch[1]);
          }
        }
      }

      if (installmentNumber > 0) {
        const key = String(installmentNumber);
        const currentOverride = newOverrides[key] || {};
        
        const updatedOverride: any = {
          ...currentOverride,
          isPaid,
          paidAt: isPaid ? (dueDateStr || currentOverride.paidAt || new Date().toISOString().split('T')[0]) : undefined
        };

        if (dueDateStr) {
          updatedOverride.dueDate = dueDateStr;
        }

        if (parsedValue !== undefined && !isNaN(parsedValue)) {
          const contractType = activeContract.contractType || 'financing';
          if (contractType === 'construction') {
            updatedOverride.constructionFee = parsedValue;
          } else if (contractType === 'financing') {
            updatedOverride.constructionFee = parsedValue;
            updatedOverride.amortization = parsedValue;
            updatedOverride.interest = 0;
            updatedOverride.insurance = 0;
          } else {
            updatedOverride.amortization = parsedValue;
          }
        }

        newOverrides[key] = updatedOverride;
        successCount++;
      }
    });

    if (successCount > 0) {
      try {
        const docRef = doc(db, 'financing_contracts', activeContract.id);
        await updateDoc(docRef, {
          installmentsOverride: newOverrides,
          updatedAt: new Date().toISOString()
        });
        setDirectImportResult({ success: true, count: successCount });
        setDirectImportText('');
      } catch (err) {
        setDirectImportResult({ success: false, error: 'Erro ao salvar no banco de dados: ' + String(err) });
      }
    } else {
      setDirectImportResult({ success: false, error: 'Não foi possível identificar nenhuma parcela válida no texto colado. Verifique o formato e tente novamente.' });
    }
  };

  // Save Contract Mutation
  const handleSaveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    try {
      let finalPropertyName = '';
      let finalTotalPropertyValue = 0;

      if (selectedPropertyChoice === 'existing') {
        finalPropertyName = existingPropertySelect;
        const existingOfSame = contracts.find(c => c.propertyName === existingPropertySelect);
        if (existingOfSame) {
          finalTotalPropertyValue = existingOfSame.totalValue;
        }
      } else {
        finalPropertyName = newPropertyNameInput.trim();
        finalTotalPropertyValue = parseFloat(totalPropertyValueInput) || 0;
      }

      if (!finalPropertyName) {
        alert('Por favor, indique ou cadastre um Imóvel/Financiamento.');
        return;
      }

      let payload: Omit<FinancingContract, 'id' | 'createdAt' | 'updatedAt'> = {
        userId,
        propertyName: finalPropertyName,
        contractType,
        totalValue: finalTotalPropertyValue,
        financedAmount: 0,
        totalInstallments: 1,
        startDate: new Date().toISOString().split('T')[0],
        amortizationSystem: 'SAC',
        interestRateAnnum: 0,
        monthlyInsurance: 0,
        hasKeysHandover: false,
      };

      if (contractType === 'financing') {
        payload.financedAmount = parseFloat(financedAmount) || 0;
        payload.totalInstallments = parseInt(totalInstallments) || 360;
        payload.startDate = startDate;
        payload.amortizationSystem = amortizationSystem;
        payload.interestRateAnnum = parseFloat(interestRateAnnum) || 0;
        payload.monthlyInsurance = parseFloat(monthlyInsurance) || 0;
        payload.hasKeysHandover = hasKeysHandover;
        payload.keysHandoverDate = hasKeysHandover ? keysHandoverDate : undefined;
      } else if (contractType === 'construction') {
        const hasOverrides = Object.keys(formInstallmentsOverride).length > 0;
        let finalMonths = parseInt(constructionMonths) || 1;
        let finalFinancedAmount = 0;

        if (hasOverrides) {
          const overrideKeys = Object.keys(formInstallmentsOverride).map(Number);
          const maxOverrideNum = overrideKeys.length > 0 ? Math.max(...overrideKeys) : 1;
          finalMonths = Math.max(finalMonths, maxOverrideNum);

          let sumOfFees = 0;
          for (let k = 1; k <= finalMonths; k++) {
            const override = formInstallmentsOverride[String(k)];
            if (override && override.constructionFee !== undefined) {
              sumOfFees += override.constructionFee;
            } else {
              sumOfFees += parseFloat(constructionMonthlyFee) || 0;
            }
          }
          finalFinancedAmount = sumOfFees;
        } else {
          const monthly = parseFloat(constructionMonthlyFee) || 0;
          finalFinancedAmount = monthly * finalMonths;
        }

        payload.financedAmount = finalFinancedAmount;
        payload.totalInstallments = finalMonths;
        payload.startDate = constructionStartDate;
        payload.amortizationSystem = 'SAC';
        payload.interestRateAnnum = 0;
        payload.monthlyInsurance = 0;
      } else if (contractType === 'down_payment') {
        const value = parseFloat(downPaymentValue) || 0;
        payload.financedAmount = value;
        payload.paymentType = downPaymentMode;
        payload.totalInstallments = downPaymentMode === 'cash' ? 1 : (parseInt(downPaymentMonths) || 12);
        payload.startDate = downPaymentStartDate;
        payload.amortizationSystem = 'SAC';
        payload.interestRateAnnum = 0;
        payload.monthlyInsurance = 0;
      } else if (contractType === 'other_installments') {
        const value = parseFloat(balloonValue) || 0;
        const count = balloonIsRecurring ? (parseInt(balloonCount) || 4) : 1;
        payload.financedAmount = value;
        payload.isRecurring = balloonIsRecurring;
        payload.recurrenceFrequency = balloonIsRecurring ? balloonFrequency : undefined;
        payload.recurrenceCount = count;
        payload.totalInstallments = count;
        payload.startDate = balloonDate;
        payload.customDescription = balloonDescription;
        payload.amortizationSystem = 'SAC';
        payload.interestRateAnnum = 0;
        payload.monthlyInsurance = 0;
      } else if (contractType === 'other_fees') {
        const value = parseFloat(feeValue) || 0;
        const installments = parseInt(feeInstallments) || 1;
        payload.financedAmount = value;
        payload.totalInstallments = installments;
        payload.startDate = feeDate;
        payload.customDescription = feeDescription;
        payload.amortizationSystem = 'SAC';
        payload.interestRateAnnum = 0;
        payload.monthlyInsurance = 0;
      }

      if (editingContract) {
        const docRef = doc(db, 'financing_contracts', editingContract.id);
        await updateDoc(docRef, cleanUndefined({
          ...payload,
          installmentsOverride: formInstallmentsOverride,
          updatedAt: new Date().toISOString()
        }));
      } else {
        const newId = doc(collection(db, 'financing_contracts')).id;
        await setDoc(doc(db, 'financing_contracts', newId), cleanUndefined({
          ...payload,
          installmentsOverride: formInstallmentsOverride,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
        setSelectedContractId(newId);
      }
      setIsFormOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'financing_contracts');
    }
  };

  // Delete Contract
  const handleDeleteContract = async (contract: FinancingContract) => {
    const confirmed = await customConfirm(
      "Excluir Componente de Financiamento",
      `Deseja realmente excluir o monitoramento de "${contract.propertyName}" (${getContractTypeName(contract.contractType)})? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'financing_contracts', contract.id));
      if (selectedContractId === contract.id) {
        setSelectedContractId('all');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `financing_contracts/${contract.id}`);
    }
  };

  // Helper helper to get type text
  function getContractTypeName(type?: string) {
    switch (type) {
      case 'financing': return 'Financiamento Bancário';
      case 'construction': return 'Fase de Obra';
      case 'down_payment': return 'Valor da Entrada';
      case 'other_installments': return 'Outras Parcelas / Intercalares';
      case 'other_fees': return 'Outras Taxas / Impostos';
      default: return 'Outros';
    }
  }

  // Compute timeline and stats for all contracts
  const contractsCalculated = useMemo(() => {
    const map: {
      [id: string]: {
        contract: FinancingContract;
        timeline: ReturnType<typeof calculateContractTimeline>;
        stats: ReturnType<typeof calculateContractStats>;
      }
    } = {};

    contracts.forEach(c => {
      const timeline = calculateContractTimeline(c);
      const stats = calculateContractStats(c, timeline);
      map[c.id] = {
        contract: c,
        timeline,
        stats
      };
    });

    return map;
  }, [contracts]);

  const consolidatedStats = useMemo(() => {
    let totalValue = 0;
    let financedAmount = 0;
    let totalPaid = 0;
    let outstandingDebt = 0;
    let totalAmortizedPaid = 0;
    let totalObraPaid = 0;
    let totalTaxesPaid = 0;
    let totalMaintenancePaid = 0;
    let paidCount = 0;
    let totalInstallmentsCount = 0;

    Object.values(contractsCalculated).forEach(({ contract, stats }) => {
      totalValue += stats.effectiveTotalValue || contract.totalValue || contract.financedAmount;
      financedAmount += contract.financedAmount;
      totalPaid += stats.totalPaid;
      outstandingDebt += stats.outstandingDebt;
      totalAmortizedPaid += stats.totalAmortizedPaid;
      totalObraPaid += stats.totalObraPaid;
      totalTaxesPaid += stats.totalTaxesPaid;
      totalMaintenancePaid += stats.totalMaintenancePaid;
      paidCount += stats.paidCount;
      totalInstallmentsCount += stats.totalInstallmentsCount;
    });

    const ownershipPercent = totalValue > 0
      ? Math.min(100, (totalPaid / totalValue) * 100)
      : 0;

    return {
      ownershipPercent,
      totalPaid,
      outstandingDebt,
      totalAmortizedPaid,
      totalObraPaid,
      totalTaxesPaid,
      totalMaintenancePaid,
      paidCount,
      totalInstallmentsCount,
      totalValue
    };
  }, [contractsCalculated]);

  const activeCalculation = useMemo(() => {
    if (!selectedContractId || selectedContractId === 'all') return null;
    return contractsCalculated[selectedContractId] || null;
  }, [contractsCalculated, selectedContractId]);

  const computedTimeline = useMemo(() => {
    return activeCalculation ? activeCalculation.timeline : [];
  }, [activeCalculation]);

  const activeInstallmentItem = useMemo(() => {
    if (overrideInstallmentNum === null) return null;
    return computedTimeline.find(it => it.number === overrideInstallmentNum) || null;
  }, [overrideInstallmentNum, computedTimeline]);

  const selectedTotals = useMemo(() => {
    let totalValue = 0;
    let amortization = 0;
    let interestAndInsurance = 0;
    let otherEncargos = 0;
    let extraPaid = 0;

    computedTimeline.forEach(item => {
      if (selectedInstallmentNumbers.includes(item.number)) {
        totalValue += item.totalValue;
        amortization += item.amortization;
        interestAndInsurance += item.interest + item.insurance;
        const charges = item.iptu + item.condominio + item.reforms + (item.isObra ? item.constructionFee : 0);
        otherEncargos += charges;
        extraPaid += item.extraPaid;
      }
    });

    return {
      totalValue,
      amortization,
      interestAndInsurance,
      otherEncargos,
      extraPaid,
      count: selectedInstallmentNumbers.length
    };
  }, [selectedInstallmentNumbers, computedTimeline]);

  const stats = useMemo(() => {
    return activeCalculation ? activeCalculation.stats : consolidatedStats;
  }, [activeCalculation, consolidatedStats]);

  // Handle Marking Installment Paid/Pending
  const handleToggleInstallmentPaid = async (installmentNumber: number, currentPaid: boolean) => {
    if (!activeContract) return;

    try {
      const docRef = doc(db, 'financing_contracts', activeContract.id);
      const overrides = { ...(activeContract.installmentsOverride || {}) };
      
      const currentOverride = overrides[String(installmentNumber)] || { isPaid: false };
      overrides[String(installmentNumber)] = {
        ...currentOverride,
        isPaid: !currentPaid,
        paidAt: !currentPaid ? new Date().toISOString().split('T')[0] : ""
      };

      await updateDoc(docRef, {
        installmentsOverride: overrides,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `financing_contracts/${activeContract.id}/installment/${installmentNumber}`);
    }
  };

  // Bulk toggle paid status for selected installments
  const handleBulkTogglePaid = async (targetPaid: boolean) => {
    if (!activeContract || selectedInstallmentNumbers.length === 0) return;

    const confirmed = await customConfirm(
      "Alterar Parcelas em Lote",
      `Deseja realmente marcar as ${selectedInstallmentNumbers.length} parcelas selecionadas como ${targetPaid ? "Pagas" : "Pendentes"}?`
    );
    if (!confirmed) return;

    try {
      const docRef = doc(db, 'financing_contracts', activeContract.id);
      const overrides = { ...(activeContract.installmentsOverride || {}) };

      selectedInstallmentNumbers.forEach(num => {
        const currentOverride = overrides[String(num)] || { isPaid: false };
        overrides[String(num)] = {
          ...currentOverride,
          isPaid: targetPaid,
          paidAt: targetPaid ? new Date().toISOString().split('T')[0] : ""
        };
      });

      await updateDoc(docRef, {
        installmentsOverride: overrides,
        updatedAt: new Date().toISOString()
      });

      // Clear selection after action
      setSelectedInstallmentNumbers([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `financing_contracts/${activeContract.id}/bulk`);
    }
  };

  // Handle Postponing an Installment by 30 days
  const handlePostponeInstallment = async (installmentNumber: number, currentDueDate: string) => {
    const confirmed = await customConfirm(
      "Adiar Vencimento",
      `Deseja adiar o vencimento desta parcela por 30 dias? Isso atualizará a data programada para planejamento.`
    );
    if (!confirmed) return;

    if (!activeContract) return;

    try {
      const docRef = doc(db, 'financing_contracts', activeContract.id);
      const overrides = { ...(activeContract.installmentsOverride || {}) };
      
      const currentOverride = overrides[String(installmentNumber)] || { isPaid: false };
      
      const dateObj = new Date(currentDueDate + 'T12:00:00');
      dateObj.setMonth(dateObj.getMonth() + 1);
      const postponedDateStr = dateObj.toISOString().split('T')[0];

      overrides[String(installmentNumber)] = {
        ...currentOverride,
        dueDate: postponedDateStr
      };

      await updateDoc(docRef, {
        installmentsOverride: overrides,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `financing_contracts/${activeContract.id}`);
    }
  };

  // Handle saving customized fields override
  const handleOpenOverrideModal = (num: number, item: any) => {
    setOverrideInstallmentNum(num);
    
    // Check if there is an explicit override for amortization/interest/insurance
    const hasOverride = activeContract?.installmentsOverride?.[String(num)];
    
    setOverrideAmortization(hasOverride?.amortization !== undefined ? String(hasOverride.amortization) : '');
    setOverrideInterest(hasOverride?.interest !== undefined ? String(hasOverride.interest) : '');
    setOverrideInsurance(hasOverride?.insurance !== undefined ? String(hasOverride.insurance) : '');
    setOverrideConstructionFee(hasOverride?.constructionFee !== undefined ? String(hasOverride.constructionFee) : '');
    
    setOverrideIptu(item.iptu > 0 ? String(item.iptu) : '');
    setOverrideCondominio(item.condominio > 0 ? String(item.condominio) : '');
    setOverrideReforms(item.reforms > 0 ? String(item.reforms) : '');
    setOverrideExtraPaid(item.extraPaid > 0 ? String(item.extraPaid) : '');
    setOverrideNotes(item.notes || '');
    setOverrideIsPaid(item.isPaid);
    setPropagateFutureChanges(false);
  };

  const handleSaveOverrideValues = async () => {
    if (overrideInstallmentNum === null) return;

    try {
      const constructionFeeVal = overrideConstructionFee !== '' ? parseFloat(overrideConstructionFee) : undefined;
      const iptuVal = overrideIptu !== '' ? parseFloat(overrideIptu) : 0;
      const condominioVal = overrideCondominio !== '' ? parseFloat(overrideCondominio) : 0;
      const reformsVal = overrideReforms !== '' ? parseFloat(overrideReforms) : 0;
      const extraPaidVal = overrideExtraPaid !== '' ? parseFloat(overrideExtraPaid) : 0;
      const notesVal = overrideNotes;
      const isPaidVal = overrideIsPaid;
      
      const amortizationVal = overrideAmortization !== '' ? parseFloat(overrideAmortization) : undefined;
      const interestVal = overrideInterest !== '' ? parseFloat(overrideInterest) : undefined;
      const insuranceVal = overrideInsurance !== '' ? parseFloat(overrideInsurance) : undefined;

      // Decide which timeline to use to determine total installments
      const currentTimeline = isFormOpen ? getFormContractTimeline() : computedTimeline;
      const maxInstallmentNum = currentTimeline.length;

      // Base overrides are either local form overrides or existing contract overrides
      const baseOverrides = isFormOpen ? { ...formInstallmentsOverride } : { ...(activeContract?.installmentsOverride || {}) };

      if (propagateFutureChanges) {
        // Propagate to all future installments from overrideInstallmentNum onwards
        for (let num = overrideInstallmentNum; num <= maxInstallmentNum; num++) {
          const currentOverride = baseOverrides[String(num)] || { isPaid: false };
          baseOverrides[String(num)] = {
            ...currentOverride,
            isPaid: isPaidVal,
            paidAt: isPaidVal ? (currentOverride.paidAt || new Date().toISOString().split('T')[0]) : "",
            ...(amortizationVal !== undefined ? { amortization: amortizationVal } : {}),
            ...(interestVal !== undefined ? { interest: interestVal } : {}),
            ...(insuranceVal !== undefined ? { insurance: insuranceVal } : {}),
            ...(constructionFeeVal !== undefined ? { constructionFee: constructionFeeVal } : {}),
            iptu: iptuVal,
            condominio: condominioVal,
            reforms: reformsVal,
            notes: notesVal
          };
        }
      } else {
        // Just save for this individual installment
        const currentOverride = baseOverrides[String(overrideInstallmentNum)] || { isPaid: false };
        baseOverrides[String(overrideInstallmentNum)] = {
          ...currentOverride,
          isPaid: isPaidVal,
          paidAt: isPaidVal ? (currentOverride.paidAt || new Date().toISOString().split('T')[0]) : "",
          amortization: amortizationVal,
          interest: interestVal,
          insurance: insuranceVal,
          constructionFee: constructionFeeVal,
          iptu: iptuVal,
          condominio: condominioVal,
          reforms: reformsVal,
          extraPaid: extraPaidVal,
          notes: notesVal
        };
      }

      // Clean undefined/null keys to keep Firestore or state neat
      const cleanedOverrides: { [key: string]: any } = {};
      Object.entries(baseOverrides).forEach(([key, val]: [string, any]) => {
        const cleanedVal: any = {};
        if (val.isPaid !== undefined) cleanedVal.isPaid = val.isPaid;
        if (val.paidAt) cleanedVal.paidAt = val.paidAt;
        if (val.dueDate) cleanedVal.dueDate = val.dueDate;
        if (val.constructionFee !== undefined && val.constructionFee !== null) cleanedVal.constructionFee = val.constructionFee;
        if (val.iptu !== undefined && val.iptu !== null) cleanedVal.iptu = val.iptu;
        if (val.condominio !== undefined && val.condominio !== null) cleanedVal.condominio = val.condominio;
        if (val.reforms !== undefined && val.reforms !== null) cleanedVal.reforms = val.reforms;
        if (val.extraPaid !== undefined && val.extraPaid !== null) cleanedVal.extraPaid = val.extraPaid;
        if (val.notes) cleanedVal.notes = val.notes;
        if (val.amortization !== undefined && val.amortization !== null) cleanedVal.amortization = val.amortization;
        if (val.interest !== undefined && val.interest !== null) cleanedVal.interest = val.interest;
        if (val.insurance !== undefined && val.insurance !== null) cleanedVal.insurance = val.insurance;
        
        cleanedOverrides[key] = cleanedVal;
      });

      if (isFormOpen) {
        // Save to form overrides state locally
        setFormInstallmentsOverride(cleanedOverrides);
        setOverrideInstallmentNum(null);
      } else {
        // Save to Firestore directly
        if (!activeContract) return;
        const docRef = doc(db, 'financing_contracts', activeContract.id);
        await updateDoc(docRef, {
          installmentsOverride: cleanedOverrides,
          updatedAt: new Date().toISOString()
        });
        setOverrideInstallmentNum(null);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `financing_contracts/override`);
    }
  };

  // Lists of Years found in timeline for filtering
  const timelineYears = useMemo(() => {
    const yearsSet = new Set<string>();
    computedTimeline.forEach(item => {
      const yr = item.dueDate.split('-')[0];
      yearsSet.add(yr);
    });
    return Array.from(yearsSet).sort();
  }, [computedTimeline]);

  // Filtered timeline view
  const filteredTimeline = useMemo(() => {
    return computedTimeline.filter(item => {
      // Status filter
      if (timelineStatusFilter === 'paid' && !item.isPaid) return false;
      if (timelineStatusFilter === 'pending' && item.isPaid) return false;

      // Year filter
      if (timelineYearFilter !== 'all') {
        const itemYr = item.dueDate.split('-')[0];
        if (itemYr !== timelineYearFilter) return false;
      }

      return true;
    });
  }, [computedTimeline, timelineStatusFilter, timelineYearFilter]);

  // Paginated timeline
  const itemsPerPage = 12;
  const totalPages = Math.ceil(filteredTimeline.length / itemsPerPage);
  
  const paginatedTimeline = useMemo(() => {
    const start = timelinePage * itemsPerPage;
    return filteredTimeline.slice(start, start + itemsPerPage);
  }, [filteredTimeline, timelinePage]);

  // Reset page when filters change
  useEffect(() => {
    setTimelinePage(0);
  }, [timelineStatusFilter, timelineYearFilter]);

  // Navigate to specific installment number
  const handleGoToInstallment = () => {
    const num = parseInt(goToInstallmentNumber);
    if (isNaN(num) || num < 1 || num > computedTimeline.length) {
      alert(`Digite uma parcela válida entre 1 e ${computedTimeline.length}`);
      return;
    }

    // Set filter to show all, so we can locate it
    setTimelineStatusFilter('all');
    
    // Find the year of that installment to switch year filter if needed
    const targetItem = computedTimeline.find(item => item.number === num);
    if (targetItem) {
      const yr = targetItem.dueDate.split('-')[0];
      setTimelineYearFilter(yr);

      // Find the index of this item in the filtered set
      setTimeout(() => {
        const indexInFiltered = computedTimeline
          .filter(item => {
            const itemYr = item.dueDate.split('-')[0];
            return timelineYearFilter === 'all' || itemYr === yr;
          })
          .findIndex(item => item.number === num);

        if (indexInFiltered !== -1) {
          const pageNum = Math.floor(indexInFiltered / itemsPerPage);
          setTimelinePage(pageNum);
        }
      }, 50);
    }
    setGoToInstallmentNumber('');
  };

  // Pie chart data for costs breakdown
  const pieChartData = useMemo(() => {
    if (selectedContractId === 'all') {
      const totalValue = consolidatedStats.totalValue;
      const financedAmount = (Object.values(contractsCalculated) as any[]).reduce((sum, item) => sum + item.contract.financedAmount, 0);
      const initialEquity = totalValue - financedAmount;

      return [
        { name: 'Entrada / Recursos Próprios', value: Math.max(0, initialEquity), color: '#4f46e5' }, // indigo-600
        { name: 'Financiamento Principal Amortizado', value: consolidatedStats.totalAmortizedPaid, color: '#10b981' }, // emerald-500
        { name: 'Juros e Seguros Pagos', value: consolidatedStats.totalTaxesPaid, color: '#f59e0b' }, // amber-500
        { name: 'Taxas de Obras', value: consolidatedStats.totalObraPaid, color: '#ec4899' }, // pink-500
        { name: 'IPTU, Condomínio e Reformas', value: consolidatedStats.totalMaintenancePaid, color: '#06b6d4' } // cyan-500
      ].filter(item => item.value > 0);
    }

    if (!activeContract) return [];
    
    const { totalValue, financedAmount } = activeContract;
    const initialEquity = totalValue - financedAmount;

    return [
      { name: 'Entrada / Recursos Próprios', value: initialEquity, color: '#4f46e5' }, // indigo-600
      { name: 'Financiamento Principal Amortizado', value: stats.totalAmortizedPaid, color: '#10b981' }, // emerald-500
      { name: 'Juros e Seguros Pagos', value: stats.totalTaxesPaid, color: '#f59e0b' }, // amber-500
      { name: 'Taxas de Obras', value: stats.totalObraPaid, color: '#ec4899' }, // pink-500
      { name: 'IPTU, Condomínio e Reformas', value: stats.totalMaintenancePaid, color: '#06b6d4' } // cyan-500
    ].filter(item => item.value > 0);
  }, [selectedContractId, activeContract, stats, consolidatedStats, contractsCalculated]);

  // Line/Area chart data: Outflow projections month-by-month for the CURRENT calendar year
  const annualCashFlowData = useMemo(() => {
    const currentYearStr = currentMonth.split('-')[0];
    const months = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];

    return months.map((monthName, idx) => {
      const monthNumberStr = String(idx + 1).padStart(2, '0');
      const targetMonthKey = `${currentYearStr}-${monthNumberStr}`;

      let totalFinanciamento = 0;
      let totalManutencao = 0;

      if (selectedContractId === 'all') {
        (Object.values(contractsCalculated) as any[]).forEach(({ timeline }) => {
          const monthlyInstallments = timeline.filter(item => item.dueDate.startsWith(targetMonthKey));
          
          totalFinanciamento += monthlyInstallments.reduce((sum, item) => {
            if (item.isObra) {
              return sum + (item.constructionFee > 0 ? item.constructionFee : item.interest + item.insurance);
            }
            return sum + item.amortization + item.interest + item.insurance + item.extraPaid;
          }, 0);

          totalManutencao += monthlyInstallments.reduce((sum, item) => {
            return sum + item.iptu + item.condominio + item.reforms;
          }, 0);
        });
      } else {
        const monthlyInstallments = computedTimeline.filter(item => item.dueDate.startsWith(targetMonthKey));
        
        totalFinanciamento = monthlyInstallments.reduce((sum, item) => {
          if (item.isObra) {
            return sum + (item.constructionFee > 0 ? item.constructionFee : item.interest + item.insurance);
          }
          return sum + item.amortization + item.interest + item.insurance + item.extraPaid;
        }, 0);

        totalManutencao = monthlyInstallments.reduce((sum, item) => {
          return sum + item.iptu + item.condominio + item.reforms;
        }, 0);
      }

      return {
        month: monthName,
        'Financiamento': parseFloat(totalFinanciamento.toFixed(2)),
        'Manutenção e IPTU': parseFloat(totalManutencao.toFixed(2)),
        'Despesa Total': parseFloat((totalFinanciamento + totalManutencao).toFixed(2))
      };
    });
  }, [selectedContractId, contractsCalculated, computedTimeline, currentMonth]);

  const upcomingConsolidatedInstallments = useMemo(() => {
    const list: Array<{
      contractId: string;
      propertyName: string;
      contractType: string;
      number: number;
      dueDate: string;
      totalValue: number;
    }> = [];

    (Object.values(contractsCalculated) as any[]).forEach(({ contract, timeline }) => {
      const nextPending = timeline.find(item => !item.isPaid);
      if (nextPending) {
        list.push({
          contractId: contract.id,
          propertyName: contract.propertyName,
          contractType: contract.contractType || 'financing',
          number: nextPending.number,
          dueDate: nextPending.dueDate,
          totalValue: nextPending.totalValue
        });
      }
    });

    return list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [contractsCalculated]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 space-y-3">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-xs font-semibold font-display">Carregando monitor de quitação imobiliária...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header and selector row */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight font-display flex items-center gap-2">
            <Building className="text-indigo-600 w-6 h-6" />
            Imóveis e Ativos (Financiamentos)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Controle tático de evolução de patrimônio líquido contra amortização de passivo bancário.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {contracts.length > 0 && (
            <select
              value={selectedContractId || ''}
              onChange={(e) => setSelectedContractId(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-xl px-4 py-2.5 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="all">📊 Visão Geral Consolidada</option>
              {contracts.map(c => {
                const typeEmoji = c.contractType === 'down_payment' ? '🔑' : c.contractType === 'construction' ? '🚧' : c.contractType === 'other_installments' ? '📈' : c.contractType === 'other_fees' ? '💸' : c.contractType === 'other' ? '🏷️' : '🏠';
                const typeLabel = c.contractType === 'down_payment' ? 'Entrada' : c.contractType === 'construction' ? 'Fase de Obra' : c.contractType === 'other_installments' ? (c.customDescription || 'Intercalar/Balão') : c.contractType === 'other_fees' ? (c.customDescription || 'Taxa/Imposto') : c.contractType === 'other' ? 'Outro' : 'Financiamento';
                return (
                  <option key={c.id} value={c.id}>{typeEmoji} {c.propertyName} ({typeLabel})</option>
                );
              })}
            </select>
          )}
          <button
            onClick={handleImportCarlosEdgarData}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl px-4 py-2.5 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <FileText size={14} />
            Importar Contrato
          </button>
          <button
            onClick={() => {
              setEditingContract(null);
              setModalStep('choose_type');
              setContractType('construction');
              if (activeContract) {
                setSelectedPropertyChoice('existing');
                setExistingPropertySelect(activeContract.propertyName);
              } else if (existingPropertyNames.length > 0) {
                setSelectedPropertyChoice('existing');
                setExistingPropertySelect(existingPropertyNames[0]);
              } else {
                setSelectedPropertyChoice('new');
                setExistingPropertySelect('');
              }
              setIsFormOpen(true);
            }}
            className="bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-xs font-bold rounded-xl px-4 py-2.5 transition flex items-center gap-1.5 shadow-sm cursor-pointer font-sans"
          >
            <Hammer size={14} />
            + Parcela Fase de Obra
          </button>
          <button
            onClick={handleOpenAddForm}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl px-4 py-2.5 transition flex items-center gap-1.5 shadow-sm cursor-pointer font-sans"
          >
            <Plus size={14} />
            Novo Imóvel / Componente
          </button>
        </div>
      </div>

      {contracts.length === 0 ? (
        /* Empty State Landing Page */
        <div className="bg-white rounded-3xl border border-slate-100 p-8 text-center max-w-2xl mx-auto shadow-sm space-y-6">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
            <Building size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-slate-800 font-display">Monitore o seu Financiamento Imobiliário</h2>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Transforme a sua dívida habitacional em uma linha do tempo tática de evolução de patrimônio real. 
              Separe gastos normais de investimento imobiliário puro.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left pt-2">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
              <TrendingUp className="text-emerald-500 w-5 h-5" />
              <h3 className="text-xs font-bold text-slate-800">Evolução Real</h3>
              <p className="text-[10px] text-slate-500">Veja a porcentagem exata de quitação física do imóvel que já é seu.</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
              <Hammer className="text-pink-500 w-5 h-5" />
              <h3 className="text-xs font-bold text-slate-800">Fase da Obra</h3>
              <p className="text-[10px] text-slate-500">Controle as taxas de juros de obra e evolução de forma variável e auditada.</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1">
              <Lock className="text-indigo-500 w-5 h-5" />
              <h3 className="text-xs font-bold text-slate-800">Blindagem de Saldo</h3>
              <p className="text-[10px] text-slate-500">Cálculos matemáticos puros SAC/Price blindados contra distorções humanas.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3">
            <button
              onClick={handleOpenAddForm}
              className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl px-6 py-3 transition shadow-md inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus size={16} />
              Cadastrar Meu Primeiro Imóvel
            </button>
            <button
              onClick={handleImportCarlosEdgarData}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl px-6 py-3 transition shadow-md inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileText size={16} />
              Importar Contrato (IDEAL PORTO BURITI)
            </button>
          </div>
        </div>
      ) : selectedContractId === 'all' ? (
        /* Consolidated Dashboard View */
        <div className="space-y-8">
          {/* Consolidated Numeric Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Consolidated Ownership Circle Gauge */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-display">Evolução Consolidada (Quitação Geral)</h3>
              
              {/* Radial Circle Progress Bar */}
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="72"
                    cy="72"
                    r="64"
                    stroke="#f1f5f9"
                    strokeWidth="12"
                    fill="transparent"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r="64"
                    stroke="#10b981"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 64}
                    strokeDashoffset={2 * Math.PI * 64 * (1 - consolidatedStats.ownershipPercent / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-800 font-mono">
                    {consolidatedStats.ownershipPercent.toFixed(1)}%
                  </span>
                  <span className="text-[9px] text-emerald-600 font-bold tracking-wider uppercase mt-0.5">
                    Patrimônio Pago
                  </span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-xs">
                Seu patrimônio líquido pago de <span className="font-bold text-slate-800 font-mono">R$ {consolidatedStats.totalAmortizedPaid.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span> contra um passivo financiado ativo total de <span className="font-bold text-slate-800 font-mono">R$ {consolidatedStats.outstandingDebt.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>.
              </div>
            </div>

            {/* Numeric Stats */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Saldo Devedor Total Consolidado</span>
                    <p className="text-2xl font-black text-slate-800 font-mono tracking-tight">
                      R$ {consolidatedStats.outstandingDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                    <TrendingUp size={20} />
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-500 font-semibold">
                  <span>Soma de todos os saldos devedores ativos</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Total Já Liquidado Consolidado</span>
                    <p className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                      R$ {consolidatedStats.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <DollarSign size={20} />
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-500 font-semibold">
                  <span>Soma de todos os pagamentos e amortizações efetuadas</span>
                </div>
              </div>
            </div>
          </div>

          {/* Heading for Component Cards Grid */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider font-display">Módulos e Componentes Financeiros ({contracts.length})</h3>
            <p className="text-xs text-slate-500">Cada item possui amortização e quantidades de parcelas independentes. Clique no olho para acessar o fluxo individual.</p>
          </div>

          {/* Component Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {contracts.map(contract => {
              const calc = contractsCalculated[contract.id];
              if (!calc) return null;
              
              const { stats: cStats } = calc;
              const contractType = contract.contractType || 'financing';
              
              const typeInfo = {
                financing: { label: 'Financiamento Bancário', icon: Home, bg: 'bg-indigo-50 border-indigo-100 text-indigo-700', progress: 'bg-indigo-600' },
                down_payment: { label: 'Valor da Entrada', icon: Key, bg: 'bg-emerald-50 border-emerald-100 text-emerald-700', progress: 'bg-emerald-600' },
                construction: { label: 'Fase de Obra', icon: Hammer, bg: 'bg-pink-50 border-pink-100 text-pink-700', progress: 'bg-pink-600' },
                other_installments: { label: contract.customDescription || 'Parcelas / Intercalares', icon: TrendingUp, bg: 'bg-amber-50 border-amber-100 text-amber-700', progress: 'bg-amber-600' },
                other_fees: { label: contract.customDescription || 'Outras Taxas', icon: DollarSign, bg: 'bg-cyan-50 border-cyan-100 text-cyan-700', progress: 'bg-cyan-600' },
                other: { label: 'Outros Custos', icon: HelpCircle, bg: 'bg-slate-50 border-slate-100 text-slate-700', progress: 'bg-slate-600' }
              }[contractType] || { label: 'Financiamento', icon: Home, bg: 'bg-indigo-50 border-indigo-100 text-indigo-700', progress: 'bg-indigo-600' };

              const IconComponent = typeInfo.icon;

              return (
                <div key={contract.id} className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${typeInfo.bg}`}>
                        <IconComponent size={10} strokeWidth={2.5} />
                        {typeInfo.label}
                      </span>
                      <h4 className="text-sm font-black text-slate-800 tracking-tight font-display">{contract.propertyName}</h4>
                    </div>
                    {/* Quick Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedContractId(contract.id)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                        title="Ver Detalhes / Extrato"
                      >
                        <Eye size={13} />
                      </button>
                      <button
                        onClick={() => handleOpenEditForm(contract)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition cursor-pointer"
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteContract(contract)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                        title="Remover"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-semibold">
                      <span>Saldo Devedor:</span>
                      <span className="font-mono text-slate-800 font-black">
                        R$ {cStats.outstandingDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-500 font-semibold">
                      <span>{cStats.initialEquity > 0 ? 'Pago em Parcelas:' : 'Já Pago:'}</span>
                      <span className="font-mono text-emerald-600 font-black">
                        R$ {(cStats.initialEquity > 0 ? cStats.totalInstallmentsPaidValue : cStats.totalPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {cStats.initialEquity > 0 && (
                      <div className="flex justify-between items-center text-[11px] text-slate-400 font-medium">
                        <span>Entrada / Próprio:</span>
                        <span className="font-mono text-slate-600 font-bold">
                          R$ {cStats.initialEquity.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    
                    {/* Progress bar */}
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[9px] font-bold text-slate-400 uppercase">
                        <span>Quitação</span>
                        <span>{cStats.ownershipPercent.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${typeInfo.progress} transition-all duration-500`}
                          style={{ width: `${cStats.ownershipPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-500 font-bold">
                    <span>Parcelas Pagas:</span>
                    <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full font-mono">
                      {cStats.paidCount} de {cStats.totalInstallmentsCount}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Unified Upcoming Schedule */}
          {upcomingConsolidatedInstallments.length > 0 && (
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">Próximos Pagamentos Combinados</h3>
                <p className="text-[10px] text-slate-400 mt-1">Próxima parcela pendente de cada um dos componentes, ordenados por vencimento.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5 px-2">Componente</th>
                      <th className="py-2.5 px-2">Tipo</th>
                      <th className="py-2.5 px-2">N° Parcela</th>
                      <th className="py-2.5 px-2">Vencimento</th>
                      <th className="py-2.5 px-2">Valor Programado</th>
                      <th className="py-2.5 px-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                    {upcomingConsolidatedInstallments.map((inst, idx) => {
                      const typeLabel = inst.contractType === 'down_payment' ? 'Entrada' : inst.contractType === 'construction' ? 'Fase de Obra' : inst.contractType === 'other_installments' ? 'Intercalar/Balão' : inst.contractType === 'other_fees' ? 'Taxa/Imposto' : inst.contractType === 'other' ? 'Outro' : 'Financiamento';
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-2 font-bold text-slate-800">{inst.propertyName}</td>
                          <td className="py-3 px-2">
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{typeLabel}</span>
                          </td>
                          <td className="py-3 px-2 font-mono font-bold text-slate-500">#{inst.number}</td>
                          <td className="py-3 px-2 font-mono font-semibold text-indigo-600">
                            {new Date(inst.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-3 px-2 font-mono font-bold text-slate-900">R$ {inst.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="py-3 px-2 text-right">
                            <button
                              onClick={() => setSelectedContractId(inst.contractId)}
                              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2.5 py-1 rounded-lg transition flex items-center gap-1 ml-auto cursor-pointer"
                            >
                              <Eye size={10} />
                              Ver Detalhes
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Combined Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Distribution Pie Chart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">Distribuição Total Consolidada</h3>
                <p className="text-[10px] text-slate-400 mt-1">Impacto financeiro acumulado das saídas de todos os componentes.</p>
              </div>

              <div className="h-64 flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-50">
                {pieChartData.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-600 font-medium truncate max-w-[180px]">{item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800">
                      R$ {item.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Annual Cashflow Projection */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">Projeção de Desembolso Mensal Consolidada ({currentMonth.split('-')[0]})</h3>
                <p className="text-[10px] text-slate-400 mt-1">Estimativa de fluxo de caixa consolidado consumido por todos os componentes imobiliários.</p>
              </div>

              <div className="h-64 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={annualCashFlowData}>
                    <defs>
                      <linearGradient id="colorTotalCons" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(value: any) => `R$ ${value.toLocaleString('pt-BR')}`} />
                    <Area type="monotone" dataKey="Despesa Total" stroke="#4f46e5" fillOpacity={1} fill="url(#colorTotalCons)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex gap-4 text-[10px] justify-center text-slate-500 font-semibold pt-2 border-t border-slate-50">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-indigo-600" />
                  <span>Todos os Componentes combinados</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : activeContract ? (
        /* Full Dashboard View */
        <div className="space-y-8">
          {/* Top Info Strip and Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-100/60 border border-slate-200/50 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <span className="bg-indigo-100 text-indigo-700 font-bold px-3 py-1 rounded-full text-[10px] tracking-wider uppercase font-mono">
                {activeContract.amortizationSystem}
              </span>
              <div className="text-xs font-semibold text-slate-700">
                Taxa Anual: <span className="font-mono text-slate-900 font-bold">{activeContract.interestRateAnnum}% a.a.</span> • 
                Valor Financiado: <span className="font-mono text-slate-900 font-bold">R$ {activeContract.financedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditingContract(null);
                  setModalStep('choose_type');
                  setContractType('construction');
                  setSelectedPropertyChoice('existing');
                  setExistingPropertySelect(activeContract.propertyName);
                  setIsFormOpen(true);
                }}
                className="bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold rounded-xl px-3.5 py-2 transition flex items-center gap-1.5 shadow-md cursor-pointer font-sans"
                title="Adicionar Parcelas da Fase de Obra"
              >
                <Hammer size={12} />
                + Parcela Fase de Obra
              </button>
              <button
                onClick={() => handleOpenEditForm(activeContract)}
                className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 transition flex items-center gap-1 cursor-pointer"
                title="Editar Configurações"
              >
                <Edit2 size={12} />
                Editar
              </button>
              <button
                onClick={() => handleDeleteContract(activeContract)}
                className="bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 text-xs font-bold rounded-xl px-3 py-2 transition flex items-center gap-1 cursor-pointer"
                title="Excluir Imóvel"
              >
                <Trash2 size={12} />
                Remover
              </button>
            </div>
          </div>

          {/* 1. Evolução da Propriedade (Monitor de Quitação) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Ownership Circle Gauge */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Evolução do Patrimônio (Quitação)</h3>
              
              {/* Radial Circle Progress Bar */}
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="72"
                    cy="72"
                    r="64"
                    stroke="#f1f5f9"
                    strokeWidth="12"
                    fill="transparent"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r="64"
                    stroke="#4f46e5"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 64}
                    strokeDashoffset={2 * Math.PI * 64 * (1 - stats.ownershipPercent / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-1000"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-800 font-mono">
                    {stats.ownershipPercent.toFixed(1)}%
                  </span>
                  <span className="text-[9px] text-indigo-600 font-bold tracking-wider uppercase mt-0.5">
                    Propriedade Real
                  </span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 font-medium leading-relaxed max-w-xs">
                Sua entrada + todas as amortizações somam <span className="font-bold text-slate-800 font-mono">R$ {(activeContract.totalValue - activeContract.financedAmount + stats.totalAmortizedPaid).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span> de posse real sob o valor de mercado de <span className="font-bold text-slate-800 font-mono">R$ {activeContract.totalValue.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>.
              </div>
            </div>

            {/* Numeric Stats */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Saldo Devedor Atualizado</span>
                    <p className="text-2xl font-black text-slate-800 font-mono tracking-tight">
                      R$ {stats.outstandingDebt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                    <TrendingUp size={20} />
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-500 font-semibold">
                  <span>Dívida original ativa:</span>
                  <span className="font-mono text-slate-700">R$ {activeContract.financedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">Total Já Liquidado (Acumulado)</span>
                    <p className="text-2xl font-black text-emerald-600 font-mono tracking-tight">
                      R$ {stats.totalPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                    <DollarSign size={20} />
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3 flex justify-between items-center text-[10px] text-slate-500 font-semibold">
                  <span>Parcelas pagas:</span>
                  <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono font-bold">
                    {stats.paidCount} de {stats.totalInstallmentsCount} ({((stats.paidCount / stats.totalInstallmentsCount)*100).toFixed(0)}%)
                  </span>
                </div>
              </div>

              {/* Phase of Obra Quick Card */}
              {activeContract.hasKeysHandover && (
                <div className="sm:col-span-2 bg-pink-50/50 border border-pink-100 p-5 rounded-3xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex gap-3 items-start">
                    <div className="w-10 h-10 bg-pink-100 text-pink-600 rounded-xl flex items-center justify-center shrink-0">
                      <Hammer size={20} />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-pink-900 uppercase tracking-wider">Fase da Obra • Taxas de Evolução</h4>
                      <p className="text-[11px] text-pink-700/90 mt-1 max-w-md">
                        Encargos variáveis cobrados pela instituição financeira antes da entrega física das chaves ({activeContract.keysHandoverDate ? `Prevista para: ${new Date(activeContract.keysHandoverDate + 'T12:00:00').toLocaleDateString('pt-BR')}` : 'Data não informada'}).
                      </p>
                    </div>
                  </div>
                  <div className="bg-white border border-pink-200/80 rounded-2xl px-4 py-3 shrink-0 text-center space-y-0.5 min-w-[150px]">
                    <span className="text-[9px] text-pink-500 font-bold uppercase tracking-wider block">Acumulado Pago Obra</span>
                    <span className="text-sm font-black font-mono text-pink-700">R$ {stats.totalObraPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 4. Fluxo de Caixa Anual e Distribuição (Charts) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Distribution Pie Chart */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-5 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">Distribuição Total Consumida</h3>
                <p className="text-[10px] text-slate-400 mt-1">Impacto financeiro acumulado das saídas vinculadas ao imóvel.</p>
              </div>

              <div className="h-64 flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: any) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} 
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-50">
                {pieChartData.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="text-slate-600 font-medium truncate max-w-[180px]">{item.name}</span>
                    </div>
                    <span className="font-mono font-bold text-slate-800">
                      R$ {item.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Annual Cashflow Projection */}
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm lg:col-span-7 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">Projeção Mensal de Desembolso ({currentMonth.split('-')[0]})</h3>
                <p className="text-[10px] text-slate-400 mt-1">Estimativa de fluxo de caixa anual consumido pelo ativo mês a mês.</p>
              </div>

              <div className="h-64 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={annualCashFlowData}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(value: any) => `R$ ${value.toLocaleString('pt-BR')}`} />
                    <Area type="monotone" dataKey="Despesa Total" stroke="#4f46e5" fillOpacity={1} fill="url(#colorTotal)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className="flex gap-4 text-[10px] justify-center text-slate-500 font-semibold pt-2 border-t border-slate-50">
                <div className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-indigo-600" />
                  <span>Financiamento + Seguros + IPTU + Condomínio</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Extrato Consolidado (Linha do Tempo Absoluta) & Gestão */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-display">Linha do Tempo de Quitação & Extrato</h3>
                <p className="text-[10px] text-slate-400 mt-1">Histórico completo de todas as parcelas e encargos.</p>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Year Filter */}
                <select
                  value={timelineYearFilter}
                  onChange={(e) => setTimelineYearFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="all">Todos os Anos</option>
                  {timelineYears.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>

                {/* Status Filter */}
                <select
                  value={timelineStatusFilter}
                  onChange={(e) => setTimelineStatusFilter(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 focus:outline-none"
                >
                  <option value="all">Todos os Status</option>
                  <option value="paid">Pagas</option>
                  <option value="pending">Em Aberto</option>
                </select>

                {/* Go To Installment Input */}
                <div className="flex items-center gap-1 pl-2 border-l border-slate-100">
                  <input
                    type="number"
                    placeholder="Ir para n°"
                    value={goToInstallmentNumber}
                    onChange={(e) => setGoToInstallmentNumber(e.target.value)}
                    className="w-16 bg-slate-50 border border-slate-200 text-slate-600 text-[11px] rounded-lg px-2 py-1.5 font-mono text-center focus:outline-none"
                  />
                  <button
                    onClick={handleGoToInstallment}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold px-2 py-1.5 rounded-lg transition"
                  >
                    Ir
                  </button>
                </div>
              </div>
            </div>

            {/* Direct Copy-Paste Importer Section for Active Contract */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 font-display flex items-center gap-1.5">
                    📋 Importar Histórico de Parcelas do Sistema Antigo (Copiar/Colar)
                  </h4>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Abra sua planilha antiga, selecione e copie as colunas de parcelas (Parcela, Vencimento, Status/Liquidado, Valor) e cole abaixo para atualizar tudo em lote.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowDirectImportArea(!showDirectImportArea);
                    setDirectImportResult(null);
                  }}
                  className="px-3 py-1.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition cursor-pointer"
                >
                  {showDirectImportArea ? 'Recolher Painel' : 'Abrir Painel de Colar'}
                </button>
              </div>

              {showDirectImportArea && (
                <div className="space-y-3 pt-3 border-t border-slate-200/50">
                  <p className="text-[10px] text-slate-500 leading-normal">
                    Formatos aceitos: Linhas contendo o número da parcela (Ex: <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[9px]">1 / 36</code> ou <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[9px]">1</code>), a data de vencimento (<code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[9px]">16/09/2025</code>), a palavra-chave de pagamento (<code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[9px]">LIQUIDADO</code> ou <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[9px]">PAGO</code>) e o valor (<code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[9px]">R$ 86,98</code>).
                  </p>
                  <textarea
                    rows={4}
                    placeholder="Cole as linhas copiadas do seu sistema antigo aqui. Exemplo:&#10;1 / 36   16/09/2025   LIQUIDADO   R$ 86,98&#10;12 / 36  16/08/2026   PENDENTE    R$ 130,34"
                    value={directImportText}
                    onChange={(e) => setDirectImportText(e.target.value)}
                    className="w-full text-xs font-mono border border-slate-250 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                  />
                  <div className="flex justify-between items-center gap-4">
                    <div className="flex-1">
                      {directImportResult && (
                        <span className={`text-[11px] font-bold block ${directImportResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {directImportResult.success 
                            ? `✓ ${directImportResult.count} parcelas importadas e atualizadas diretamente neste componente!` 
                            : `✗ ${directImportResult.error}`}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDirectPasteImport(directImportText)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                    >
                      Aplicar Histórico Copiado
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* List Table of Installments */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-2 w-10 text-center">
                      <input 
                        type="checkbox" 
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        checked={paginatedTimeline.length > 0 && paginatedTimeline.every(item => selectedInstallmentNumbers.includes(item.number))}
                        onChange={() => {
                          const allSelected = paginatedTimeline.length > 0 && paginatedTimeline.every(item => selectedInstallmentNumbers.includes(item.number));
                          if (allSelected) {
                            const pagNums = paginatedTimeline.map(i => i.number);
                            setSelectedInstallmentNumbers(prev => prev.filter(num => !pagNums.includes(num)));
                          } else {
                            const pagNums = paginatedTimeline.map(i => i.number);
                            setSelectedInstallmentNumbers(prev => Array.from(new Set([...prev, ...pagNums])));
                          }
                        }}
                      />
                    </th>
                    <th className="py-3 px-2">Parcela</th>
                    <th className="py-3 px-2">Data Programada</th>
                    <th className="py-3 px-2">Amortização Principal</th>
                    <th className="py-3 px-2">Juros + Seguros</th>
                    <th className="py-3 px-2">Outros / Encargos</th>
                    <th className="py-3 px-2">Valor Total</th>
                    <th className="py-3 px-2 text-right">Saldo Devedor Restante</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                  {paginatedTimeline.map((item) => {
                    const totalEncargos = item.iptu + item.condominio + item.reforms + (item.isObra ? item.constructionFee : 0);
                    const isOverdue = !item.isPaid && getLocalTodayStr() > item.dueDate;
                    const isSelected = selectedInstallmentNumbers.includes(item.number);

                    return (
                      <tr key={item.number} className={`hover:bg-slate-50/50 transition-colors ${item.isPaid ? 'bg-emerald-50/10' : ''} ${isSelected ? 'bg-indigo-50/25 font-medium' : ''}`}>
                        <td className="py-3.5 px-2 text-center">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedInstallmentNumbers(prev => 
                                prev.includes(item.number) 
                                  ? prev.filter(n => n !== item.number) 
                                  : [...prev, item.number]
                              );
                            }}
                          />
                        </td>
                        <td className="py-3.5 px-2 font-mono font-bold text-slate-900">
                          {item.number} de {stats.totalInstallmentsCount}
                          {item.isObra && (
                            <span className="ml-1 bg-pink-100 text-pink-800 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase">
                              Obra
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-2">
                          <span className={`font-mono font-semibold ${isOverdue ? 'text-rose-500 font-bold' : 'text-slate-600'}`}>
                            {new Date(item.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 font-mono text-slate-900">
                          R$ {item.amortization.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          {item.extraPaid > 0 && (
                            <span className="block text-[9px] text-emerald-600 font-semibold" title="Amortização extraordinária">
                              + R$ {item.extraPaid.toLocaleString('pt-BR')} (Extra)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-2 font-mono text-slate-500">
                          R$ {(item.interest + item.insurance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          <span className="block text-[9px] text-slate-400">
                            J: R$ {item.interest} | S: R$ {item.insurance}
                          </span>
                        </td>
                        <td className="py-3.5 px-2 font-mono text-slate-500">
                          {totalEncargos > 0 ? (
                            <span className="text-indigo-600 font-semibold">
                              R$ {totalEncargos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-2 font-mono font-bold text-slate-900">
                          R$ {item.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-2 font-mono text-slate-800 text-right">
                          R$ {item.outstandingAfter.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <button
                            onClick={() => handleToggleInstallmentPaid(item.number, item.isPaid)}
                            className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full transition cursor-pointer ${
                              item.isPaid 
                                ? 'bg-emerald-100 text-emerald-800'
                                : isOverdue
                                  ? 'bg-rose-100 text-rose-800 animate-pulse'
                                  : 'bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-800'
                            }`}
                          >
                            {item.isPaid ? (
                              <>
                                <Check size={10} strokeWidth={3} />
                                Pago
                              </>
                            ) : (
                              <>
                                <Clock size={10} strokeWidth={3} />
                                Pendente
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            {/* Override customization details */}
                            <button
                              onClick={() => handleOpenOverrideModal(item.number, item)}
                              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition cursor-pointer"
                              title="Adicionar custos / Amortização extraordinária / Notas"
                            >
                              <Edit2 size={13} />
                            </button>
                            
                            {/* Postpone button */}
                            {!item.isPaid && (
                              <button
                                onClick={() => handlePostponeInstallment(item.number, item.dueDate)}
                                className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition cursor-pointer"
                                title="Adiar vencimento em 30 dias"
                              >
                                <Calendar size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTimeline.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 font-semibold">
                        Nenhuma parcela encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center pt-4 border-t border-slate-50 text-xs">
                <span className="text-slate-500 font-medium">
                  Mostrando parcelas <span className="text-slate-900 font-bold">{timelinePage * itemsPerPage + 1}</span> a <span className="text-slate-900 font-bold">{Math.min(filteredTimeline.length, (timelinePage + 1) * itemsPerPage)}</span> de <span className="text-slate-900 font-bold">{filteredTimeline.length}</span>
                </span>

                <div className="inline-flex gap-1.5">
                  <button
                    onClick={() => setTimelinePage(p => Math.max(0, p - 1))}
                    disabled={timelinePage === 0}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-3 py-1.5 bg-slate-100 text-slate-800 font-bold rounded-lg font-mono">
                    {timelinePage + 1} de {totalPages}
                  </span>
                  <button
                    onClick={() => setTimelinePage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={timelinePage === totalPages - 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-50 transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Informational strip about blindagem */}
            <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl flex items-start gap-2 text-[11px] text-slate-600">
              <Lock size={16} className="text-slate-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-slate-800">Blindagem de Cálculos Financeiros Bancários</span>
                <p className="leading-relaxed">
                  Para evitar erros de arredondamento acidentais ou corrupção do cronograma do saldo devedor principal de longo prazo, as parcelas bancárias de base (amortização nominal calculada matematicamente) e juros puros são calculadas e protegidas automaticamente em memória. Você pode adicionar livremente quaisquer valores reais de IPTU, condomínio, reformas, adiantamentos extraordinários e taxas de evolução utilizando o botão de customização.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* MODAL: ADD / EDIT FINANCING CONTRACT */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-xl border border-slate-100 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider font-display">
                    {editingContract ? 'Editar Componente' : 'Adicionar Componente Financeiro'}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Gerenciamento individual de custos e prazos.</p>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Step 1: Choose Type & Select/Create Property */}
              {modalStep === 'choose_type' && !editingContract ? (
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                  {/* Property Selector */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">1. Associar ao Imóvel/Financiamento</h4>
                    
                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
                      {existingPropertyNames.length > 0 && (
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="propertyChoice"
                            checked={selectedPropertyChoice === 'existing'}
                            onChange={() => setSelectedPropertyChoice('existing')}
                            className="text-indigo-600"
                          />
                          <span>Imóvel Existente</span>
                        </label>
                      )}
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="propertyChoice"
                          checked={selectedPropertyChoice === 'new'}
                          onChange={() => setSelectedPropertyChoice('new')}
                          className="text-indigo-600"
                        />
                        <span>Novo Imóvel / Empreendimento</span>
                      </label>
                    </div>

                    {selectedPropertyChoice === 'existing' && existingPropertyNames.length > 0 ? (
                      <div className="flex flex-col space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Selecione o Imóvel</label>
                        <select
                          value={existingPropertySelect}
                          onChange={(e) => setExistingPropertySelect(e.target.value)}
                          className="w-full bg-white border border-slate-200 text-slate-700 text-xs rounded-xl px-3.5 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                        >
                          {existingPropertyNames.map(name => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-col space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Nome / Identificação do Imóvel</label>
                          <input
                            type="text"
                            placeholder="Ex: Reserva Imperial - Apto 304"
                            value={newPropertyNameInput}
                            onChange={(e) => setNewPropertyNameInput(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Valor Total do Imóvel (R$)</label>
                          <input
                            type="number"
                            placeholder="Ex: 450000"
                            value={totalPropertyValueInput}
                            onChange={(e) => setTotalPropertyValueInput(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Component Type Selector */}
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">2. Qual componente deseja adicionar?</h4>
                    <div className="grid grid-cols-1 gap-2.5">
                      {[
                        { id: 'financing', title: 'Financiamento Bancário', desc: 'Simulação SAC/Price de longo prazo com juros puros e seguro habitacional.', icon: Home, color: 'border-indigo-100 hover:border-indigo-300 text-indigo-700 bg-indigo-50/10' },
                        { id: 'construction', title: 'Fase de Obra (Taxa de Evolução)', desc: 'Prestações mensais do período de construção cobradas pela construtora ou banco.', icon: Hammer, color: 'border-pink-100 hover:border-pink-300 text-pink-700 bg-pink-50/10' },
                        { id: 'down_payment', title: 'Valor da Entrada', desc: 'Adicione a entrada, seja paga à vista ou parcelada individualmente antes das chaves.', icon: Key, color: 'border-emerald-100 hover:border-emerald-300 text-emerald-700 bg-emerald-50/10' },
                        { id: 'other_installments', title: 'Outras Parcelas / Intercalares / Balão', desc: 'Parcelas anuais, semestrais ou balões de reforço com periodicidade personalizada.', icon: TrendingUp, color: 'border-amber-100 hover:border-amber-300 text-amber-700 bg-amber-50/10' },
                        { id: 'other_fees', title: 'Outras Taxas (ITBI, Escritura, etc.)', desc: 'Impostos municipais, registros em cartório e taxas administrativas da compra.', icon: DollarSign, color: 'border-cyan-100 hover:border-cyan-300 text-cyan-700 bg-cyan-50/10' }
                      ].map(type => {
                        const Icon = type.icon;
                        const isSelected = contractType === type.id;
                        return (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => setContractType(type.id as any)}
                            className={`flex items-start gap-3.5 p-3.5 rounded-2xl border text-left transition cursor-pointer ${type.color} ${
                              isSelected ? 'ring-2 ring-offset-2 ring-slate-800 border-slate-400 bg-slate-50' : ''
                            }`}
                          >
                            <div className="p-2 rounded-xl bg-white border border-slate-100 shadow-xs shrink-0">
                              <Icon size={18} />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-xs font-black text-slate-800 block">{type.title}</span>
                              <span className="text-[10px] text-slate-500 font-medium leading-relaxed block">{type.desc}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer Actions */}
                  <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setIsFormOpen(false)}
                      className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalStep('fill_form')}
                      className="px-4 py-2 bg-slate-850 text-white text-xs font-bold rounded-xl hover:bg-slate-950 transition shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      Continuar
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 2: Form Content based on contractType */
                <form onSubmit={handleSaveContract} className="p-6 space-y-4 overflow-y-auto flex-1">
                  
                  {/* Property summary indicator */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>Imóvel Destino:</span>
                    <span className="text-slate-800 font-black">
                      {editingContract ? propertyName : (selectedPropertyChoice === 'existing' ? existingPropertySelect : newPropertyNameInput)}
                    </span>
                  </div>

                  {/* Form 1: Financiamento Bancário */}
                  {contractType === 'financing' && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Valor Financiado (R$)</label>
                          <input
                            type="number"
                            required
                            min="1"
                            step="0.01"
                            placeholder="Ex: 350000"
                            value={financedAmount}
                            onChange={(e) => setFinancedAmount(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Vencimento da 1ª Parcela</label>
                          <input
                            type="date"
                            required
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Quantidade de Parcelas</label>
                          <input
                            type="number"
                            required
                            min="1"
                            placeholder="Ex: 360"
                            value={totalInstallments}
                            onChange={(e) => setTotalInstallments(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Taxa de Juros Anual (%)</label>
                          <input
                            type="number"
                            required
                            min="0"
                            step="0.01"
                            placeholder="Ex: 9.5"
                            value={interestRateAnnum}
                            onChange={(e) => setInterestRateAnnum(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Sistema de Amortização</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setAmortizationSystem('SAC')}
                            className={`px-3 py-2 rounded-xl border text-xs font-semibold text-center transition cursor-pointer ${
                              amortizationSystem === 'SAC'
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-bold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            SAC (Decrescente)
                          </button>
                          <button
                            type="button"
                            onClick={() => setAmortizationSystem('PRICE')}
                            className={`px-3 py-2 rounded-xl border text-xs font-semibold text-center transition cursor-pointer ${
                              amortizationSystem === 'PRICE'
                                ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-bold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            PRICE (Fixa)
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Seguro / Taxa Adm Fixa Mensal (R$)</label>
                        <input
                          type="number"
                          required
                          min="0"
                          step="0.01"
                          placeholder="Ex: 75"
                          value={monthlyInsurance}
                          onChange={(e) => setMonthlyInsurance(e.target.value)}
                          className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>

                      {/* Keys Handover integration */}
                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={hasKeysHandover}
                            onChange={(e) => setHasKeysHandover(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500/20 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-700 uppercase">Adicionar Fase de Obra Virtual no Cronograma?</span>
                        </label>
                        {hasKeysHandover && (
                          <div className="flex flex-col space-y-1">
                            <label className="text-[10px] font-bold text-pink-700 uppercase">Data Estimada de Entrega das Chaves</label>
                            <input
                              type="date"
                              required
                              value={keysHandoverDate}
                              onChange={(e) => setKeysHandoverDate(e.target.value)}
                              className="border border-slate-200 bg-white rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Form 2: Fase de Obra */}
                  {contractType === 'construction' && (
                    <div className="space-y-4">
                      <div className="flex flex-col space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Valor Estimado da Parcela Mensal (R$)</label>
                        <input
                          type="number"
                          required={Object.keys(formInstallmentsOverride).length === 0}
                          min={Object.keys(formInstallmentsOverride).length === 0 ? "1" : undefined}
                          step="0.01"
                          placeholder={Object.keys(formInstallmentsOverride).length > 0 ? "Opcional (valores importados serão usados)" : "Ex: 1500"}
                          value={constructionMonthlyFee}
                          onChange={(e) => setConstructionMonthlyFee(e.target.value)}
                          className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Duração Estimada (Meses)</label>
                          <input
                            type="number"
                            required
                            min="1"
                            placeholder="Ex: 24"
                            value={constructionMonths}
                            onChange={(e) => setConstructionMonths(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Data da 1ª Parcela de Obra</label>
                          <input
                            type="date"
                            required
                            value={constructionStartDate}
                            onChange={(e) => setConstructionStartDate(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Form 3: Valor da Entrada */}
                  {contractType === 'down_payment' && (
                    <div className="space-y-4">
                      <div className="flex flex-col space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Valor Total da Entrada (R$)</label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="0.01"
                          placeholder="Ex: 50000"
                          value={downPaymentValue}
                          onChange={(e) => setDownPaymentValue(e.target.value)}
                          className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>

                      <div className="flex flex-col space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Forma de Pagamento</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setDownPaymentMode('cash')}
                            className={`px-3 py-2 rounded-xl border text-xs font-semibold text-center transition cursor-pointer ${
                              downPaymentMode === 'cash'
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm font-bold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            À Vista (Única)
                          </button>
                          <button
                            type="button"
                            onClick={() => setDownPaymentMode('installments')}
                            className={`px-3 py-2 rounded-xl border text-xs font-semibold text-center transition cursor-pointer ${
                              downPaymentMode === 'installments'
                                ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm font-bold'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            Parcelado (Sinal + Mensais)
                          </button>
                        </div>
                      </div>

                      {downPaymentMode === 'installments' && (
                        <div className="flex flex-col space-y-1 animate-slide-down">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Quantidade de Parcelas da Entrada</label>
                          <input
                            type="number"
                            required
                            min="1"
                            placeholder="Ex: 12"
                            value={downPaymentMonths}
                            onChange={(e) => setDownPaymentMonths(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                          />
                        </div>
                      )}

                      <div className="flex flex-col space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Data do Primeiro Pagamento</label>
                        <input
                          type="date"
                          required
                          value={downPaymentStartDate}
                          onChange={(e) => setDownPaymentStartDate(e.target.value)}
                          className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Form 4: Outras Parcelas / Intercalares */}
                  {contractType === 'other_installments' && (
                    <div className="space-y-4">
                      <div className="flex flex-col space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Descrição da Parcela</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: Parcela das Chaves, Semestral de Dezembro"
                          value={balloonDescription}
                          onChange={(e) => setBalloonDescription(e.target.value)}
                          className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Valor por Parcela (R$)</label>
                          <input
                            type="number"
                            required
                            min="1"
                            step="0.01"
                            placeholder="Ex: 20000"
                            value={balloonValue}
                            onChange={(e) => setBalloonValue(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Vencimento (Primeira)</label>
                          <input
                            type="date"
                            required
                            value={balloonDate}
                            onChange={(e) => setBalloonDate(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={balloonIsRecurring}
                            onChange={(e) => setBalloonIsRecurring(e.target.checked)}
                            className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500/20 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-700 uppercase">Esta parcela é Recorrente (Intercalares)?</span>
                        </label>

                        {balloonIsRecurring && (
                          <div className="grid grid-cols-2 gap-3 animate-slide-down">
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Frequência</label>
                              <select
                                value={balloonFrequency}
                                onChange={(e) => setBalloonFrequency(e.target.value as any)}
                                className="bg-white border border-slate-200 text-slate-700 text-xs rounded-xl px-2.5 py-2 font-semibold focus:outline-none"
                              >
                                <option value="semiannual">Semestral</option>
                                <option value="annual">Anual</option>
                              </select>
                            </div>
                            <div className="flex flex-col space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase">Total de vezes</label>
                              <input
                                type="number"
                                required
                                min="1"
                                value={balloonCount}
                                onChange={(e) => setBalloonCount(e.target.value)}
                                className="border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-mono focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Form 5: Outras Taxas */}
                  {contractType === 'other_fees' && (
                    <div className="space-y-4">
                      <div className="flex flex-col space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Descrição da Taxa / Imposto</label>
                        <input
                          type="text"
                          required
                          placeholder="Ex: ITBI, Registro do Imóvel, Honorários Despachante"
                          value={feeDescription}
                          onChange={(e) => setFeeDescription(e.target.value)}
                          className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="flex flex-col space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Valor do Custo (R$)</label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="0.01"
                          placeholder="Ex: 12000"
                          value={feeValue}
                          onChange={(e) => setFeeValue(e.target.value)}
                          className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Vencimento</label>
                          <input
                            type="date"
                            required
                            value={feeDate}
                            onChange={(e) => setFeeDate(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col space-y-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Dividido em quantas parcelas?</label>
                          <input
                            type="number"
                            required
                            min="1"
                            placeholder="Ex: 1"
                            value={feeInstallments}
                            onChange={(e) => setFeeInstallments(e.target.value)}
                            className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Live Installment Preview Section */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-slate-700 font-display flex items-center gap-1.5">
                          <Clock size={14} className="text-indigo-500" /> Cronograma de Parcelas Calculado
                        </h4>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Marque como pago ou clique na engrenagem para customizar juros/obra/IPTU de cada parcela antes de salvar.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const timeline = getFormContractTimeline();
                            const newOverrides = { ...formInstallmentsOverride };
                            timeline.forEach(item => {
                              const numStr = String(item.number);
                              newOverrides[numStr] = {
                                ...(newOverrides[numStr] || {}),
                                isPaid: true,
                                paidAt: item.dueDate
                              };
                            });
                            setFormInstallmentsOverride(newOverrides);
                          }}
                          className="px-2 py-1 text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition cursor-pointer"
                        >
                          Marcar Todas como Pagas
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const timeline = getFormContractTimeline();
                            const newOverrides = { ...formInstallmentsOverride };
                            timeline.forEach(item => {
                              const numStr = String(item.number);
                              newOverrides[numStr] = {
                                ...(newOverrides[numStr] || {}),
                                isPaid: false,
                                paidAt: undefined
                              };
                            });
                            setFormInstallmentsOverride(newOverrides);
                          }}
                          className="px-2 py-1 text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                        >
                          Limpar Pagamentos
                        </button>
                      </div>
                    </div>

                    {/* Quick range paid selector */}
                    <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-semibold text-slate-600">Marcar primeiras</span>
                      <input
                        type="number"
                        placeholder="Ex: 1"
                        id="quick-pay-installments-count"
                        min="1"
                        className="w-14 border border-slate-200 rounded-lg px-2 py-1 text-center font-mono text-xs focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const target = e.currentTarget;
                            const limit = parseInt(target.value);
                            if (limit > 0) {
                              const timeline = getFormContractTimeline();
                              const newOverrides = { ...formInstallmentsOverride };
                              timeline.forEach(item => {
                                const numStr = String(item.number);
                                const isLimit = item.number <= limit;
                                newOverrides[numStr] = {
                                  ...(newOverrides[numStr] || {}),
                                  isPaid: isLimit,
                                  paidAt: isLimit ? item.dueDate : undefined
                                };
                              });
                              setFormInstallmentsOverride(newOverrides);
                            }
                          }
                        }}
                      />
                      <span className="text-[10px] font-semibold text-slate-600">parcelas como pagas</span>
                      <button
                        type="button"
                        onClick={() => {
                          const inputEl = document.getElementById('quick-pay-installments-count') as HTMLInputElement;
                          const limit = parseInt(inputEl?.value || '0');
                          if (limit > 0) {
                            const timeline = getFormContractTimeline();
                            const newOverrides = { ...formInstallmentsOverride };
                            timeline.forEach(item => {
                              const numStr = String(item.number);
                              const isLimit = item.number <= limit;
                              newOverrides[numStr] = {
                                ...(newOverrides[numStr] || {}),
                                isPaid: isLimit,
                                paidAt: isLimit ? item.dueDate : undefined
                               };
                            });
                            setFormInstallmentsOverride(newOverrides);
                          }
                        }}
                        className="ml-auto px-2 py-1 bg-emerald-600 text-white rounded-lg text-[9px] font-bold hover:bg-emerald-700 transition cursor-pointer"
                      >
                        Aplicar
                      </button>
                    </div>

                    {/* Copy-Paste Importer Section */}
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wide flex items-center gap-1">
                          📋 Importar Histórico de Parcelas (Copiar/Colar)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setShowImportArea(!showImportArea);
                            setImportResult(null);
                          }}
                          className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer"
                        >
                          {showImportArea ? 'Recolher Painel' : 'Abrir Painel de Importação'}
                        </button>
                      </div>

                      {showImportArea ? (
                        <div className="space-y-2 mt-1 pt-1 border-t border-slate-150">
                          <p className="text-[9px] text-slate-500 leading-normal">
                            Abra sua tabela antiga, <strong>copie as colunas (Parcela, Vencimento, Status, Valor)</strong> e cole no campo abaixo. O sistema identificará automaticamente juros/obra, parcelas pagas/liquidadas e datas de vencimento.
                          </p>
                          <textarea
                            rows={3}
                            placeholder="Cole aqui as linhas. Exemplo:&#10;1 / 36   16/09/2025   LIQUIDADO   R$ 86,98&#10;12 / 36  16/08/2026   PENDENTE    R$ 130,34"
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            className="w-full text-[11px] font-mono border border-slate-200 rounded-lg p-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 bg-slate-50"
                          />
                          <div className="flex justify-between items-center gap-2">
                            <div className="max-w-[70%]">
                              {importResult && (
                                <span className={`text-[10px] font-bold block leading-tight ${importResult.success ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  {importResult.success 
                                    ? `✓ ${importResult.count} parcelas importadas/atualizadas com sucesso!` 
                                    : `✗ ${importResult.error}`}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handlePasteImport(importText)}
                              className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 transition cursor-pointer shrink-0 shadow-sm"
                            >
                              Aplicar Histórico
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {/* Scrollable list */}
                    <div className="max-h-[250px] overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                      {getFormContractTimeline().map((item) => {
                        const numStr = String(item.number);
                        const isPaid = formInstallmentsOverride[numStr]?.isPaid !== undefined 
                          ? formInstallmentsOverride[numStr].isPaid 
                          : item.isPaid;

                        return (
                          <div key={item.number} className="p-3 flex items-center justify-between hover:bg-slate-50 transition gap-3">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isPaid}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setFormInstallmentsOverride(prev => ({
                                    ...prev,
                                    [numStr]: {
                                      ...(prev[numStr] || {}),
                                      isPaid: checked,
                                      paidAt: checked ? item.dueDate : undefined
                                    }
                                  }));
                                }}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                              />
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-slate-800 text-xs">Parcela {item.number}</span>
                                  {item.isObra && (
                                    <span className="text-[9px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.2 rounded-full border border-amber-200">
                                      Fase Obra
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  Vence em: {item.dueDate.split('-').reverse().join('/')}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="text-right">
                                <span className="text-[11px] font-mono font-bold text-slate-950">
                                  R$ {item.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="block text-[9px] text-slate-400 font-semibold font-mono">
                                  Principal: R$ {item.amortization.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  // Set states to open customize modal for this installment
                                  setOverrideInstallmentNum(item.number);
                                  
                                  // Load existing overrides if any
                                  const ov = formInstallmentsOverride[numStr] || {};
                                  setOverrideAmortization(ov.amortization !== undefined ? String(ov.amortization) : String(item.amortization));
                                  setOverrideInterest(ov.interest !== undefined ? String(ov.interest) : String(item.interest));
                                  setOverrideInsurance(ov.insurance !== undefined ? String(ov.insurance) : String(item.insurance));
                                  setOverrideConstructionFee(ov.constructionFee !== undefined ? String(ov.constructionFee) : String(item.constructionFee));
                                  setOverrideIptu(ov.iptu !== undefined ? String(ov.iptu) : String(item.iptu));
                                  setOverrideCondominio(ov.condominio !== undefined ? String(ov.condominio) : String(item.condominio));
                                  setOverrideReforms(ov.reforms !== undefined ? String(ov.reforms) : String(item.reforms));
                                  setOverrideExtraPaid(ov.extraPaid !== undefined ? String(ov.extraPaid) : String(item.extraPaid));
                                  setOverrideNotes(ov.notes || '');
                                  setOverrideIsPaid(ov.isPaid !== undefined ? ov.isPaid : item.isPaid);
                                  setPropagateFutureChanges(false);
                                }}
                                className="p-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-500 rounded-lg hover:text-slate-800 transition cursor-pointer"
                                title="Customizar valores desta parcela"
                              >
                                <Settings size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Form Footer Actions */}
                  <div className="flex justify-between gap-2 pt-4 border-t border-slate-100">
                    <div>
                      {!editingContract && (
                        <button
                          type="button"
                          onClick={() => setModalStep('choose_type')}
                          className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                        >
                          ← Voltar
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsFormOpen(false)}
                        className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition shadow-md cursor-pointer"
                      >
                        {editingContract ? 'Salvar Alterações' : 'Confirmar e Adicionar'}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: CUSTOMIZE INDIVIDUAL INSTALLMENT OVERRIDES */}
      <AnimatePresence>
        {overrideInstallmentNum !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 flex justify-between items-center shrink-0">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider font-display flex items-center gap-1.5">
                  <Edit2 size={13} className="text-indigo-600" />
                  Customizar Parcela #{overrideInstallmentNum}
                </h3>
                <button
                  onClick={() => setOverrideInstallmentNum(null)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto">
                <p className="text-[10px] text-slate-500 leading-normal">
                  Insira os valores reais aplicados para esta parcela. Deixe em branco para usar o padrão simulado.
                </p>

                {/* 1. Base Values Section */}
                <div className="bg-slate-50 p-3.5 rounded-2xl space-y-3 border border-slate-100">
                  <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wide block">
                    {(activeContract?.contractType || contractType) === 'financing' ? 'Composição da Parcela' : 'Valor da Parcela'}
                  </span>
                  
                  {(activeContract?.contractType || contractType) === 'financing' ? (
                    <div className="grid grid-cols-3 gap-2">
                      {/* Amortization */}
                      <div className="flex flex-col space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Amortização</label>
                        <input
                          type="number"
                          placeholder={activeInstallmentItem ? activeInstallmentItem.amortization.toFixed(2) : 'Padrão'}
                          value={overrideAmortization}
                          onChange={(e) => setOverrideAmortization(e.target.value)}
                          className="border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Interest */}
                      <div className="flex flex-col space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Juros</label>
                        <input
                          type="number"
                          placeholder={activeInstallmentItem ? activeInstallmentItem.interest.toFixed(2) : 'Padrão'}
                          value={overrideInterest}
                          onChange={(e) => setOverrideInterest(e.target.value)}
                          className="border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Insurance */}
                      <div className="flex flex-col space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Seguro</label>
                        <input
                          type="number"
                          placeholder={activeInstallmentItem ? activeInstallmentItem.insurance.toFixed(2) : 'Padrão'}
                          value={overrideInsurance}
                          onChange={(e) => setOverrideInsurance(e.target.value)}
                          className="border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col space-y-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Valor do Boleto / Parcela (R$)</label>
                      <input
                        type="number"
                        placeholder={activeInstallmentItem ? activeInstallmentItem.amortization.toFixed(2) : 'Padrão'}
                        value={overrideAmortization}
                        onChange={(e) => setOverrideAmortization(e.target.value)}
                        className="border border-slate-200 bg-white rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <span className="text-[9px] text-slate-400">
                        Altere este valor caso a parcela tenha sofrido reajuste (Ex: INCC) ou variação.
                      </span>
                    </div>
                  )}
                </div>

                {/* Construction Fee */}
                {(activeContract?.hasKeysHandover || hasKeysHandover || (activeContract?.contractType || contractType) === 'construction') && (
                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] font-bold text-pink-700 uppercase">
                      {(activeContract?.contractType || contractType) === 'construction' ? 'Valor da Parcela de Obra (R$)' : 'Taxa de Obra / Evolução (R$)'}
                    </label>
                    <input
                      type="number"
                      placeholder="Ex: 850.50"
                      value={overrideConstructionFee}
                      onChange={(e) => setOverrideConstructionFee(e.target.value)}
                      className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-pink-500/20"
                    />
                    <span className="text-[9px] text-slate-400">
                      As parcelas de obra são reajustadas mensalmente. Digite o valor real pago ou cobrado este mês.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* IPTU */}
                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">IPTU (R$)</label>
                    <input
                      type="number"
                      placeholder="Ex: 120"
                      value={overrideIptu}
                      onChange={(e) => setOverrideIptu(e.target.value)}
                      className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                    />
                  </div>

                  {/* Condominio */}
                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Condomínio (R$)</label>
                    <input
                      type="number"
                      placeholder="Ex: 350"
                      value={overrideCondominio}
                      onChange={(e) => setOverrideCondominio(e.target.value)}
                      className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Reforms */}
                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Reformas / Melhorias (R$)</label>
                    <input
                      type="number"
                      placeholder="Ex: 1500"
                      value={overrideReforms}
                      onChange={(e) => setOverrideReforms(e.target.value)}
                      className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none"
                    />
                  </div>

                  {/* Extra Amortization */}
                  <div className="flex flex-col space-y-1">
                    <label className="text-[10px] font-bold text-emerald-700 uppercase">Amortização Extra (R$)</label>
                    <input
                      type="number"
                      placeholder="Ex: 5000"
                      value={overrideExtraPaid}
                      onChange={(e) => setOverrideExtraPaid(e.target.value)}
                      className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="flex flex-col space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Observações / Justificativas</label>
                  <textarea
                    placeholder="Adicione notas sobre reformas, adiantamento extraordinário, etc."
                    value={overrideNotes}
                    onChange={(e) => setOverrideNotes(e.target.value)}
                    maxLength={250}
                    rows={2}
                    className="border border-slate-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none resize-none"
                  />
                </div>

                {/* Authorization & Propagation section */}
                <div className="bg-indigo-50/50 p-3.5 rounded-2xl border border-indigo-100/50 space-y-3">
                  <span className="text-[10px] font-black text-indigo-800 uppercase tracking-wide block">Autorização & Propagação</span>
                  
                  {/* Paid / Authorized status */}
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={overrideIsPaid}
                      onChange={(e) => setOverrideIsPaid(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-slate-800">Autorizar / Marcar como Paga</span>
                      <span className="text-[9px] text-slate-500 leading-normal">Esta parcela foi totalmente liquidada</span>
                    </div>
                  </label>

                  {/* Future propagation */}
                  <label className="flex items-start gap-2.5 cursor-pointer select-none border-t border-indigo-100/30 pt-2.5">
                    <input
                      type="checkbox"
                      checked={propagateFutureChanges}
                      onChange={(e) => setPropagateFutureChanges(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded text-pink-600 focus:ring-pink-500 border-slate-300 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold text-pink-700">Propagar alterações para parcelas futuras</span>
                      <span className="text-[9px] text-slate-500 leading-normal">Propagar todas as alterações deste formulário para todas as próximas parcelas deste contrato</span>
                    </div>
                  </label>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                  <button
                    onClick={() => setOverrideInstallmentNum(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={handleSaveOverrideValues}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition shadow-md cursor-pointer"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Bulk Action Summary Bar */}
      <AnimatePresence>
        {selectedTotals.count > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-4xl px-4"
          >
            <div className="bg-slate-900 text-white rounded-2xl shadow-xl border border-slate-800 p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                {/* Count Circle */}
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-sm font-black border border-indigo-500/30 shrink-0">
                  {selectedTotals.count}
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Parcelas Selecionadas</h4>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-3 gap-y-1 mt-1">
                    <div className="text-lg font-black text-white font-mono">
                      R$ {selectedTotals.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-slate-600 hidden md:inline">|</span>
                    <div className="text-[10px] text-slate-300">
                      Amortização: <span className="font-mono text-slate-100">R$ {selectedTotals.amortization.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="text-[10px] text-slate-300">
                      Juros+Seg: <span className="font-mono text-slate-100">R$ {selectedTotals.interestAndInsurance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {selectedTotals.otherEncargos > 0 && (
                      <div className="text-[10px] text-indigo-400">
                        Encargos: <span className="font-mono text-indigo-300">R$ {selectedTotals.otherEncargos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Bulk Actions Buttons */}
              <div className="flex items-center gap-2 w-full md:w-auto shrink-0 justify-center">
                <button
                  onClick={() => handleBulkTogglePaid(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded-xl transition cursor-pointer shadow-md flex items-center gap-1"
                >
                  <Check size={12} strokeWidth={3} />
                  Pagas
                </button>
                <button
                  onClick={() => handleBulkTogglePaid(false)}
                  className="px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-bold uppercase rounded-xl transition cursor-pointer shadow-md flex items-center gap-1"
                >
                  <Clock size={12} strokeWidth={3} />
                  Pendentes
                </button>
                <button
                  onClick={() => setSelectedInstallmentNumbers([])}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-bold uppercase rounded-lg transition cursor-pointer border border-slate-700"
                >
                  Limpar ({selectedTotals.count})
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
