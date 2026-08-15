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
  writeBatch 
} from 'firebase/firestore';
import { IncomeSource, IncomeOccurrence } from '../types';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Archive, 
  ArchiveRestore, 
  Calendar, 
  DollarSign, 
  Building, 
  TrendingUp, 
  Clock, 
  FileText, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  AlertCircle, 
  X, 
  ChevronRight, 
  RefreshCw,
  Sliders,
  CheckSquare,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateOccurrencesForSource, formatDate } from '../utils/income';

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

interface ControleRendaTabProps {
  userId: string;
  currentMonth: string; // YYYY-MM
  hideValues?: boolean;
}

export default function ControleRendaTab({ userId, currentMonth, hideValues = false }: ControleRendaTabProps) {
  // State for Fontes de Renda and Ocorrências
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [occurrences, setOccurrences] = useState<IncomeOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Deletion state
  const [sourceToDelete, setSourceToDelete] = useState<IncomeSource | null>(null);
  
  // Tab/Filter states
  const [showArchived, setShowArchived] = useState(false);
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null);
  
  // Font Fields
  const [sourceName, setSourceName] = useState('');
  const [employer, setEmployer] = useState('');
  const [baseValue, setBaseValue] = useState('');
  const [netValue, setNetValue] = useState('');
  const [startDate, setStartDate] = useState(() => formatDate(new Date()));
  const [endDate, setEndDate] = useState('');
  const [transmissionRule, setTransmissionRule] = useState<'5th_working_day' | 'last_day' | 'specific_day'>('5th_working_day');
  const [specificDay, setSpecificDay] = useState('10');
  const [isSplit, setIsSplit] = useState(false);
  const [splitPercentage, setSplitPercentage] = useState('40');
  const [splitDay, setSplitDay] = useState('20');
  const [finalDay, setFinalDay] = useState('5');

  // Benefícios Extras / Bônus Form Fields
  const [hasThirteenth, setHasThirteenth] = useState(false);
  const [thirteenthPaymentType, setThirteenthPaymentType] = useState<'one_installment' | 'two_installments'>('two_installments');
  const [thirteenthFirstMonth, setThirteenthFirstMonth] = useState('11'); // Nov
  const [thirteenthSecondMonth, setThirteenthSecondMonth] = useState('12'); // Dec
  const [thirteenthSingleMonth, setThirteenthSingleMonth] = useState('12'); // Dec

  const [hasFourteenth, setHasFourteenth] = useState(false);
  const [fourteenthMonth, setFourteenthMonth] = useState('12'); // Dec
  const [fourteenthValue, setFourteenthValue] = useState('');

  const [hasPLR, setHasPLR] = useState(false);
  const [plrPaymentType, setPlrPaymentType] = useState<'one_installment' | 'two_installments'>('one_installment');
  const [plrMonth1, setPlrMonth1] = useState('3'); // March
  const [plrValue1, setPlrValue1] = useState('');
  const [plrMonth2, setPlrMonth2] = useState('9'); // September
  const [plrValue2, setPlrValue2] = useState('');

  // Occurrence editor states
  const [editingOccurrence, setEditingOccurrence] = useState<IncomeOccurrence | null>(null);
  const [occReceivedAmount, setOccReceivedAmount] = useState('');
  const [occIsReceived, setOccIsReceived] = useState(false);
  const [occNotes, setOccNotes] = useState('');
  const [propagateFuture, setPropagateFuture] = useState(true);

  // Mass action selection state (occurrence IDs selected inside accordion)
  const [selectedOccs, setSelectedOccs] = useState<Record<string, string[]>>({}); // sourceId -> array of occurrenceIds

  // Fetch Sources & Occurrences in real-time
  useEffect(() => {
    if (!userId) return;
    setLoading(true);

    const qSources = query(
      collection(db, 'income_sources'),
      where('userId', '==', userId)
    );

    const unsubscribeSources = onSnapshot(qSources, (snapshot) => {
      const srcList: IncomeSource[] = [];
      snapshot.forEach((docSnap) => {
        srcList.push({ id: docSnap.id, ...docSnap.data() } as IncomeSource);
      });
      setSources(srcList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'income_sources');
    });

    const qOccs = query(
      collection(db, 'income_occurrences'),
      where('userId', '==', userId)
    );

    const unsubscribeOccs = onSnapshot(qOccs, (snapshot) => {
      const occList: IncomeOccurrence[] = [];
      snapshot.forEach((docSnap) => {
        occList.push({ id: docSnap.id, ...docSnap.data() } as IncomeOccurrence);
      });
      setOccurrences(occList);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'income_occurrences');
    });

    return () => {
      unsubscribeSources();
      unsubscribeOccs();
    };
  }, [userId]);

  // Open Form for Adding New Source
  const handleNewSource = () => {
    setEditingSource(null);
    setSourceName('');
    setEmployer('');
    setBaseValue('');
    setNetValue('');
    setStartDate(formatDate(new Date()));
    setEndDate('');
    setTransmissionRule('5th_working_day');
    setSpecificDay('10');
    setIsSplit(false);
    setSplitPercentage('40');
    setSplitDay('20');
    setFinalDay('5');

    // Reset benefits
    setHasThirteenth(false);
    setThirteenthPaymentType('two_installments');
    setThirteenthFirstMonth('11');
    setThirteenthSecondMonth('12');
    setThirteenthSingleMonth('12');
    setHasFourteenth(false);
    setFourteenthMonth('12');
    setFourteenthValue('');
    setHasPLR(false);
    setPlrPaymentType('one_installment');
    setPlrMonth1('3');
    setPlrValue1('');
    setPlrMonth2('9');
    setPlrValue2('');

    setIsFormOpen(true);
  };

  // Open Form for Editing Existing Source
  const handleEditSource = (src: IncomeSource) => {
    setEditingSource(src);
    setSourceName(src.name);
    setEmployer(src.employer || '');
    setBaseValue(src.baseValue.toString());
    setNetValue(src.netValue ? src.netValue.toString() : '');
    setStartDate(src.startDate);
    setEndDate(src.endDate || '');
    setTransmissionRule(src.transmissionRule);
    setSpecificDay((src.specificDay || 10).toString());
    setIsSplit(src.isSplit);
    setSplitPercentage((src.splitPercentage || 40).toString());
    setSplitDay((src.splitDay || 20).toString());
    setFinalDay((src.finalDay || 5).toString());

    // Populate benefits
    setHasThirteenth(!!src.hasThirteenth);
    setThirteenthPaymentType(src.thirteenthPaymentType || 'two_installments');
    setThirteenthFirstMonth((src.thirteenthFirstMonth || 11).toString());
    setThirteenthSecondMonth((src.thirteenthSecondMonth || 12).toString());
    setThirteenthSingleMonth((src.thirteenthSingleMonth || 12).toString());
    setHasFourteenth(!!src.hasFourteenth);
    setFourteenthMonth((src.fourteenthMonth || 12).toString());
    setFourteenthValue(src.fourteenthValue ? src.fourteenthValue.toString() : '');
    setHasPLR(!!src.hasPLR);
    setPlrPaymentType(src.plrPaymentType || 'one_installment');
    setPlrMonth1((src.plrMonth1 || 3).toString());
    setPlrValue1(src.plrValue1 ? src.plrValue1.toString() : '');
    setPlrMonth2((src.plrMonth2 || 9).toString());
    setPlrValue2(src.plrValue2 ? src.plrValue2.toString() : '');

    setIsFormOpen(true);
  };

  // Save/Update Source & Project Occurrences
  const handleSaveSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    try {
      const sourceId = editingSource?.id || doc(collection(db, 'income_sources')).id;
      
      const newSource: IncomeSource = {
        id: sourceId,
        name: sourceName,
        employer,
        baseValue: parseFloat(baseValue),
        netValue: netValue ? parseFloat(netValue) : undefined,
        startDate,
        endDate: endDate || undefined,
        transmissionRule,
        specificDay: transmissionRule === 'specific_day' ? parseInt(specificDay) : undefined,
        isSplit,
        splitPercentage: isSplit ? parseInt(splitPercentage) : undefined,
        splitDay: isSplit ? parseInt(splitDay) : undefined,
        finalDay: isSplit ? parseInt(finalDay) : undefined,
        userId,
        isArchived: editingSource ? editingSource.isArchived : false,

        // Benefícios
        hasThirteenth,
        thirteenthPaymentType: hasThirteenth ? thirteenthPaymentType : undefined,
        thirteenthFirstMonth: (hasThirteenth && thirteenthPaymentType === 'two_installments') ? parseInt(thirteenthFirstMonth) : undefined,
        thirteenthSecondMonth: (hasThirteenth && thirteenthPaymentType === 'two_installments') ? parseInt(thirteenthSecondMonth) : undefined,
        thirteenthSingleMonth: (hasThirteenth && thirteenthPaymentType === 'one_installment') ? parseInt(thirteenthSingleMonth) : undefined,

        hasFourteenth,
        fourteenthMonth: hasFourteenth ? parseInt(fourteenthMonth) : undefined,
        fourteenthValue: (hasFourteenth && fourteenthValue) ? parseFloat(fourteenthValue) : undefined,

        hasPLR,
        plrPaymentType: hasPLR ? plrPaymentType : undefined,
        plrMonth1: hasPLR ? parseInt(plrMonth1) : undefined,
        plrValue1: (hasPLR && plrValue1) ? parseFloat(plrValue1) : undefined,
        plrMonth2: (hasPLR && plrPaymentType === 'two_installments') ? parseInt(plrMonth2) : undefined,
        plrValue2: (hasPLR && plrPaymentType === 'two_installments' && plrValue2) ? parseFloat(plrValue2) : undefined,
      };

      // Save Source
      await setDoc(doc(db, 'income_sources', sourceId), cleanUndefined(newSource));

      // Calculate Projections
      const projectedOccs = generateOccurrencesForSource(newSource, userId);

      // Merge existing occurrences to keep paid status and manual notes/adjustments
      const existingForSource = occurrences.filter(o => o.incomeSourceId === sourceId);
      
      const finalOccs = projectedOccs.map(proj => {
        // Find if we already have an occurrence in the same month, split-role (isVale), and occurrenceType
        const projType = proj.occurrenceType || 'salary';
        const match = existingForSource.find(ext => {
          const extType = ext.occurrenceType || 'salary';
          return ext.month === proj.month && ext.isVale === proj.isVale && extType === projType;
        });
        if (match) {
          return {
            ...proj,
            id: match.id,
            isReceived: match.isReceived,
            receivedAmount: match.isReceived ? match.receivedAmount : proj.receivedAmount,
            notes: match.notes,
          };
        } else {
          return {
            ...proj,
            id: doc(collection(db, 'income_occurrences')).id
          };
        }
      });

      // Write in Batch
      const batch = writeBatch(db);

      // Delete any occurrences of this source that are NO LONGER within valid dates (e.g., if end date changed)
      const validKeys = projectedOccs.map(o => `${o.month}_${o.isVale}_${o.occurrenceType || 'salary'}`);
      existingForSource.forEach(ext => {
        const key = `${ext.month}_${ext.isVale}_${ext.occurrenceType || 'salary'}`;
        if (!validKeys.includes(key)) {
          batch.delete(doc(db, 'income_occurrences', ext.id));
        }
      });

      // Write projected occurrences
      finalOccs.forEach(occ => {
        batch.set(doc(db, 'income_occurrences', occ.id), cleanUndefined(occ));
      });

      await batch.commit();
      setIsFormOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'income_sources');
    }
  };

  // Archive / Unarchive Source
  const handleToggleArchive = async (src: IncomeSource) => {
    try {
      await setDoc(doc(db, 'income_sources', src.id), {
        ...src,
        isArchived: !src.isArchived,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'income_sources');
    }
  };

  // Delete Source & its Occurrences
  const confirmDeleteSource = async () => {
    if (!sourceToDelete) return;
    const sourceId = sourceToDelete.id;

    try {
      // Delete source
      await deleteDoc(doc(db, 'income_sources', sourceId));

      // Batch delete associated occurrences
      const associated = occurrences.filter(o => o.incomeSourceId === sourceId);
      const batch = writeBatch(db);
      associated.forEach(o => {
        batch.delete(doc(db, 'income_occurrences', o.id));
      });
      await batch.commit();

      if (expandedSourceId === sourceId) {
        setExpandedSourceId(null);
      }
      setSourceToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'income_sources');
    }
  };

  // Open intelligence adjustments modal
  const handleOpenOccEditor = (occ: IncomeOccurrence) => {
    setEditingOccurrence(occ);
    setOccReceivedAmount(occ.receivedAmount.toString());
    setOccIsReceived(occ.isReceived);
    setOccNotes(occ.notes || '');
    setPropagateFuture(true);
  };

  // Save Occurrence modifications
  const handleSaveOccAdjustment = async () => {
    if (!editingOccurrence) return;

    try {
      const finalAmount = parseFloat(occReceivedAmount);
      
      const updatedOcc: IncomeOccurrence = {
        ...editingOccurrence,
        isReceived: occIsReceived,
        receivedAmount: finalAmount,
        notes: occNotes,
        updatedAt: new Date().toISOString()
      };

      // Save this single occurrence
      await setDoc(doc(db, 'income_occurrences', editingOccurrence.id), cleanUndefined(updatedOcc));

      // Propagation logic: If checked and user wants to propagate this value change to all future occurrences
      if (propagateFuture) {
        const parentSource = sources.find(s => s.id === editingOccurrence.incomeSourceId);
        if (parentSource) {
          // 1. If it's a split source, propagate proportionally or directly. 
          // Best is to update the Base Value of the Source itself, and then regenerate future unpaid occurrences!
          let newBaseValue = parentSource.baseValue;
          if (parentSource.isSplit) {
            const valePct = parentSource.splitPercentage || 40;
            const balancePct = 100 - valePct;
            if (editingOccurrence.isVale) {
              // updatedOcc is Vale, so baseValue * valePct / 100 = finalAmount => baseValue = finalAmount * 100 / valePct
              newBaseValue = (finalAmount * 100) / valePct;
            } else {
              // updatedOcc is Balance => baseValue = finalAmount * 100 / balancePct
              newBaseValue = (finalAmount * 100) / balancePct;
            }
          } else {
            newBaseValue = finalAmount;
          }

          // Round base value
          newBaseValue = Number(newBaseValue.toFixed(2));

          // Save new source base value
          const updatedSource = {
            ...parentSource,
            baseValue: newBaseValue,
            updatedAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'income_sources', parentSource.id), cleanUndefined(updatedSource));

          // Regenerate only future unpaid occurrences!
          const batch = writeBatch(db);
          const occurrencesToUpdate = occurrences.filter(o => 
            o.incomeSourceId === parentSource.id && 
            !o.isReceived && 
            o.expectedDate > editingOccurrence.expectedDate
          );

          occurrencesToUpdate.forEach(occToUp => {
            let nextAmount = newBaseValue;
            if (parentSource.isSplit) {
              const valePct = parentSource.splitPercentage || 40;
              const balancePct = 100 - valePct;
              nextAmount = occToUp.isVale 
                ? Number(((newBaseValue * valePct) / 100).toFixed(2))
                : Number(((newBaseValue * balancePct) / 100).toFixed(2));
            }
            batch.set(doc(db, 'income_occurrences', occToUp.id), {
              ...occToUp,
              baseAmount: nextAmount,
              receivedAmount: nextAmount,
              updatedAt: new Date().toISOString()
            });
          });

          await batch.commit();
        }
      }

      setEditingOccurrence(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'income_occurrences');
    }
  };

  // Mass action: Select/Deselect occurrence in accordion
  const handleToggleOccSelection = (sourceId: string, occId: string) => {
    setSelectedOccs(prev => {
      const current = prev[sourceId] || [];
      const updated = current.includes(occId)
        ? current.filter(id => id !== occId)
        : [...current, occId];
      return { ...prev, [sourceId]: updated };
    });
  };

  // Mass mark selected as received
  const handleMassMarkReceived = async (sourceId: string) => {
    const selectedIds = selectedOccs[sourceId] || [];
    if (selectedIds.length === 0) return;

    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        const occ = occurrences.find(o => o.id === id);
        if (occ) {
          batch.set(doc(db, 'income_occurrences', id), {
            ...occ,
            isReceived: true,
            updatedAt: new Date().toISOString()
          });
        }
      });
      await batch.commit();
      
      // Clear selection
      setSelectedOccs(prev => ({ ...prev, [sourceId]: [] }));
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'income_occurrences');
    }
  };

  // Filter sources by active vs archived
  const filteredSources = useMemo(() => {
    return sources.filter(s => s.isArchived === showArchived);
  }, [sources, showArchived]);

  // Compute stats for current year
  const yearlyStats = useMemo(() => {
    const targetOccs = occurrences.filter(o => {
      const year = parseInt(o.expectedDate.split('-')[0]);
      return year === selectedYear;
    });

    const activeSourceIds = sources.filter(s => !s.isArchived).map(s => s.id);
    const activeOccs = targetOccs.filter(o => activeSourceIds.includes(o.incomeSourceId));

    const totalProjected = activeOccs.reduce((sum, o) => sum + o.baseAmount, 0);
    const totalReceived = activeOccs.reduce((sum, o) => sum + (o.isReceived ? o.receivedAmount : 0), 0);
    const totalPending = activeOccs.reduce((sum, o) => sum + (!o.isReceived ? o.baseAmount : 0), 0);

    return {
      totalProjected,
      totalReceived,
      totalPending,
      occsCount: activeOccs.length,
      receivedCount: activeOccs.filter(o => o.isReceived).length,
    };
  }, [occurrences, sources, selectedYear]);

  // Dynamic calculation for real-time future reajuste info in adjustment modal
  const calculatedFutureInfo = useMemo(() => {
    if (!editingOccurrence) return null;
    const parentSource = sources.find(s => s.id === editingOccurrence.incomeSourceId);
    if (!parentSource) return null;

    const parsedAmount = parseFloat(occReceivedAmount) || 0;
    
    let newBaseValue = parentSource.baseValue;
    if (parentSource.isSplit) {
      const valePct = parentSource.splitPercentage || 40;
      const balancePct = 100 - valePct;
      if (editingOccurrence.isVale) {
        newBaseValue = (parsedAmount * 100) / valePct;
      } else {
        newBaseValue = (parsedAmount * 100) / balancePct;
      }
    } else {
      newBaseValue = parsedAmount;
    }
    newBaseValue = Number(newBaseValue.toFixed(2));

    let futureVale = 0;
    let futureBalance = 0;
    if (parentSource.isSplit) {
      const valePct = parentSource.splitPercentage || 40;
      futureVale = Number(((newBaseValue * valePct) / 100).toFixed(2));
      futureBalance = Number(((newBaseValue * (100 - valePct)) / 100).toFixed(2));
    }

    return {
      newBaseValue,
      futureVale,
      futureBalance,
      isSplit: parentSource.isSplit
    };
  }, [editingOccurrence, sources, occReceivedAmount]);

  // Accordion details per source for the selected year (Dossiê por Ativo)
  const getSourceAccordionDetails = (sourceId: string) => {
    const source = sources.find(s => s.id === sourceId);
    if (!source) return { months: [], totalAccumulated: 0 };

    const sourceOccs = occurrences.filter(o => 
      o.incomeSourceId === sourceId && 
      parseInt(o.expectedDate.split('-')[0]) === selectedYear
    ).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));

    const totalAccumulated = sourceOccs
      .filter(o => o.isReceived)
      .reduce((sum, o) => sum + o.receivedAmount, 0);

    return {
      months: sourceOccs,
      totalAccumulated
    };
  };

  return (
    <div className="space-y-6">
      {/* Title & Stats Grid */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="text-[10px] bg-indigo-50 text-indigo-600 font-black px-2.5 py-1 rounded-full uppercase tracking-widest">
            Motor de Capital
          </span>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 font-display mt-1.5 uppercase tracking-tight">
            Controle de Renda
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Projete entradas reais, automatize datas e ajuste recebimentos líquidos.
          </p>
        </div>

        {/* Year Filter & Add Source */}
        <div className="flex flex-wrap gap-2.5 items-center">
          <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[new Date().getFullYear(), new Date().getFullYear() + 1].map(year => (
              <button
                key={year}
                onClick={() => setSelectedYear(year)}
                className={`px-3 py-1 text-xs font-black rounded-lg transition ${
                  selectedYear === year ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {year}
              </button>
            ))}
          </div>

          <button
            onClick={handleNewSource}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-xs font-black px-4 py-2.5 rounded-xl hover:bg-indigo-700 shadow-md hover:shadow-indigo-500/10 transition cursor-pointer"
          >
            <Plus size={14} />
            Nova Fonte de Renda
          </button>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Projected */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">
              Projeção Anual ({selectedYear})
            </span>
            <span className="text-xl font-mono font-black text-slate-900 block">
              R$ {yearlyStats.totalProjected.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-500 font-semibold block">
              Soma total bruta projetada em contrato
            </span>
          </div>
          <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl">
            <TrendingUp size={20} />
          </div>
        </div>

        {/* Total Realized (Líquido) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] text-emerald-600 font-black uppercase tracking-wider block">
              Líquido Realizado ({selectedYear})
            </span>
            <span className="text-xl font-mono font-black text-emerald-600 block">
              R$ {yearlyStats.totalReceived.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-500 font-semibold block">
              {yearlyStats.receivedCount} de {yearlyStats.occsCount} ocorrências recebidas
            </span>
          </div>
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Check size={20} />
          </div>
        </div>

        {/* Total Pending */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[9px] text-amber-600 font-black uppercase tracking-wider block">
              A Receber / Projetado
            </span>
            <span className="text-xl font-mono font-black text-amber-600 block">
              R$ {yearlyStats.totalPending.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-[10px] text-slate-500 font-semibold block">
              Capital ainda pendente de depósito
            </span>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl">
            <Clock size={20} />
          </div>
        </div>
      </div>

      {/* Main List & Accordions */}
      <div className="space-y-4">
        {/* Filter Bar */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">
            {showArchived ? 'Fontes de Renda Arquivadas' : 'Fontes de Renda Ativas'}
          </h3>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition"
          >
            {showArchived ? (
              <>
                <ArchiveRestore size={14} />
                Ver Fontes Ativas
              </>
            ) : (
              <>
                <Archive size={14} />
                Ver Fontes Arquivadas
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
            <RefreshCw size={24} className="animate-spin text-indigo-600 mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-bold">Carregando fontes de renda...</p>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
            <TrendingUp size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-xs text-slate-600 font-black">Nenhuma fonte de renda cadastrada nesta visualização.</p>
            <p className="text-[10px] text-slate-400 mt-1 max-w-xs mx-auto">
              {showArchived ? 'Você não arquivou nenhuma fonte ainda.' : 'Adicione suas fontes de renda contratadas para ver as projeções do calendário.'}
            </p>
            {!showArchived && (
              <button
                onClick={handleNewSource}
                className="mt-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[10px] font-black px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Cadastrar Primeira Fonte
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredSources.map((src) => {
              const isExpanded = expandedSourceId === src.id;
              const { months, totalAccumulated } = getSourceAccordionDetails(src.id);
              const selectedCount = selectedOccs[src.id]?.length || 0;

              return (
                <div key={src.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  {/* Accordion Trigger Header */}
                  <div 
                    onClick={() => setExpandedSourceId(isExpanded ? null : src.id)}
                    className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                        <Building size={18} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-slate-900 font-display flex items-center gap-1.5">
                          {src.name}
                          {src.isSplit && (
                            <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-md font-black">
                              SPLIT ({src.splitPercentage}% / {100 - (src.splitPercentage || 40)}%)
                            </span>
                          )}
                        </h4>
                        <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                          {src.employer ? `${src.employer} • ` : ''} Base Contrato: R$ {src.baseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 pt-3 md:pt-0 border-dashed border-slate-100">
                      {/* Accordion Meta Summary */}
                      <div className="text-left md:text-right">
                        <span className="text-[8px] text-slate-400 font-black uppercase tracking-wider block">
                          Acumulado Realizado ({selectedYear})
                        </span>
                        <span className="text-sm font-mono font-black text-emerald-600">
                          R$ {totalAccumulated.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Edit Buttons */}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditSource(src); }}
                          className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-indigo-600 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleArchive(src); }}
                          className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-amber-600 rounded-lg transition"
                          title={src.isArchived ? 'Reativar' : 'Arquivar'}
                        >
                          {src.isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSourceToDelete(src); }}
                          className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                        <div className="ml-2 text-slate-400">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Accordion Expanded Body */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: 'auto' }}
                        exit={{ height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="border-t border-slate-100 bg-slate-50/40 overflow-hidden"
                      >
                        <div className="p-5 space-y-4">
                          {/* Subtitle / Mass Action Banner */}
                          <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                            <span className="text-xs text-slate-500 font-bold flex items-center gap-1.5">
                              <Info size={14} className="text-indigo-500" />
                              Extrato de ocorrências para o ano de {selectedYear}. Selecione para marcar recebimento em massa.
                            </span>

                            {selectedCount > 0 && (
                              <button
                                onClick={() => handleMassMarkReceived(src.id)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black px-3 py-1.5 rounded-lg shadow-sm transition flex items-center gap-1 cursor-pointer"
                              >
                                <Check size={12} />
                                Receber {selectedCount} Parcelas
                              </button>
                            )}
                          </div>

                          {/* Occurrence Table Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {months.length === 0 ? (
                              <div className="col-span-2 text-center py-6 text-slate-400 text-xs font-semibold">
                                Nenhuma ocorrência projetada para este ativo em {selectedYear}.
                              </div>
                            ) : (
                              months.map((occ) => {
                                const isSelected = (selectedOccs[src.id] || []).includes(occ.id);
                                return (
                                  <div 
                                    key={occ.id}
                                    className={`p-4 rounded-xl border transition-all flex justify-between items-center ${
                                      occ.isReceived 
                                        ? 'bg-emerald-50/20 border-emerald-100/50 hover:bg-emerald-50/40' 
                                        : 'bg-white border-slate-100 hover:border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      {/* Selection Box for mass actions */}
                                      {!occ.isReceived ? (
                                        <button
                                          onClick={() => handleToggleOccSelection(src.id, occ.id)}
                                          className="text-slate-400 hover:text-indigo-600 transition"
                                        >
                                          {isSelected ? (
                                            <CheckSquare size={16} className="text-indigo-600" />
                                          ) : (
                                            <Square size={16} />
                                          )}
                                        </button>
                                      ) : (
                                        <div className="text-emerald-500 bg-emerald-50 p-1 rounded-full">
                                          <Check size={12} />
                                        </div>
                                      )}

                                      <div>
                                        <span className="block text-xs font-black text-slate-900 font-display">
                                          {occ.description}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 mt-0.5">
                                          <Calendar size={10} /> Projeção: {occ.expectedDate.split('-').reverse().join('/')}
                                        </span>
                                        {occ.notes && (
                                          <span className="block text-[9px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded mt-1 border border-slate-200/50 max-w-xs truncate">
                                            Justificativa: {occ.notes}
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Action & Amount */}
                                    <div className="text-right flex flex-col items-end gap-1.5">
                                      <div className="space-y-0.5">
                                        <span className={`block font-mono text-xs font-black ${occ.isReceived ? 'text-emerald-600' : 'text-slate-950'}`}>
                                          R$ {occ.receivedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                        {occ.receivedAmount !== occ.baseAmount && (
                                          <span className="block text-[8px] text-slate-400 font-black line-through">
                                            Contrato: R$ {occ.baseAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </span>
                                        )}
                                      </div>

                                      <button
                                        onClick={() => handleOpenOccEditor(occ)}
                                        className="text-[9px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-black px-2 py-1 rounded-md transition cursor-pointer"
                                      >
                                        Ajustar
                                      </button>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Form Modal for Source Addition / Edition */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsFormOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full relative max-h-[90vh] overflow-y-auto z-10"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-base font-black text-slate-900 font-display flex items-center gap-1.5 uppercase tracking-wide">
                  {editingSource ? <Edit2 size={18} className="text-indigo-600" /> : <Plus size={18} className="text-indigo-600" />}
                  {editingSource ? 'Editar Fonte de Renda' : 'Cadastrar Fonte de Renda'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveSource} className="space-y-5">
                {/* 1. ATIVOS PAGADORES (FONTES DE RENDA) */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                  <h4 className="text-[10px] text-indigo-600 font-black uppercase tracking-wider">
                    1. Identificação Contratual
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Identification */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Identificação / Fonte</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Salário, Aluguel Recebido, Freelancer..."
                        value={sourceName}
                        onChange={(e) => setSourceName(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    {/* Employer */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Empresa / Contratante</label>
                      <input
                        type="text"
                        placeholder="Ex: Google Inc, Empresa XYZ..."
                        value={employer}
                        onChange={(e) => setEmployer(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    {/* Base Value */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Salário Bruto Contratual (R$)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-slate-400 font-medium">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          required
                          placeholder="1105,23"
                          value={baseValue}
                          onChange={(e) => setBaseValue(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Usado de base para o Vale de 40%</span>
                    </div>

                    {/* Net Value */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Salário Líquido Mensal (R$)</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-slate-400 font-medium">R$</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="1018,34"
                          value={netValue}
                          onChange={(e) => setNetValue(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Líquido total do mês após descontos</span>
                    </div>

                    {/* Start Date */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Início da Vigência</label>
                      <input
                        type="date"
                        required
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>

                    {/* End Date (Optional) */}
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Fim da Vigência (Opcional)</label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                </div>

                {/* 2. REGRAS DE TRANSMISSÃO */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                  <h4 className="text-[10px] text-indigo-600 font-black uppercase tracking-wider">
                    2. Regra de Transmissão (Automação de Calendário)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex flex-col space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">Protocolo de Data</label>
                      <select
                        value={transmissionRule}
                        onChange={(e) => setTransmissionRule(e.target.value as any)}
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                      >
                        <option value="5th_working_day">5º Dia Útil (Ignora Finais de Semana e Feriados)</option>
                        <option value="last_day">Último Dia do Mês</option>
                        <option value="specific_day">Dia Específico do Mês</option>
                      </select>
                    </div>

                    {transmissionRule === 'specific_day' && (
                      <div className="flex flex-col space-y-1.5">
                        <label className="text-xs font-semibold text-slate-600">Qual dia fixo?</label>
                        <select
                          value={specificDay}
                          onChange={(e) => setSpecificDay(e.target.value)}
                          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                        >
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>Todo dia {d}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. PROTOCOLO DE SPLIT */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] text-indigo-600 font-black uppercase tracking-wider">
                      3. Protocolo de Split (Adiantamento / Vale)
                    </h4>
                    <label className="flex items-center space-x-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isSplit}
                        onChange={(e) => setIsSplit(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-700">Ativar Split</span>
                    </label>
                  </div>

                  {isSplit && (
                    <div className="space-y-4 border-t border-slate-200/50 pt-4 animate-slide-up">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Percentages */}
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Porcentagem do Vale (%)</label>
                          <input
                            type="number"
                            min="1"
                            max="99"
                            required
                            value={splitPercentage}
                            onChange={(e) => setSplitPercentage(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
                          <span className="text-[10px] text-slate-400 font-bold block mt-1">
                            Saldo final será {100 - parseInt(splitPercentage || '40')}%
                          </span>
                        </div>

                        {/* Vale Day */}
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Dia do Vale (Adiantamento)</label>
                          <select
                            value={splitDay}
                            onChange={(e) => setSplitDay(e.target.value)}
                            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                          >
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                              <option key={d} value={d}>Dia {d}</option>
                            ))}
                          </select>
                        </div>

                        {/* Final Day (Only if rule is specific_day, otherwise follows rule) */}
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-xs font-semibold text-slate-600">Dia do Saldo Final</label>
                          {transmissionRule === 'specific_day' ? (
                            <select
                              value={finalDay}
                              onChange={(e) => setFinalDay(e.target.value)}
                              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
                            >
                              {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                <option key={d} value={d}>Dia {d}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="bg-slate-100 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-500 font-semibold select-none">
                              Seguirá: {transmissionRule === '5th_working_day' ? '5º Dia Útil' : 'Último Dia'}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Live Salary Breakdown Simulation */}
                      {baseValue && (
                        <div className="mt-3 p-3.5 bg-indigo-50/80 border border-indigo-100 rounded-xl space-y-1.5 text-xs">
                          <span className="font-black text-indigo-950 uppercase text-[10px] tracking-wider block">
                            💡 Simulação de Pagamento do Salário:
                          </span>
                          <div className="text-[11px] text-slate-700 space-y-1 font-medium">
                            <p>
                              • <strong>Dia {splitDay || 20} (Vale {splitPercentage || 40}% do Bruto):</strong>{' '}
                              <span className="font-mono font-bold text-indigo-700">
                                R$ {((parseFloat(baseValue || '0') * (parseInt(splitPercentage || '40') / 100))).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </p>
                            <p>
                              • <strong>5º Dia Útil (Saldo Final Líquido):</strong>{' '}
                              <span className="font-mono font-bold text-emerald-700">
                                R$ {
                                  netValue
                                    ? (parseFloat(netValue) - (parseFloat(baseValue || '0') * (parseInt(splitPercentage || '40') / 100))).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                    : ((parseFloat(baseValue || '0') * ((100 - parseInt(splitPercentage || '40')) / 100))).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                }
                              </span>{' '}
                              {netValue ? `(R$ ${parseFloat(netValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} Líquido - R$ ${((parseFloat(baseValue || '0') * (parseInt(splitPercentage || '40') / 100))).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} Vale)` : '(Sem valor líquido informado)'}
                            </p>
                            {netValue && (
                              <p className="text-slate-800 font-bold border-t border-indigo-100/80 pt-1">
                                • Total Líquido do Mês: R$ {parseFloat(netValue).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. BENEFÍCIOS EXTRAS E BÔNUS */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-4">
                  <h4 className="text-[10px] text-indigo-600 font-black uppercase tracking-wider">
                    4. Benefícios Extras e Bônus (13º, 14º e PLR)
                  </h4>

                  {/* 13º Salário */}
                  <div className="border-t border-slate-200/50 pt-3">
                    <label className="flex items-center space-x-2 cursor-pointer select-none mb-3">
                      <input
                        type="checkbox"
                        checked={hasThirteenth}
                        onChange={(e) => setHasThirteenth(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-700">Recebe 13º Salário</span>
                    </label>

                    {hasThirteenth && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3 rounded-lg border border-slate-100 mb-4 animate-slide-up">
                        <div className="flex flex-col space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-semibold text-slate-500">Forma de Pagamento (Regra CLT)</label>
                          <select
                            value={thirteenthPaymentType}
                            onChange={(e) => setThirteenthPaymentType(e.target.value as any)}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                          >
                            <option value="two_installments">2 Parcelas (Metade Adiantada + Saldo em Dezembro)</option>
                            <option value="one_installment">Parcela Única (Integral)</option>
                          </select>
                        </div>

                        {thirteenthPaymentType === 'two_installments' ? (
                          <>
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-[11px] font-semibold text-slate-500">Mês da 1ª Parcela (50%)</label>
                              <select
                                value={thirteenthFirstMonth}
                                onChange={(e) => setThirteenthFirstMonth(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                              >
                                {Array.from({ length: 12 }, (_, i) => (
                                  <option key={i + 1} value={i + 1}>
                                    {MONTH_NAMES_PT[i]} {i + 1 === 11 ? '(Padrão)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-[11px] font-semibold text-slate-500">Mês da 2ª Parcela (50%)</label>
                              <select
                                value={thirteenthSecondMonth}
                                onChange={(e) => setThirteenthSecondMonth(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                              >
                                {Array.from({ length: 12 }, (_, i) => (
                                  <option key={i + 1} value={i + 1}>
                                    {MONTH_NAMES_PT[i]} {i + 1 === 12 ? '(Padrão)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col space-y-1.5 md:col-span-2">
                            <label className="text-[11px] font-semibold text-slate-500">Mês de Pagamento Integral</label>
                            <select
                              value={thirteenthSingleMonth}
                              onChange={(e) => setThirteenthSingleMonth(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                            >
                              {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  {MONTH_NAMES_PT[i]} {i + 1 === 12 ? '(Padrão)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        <p className="text-[9px] text-slate-400 font-bold md:col-span-2 flex items-center gap-1">
                          <Info size={10} className="text-indigo-500 shrink-0" />
                          Regra CLT: 1ª parcela até 30 de Novembro e 2ª parcela até 20 de Dezembro.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* 14º Salário */}
                  <div className="border-t border-slate-200/50 pt-3">
                    <label className="flex items-center space-x-2 cursor-pointer select-none mb-3">
                      <input
                        type="checkbox"
                        checked={hasFourteenth}
                        onChange={(e) => setHasFourteenth(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-700">Recebe 14º Salário</span>
                    </label>

                    {hasFourteenth && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-3 rounded-lg border border-slate-100 mb-4 animate-slide-up">
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500">Mês do Pagamento</label>
                          <select
                            value={fourteenthMonth}
                            onChange={(e) => setFourteenthMonth(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                          >
                            {Array.from({ length: 12 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>
                                {MONTH_NAMES_PT[i]} {i + 1 === 12 ? '(Padrão)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500">Valor do 14º (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Deixe em branco p/ usar o salário base"
                            value={fourteenthValue}
                            onChange={(e) => setFourteenthValue(e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PLR */}
                  <div className="border-t border-slate-200/50 pt-3">
                    <label className="flex items-center space-x-2 cursor-pointer select-none mb-3">
                      <input
                        type="checkbox"
                        checked={hasPLR}
                        onChange={(e) => setHasPLR(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-700">Recebe PLR (Participação nos Lucros)</span>
                    </label>

                    {hasPLR && (
                      <div className="space-y-3 bg-white p-3 rounded-lg border border-slate-100 animate-slide-up">
                        <div className="flex flex-col space-y-1.5">
                          <label className="text-[11px] font-semibold text-slate-500">Periodicidade de Pagamento</label>
                          <select
                            value={plrPaymentType}
                            onChange={(e) => setPlrPaymentType(e.target.value as any)}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                          >
                            <option value="one_installment">Anual (1 Parcela)</option>
                            <option value="two_installments">Semestral (2 Parcelas)</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                          <div className="flex flex-col space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-500">Mês da 1ª Parcela PLR</label>
                            <select
                              value={plrMonth1}
                              onChange={(e) => setPlrMonth1(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                            >
                              {Array.from({ length: 12 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>
                                  {MONTH_NAMES_PT[i]} {i + 1 === 3 ? '(Padrão)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col space-y-1.5">
                            <label className="text-[11px] font-semibold text-slate-500">Valor Estimado 1ª Parcela (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              required
                              placeholder="0,00"
                              value={plrValue1}
                              onChange={(e) => setPlrValue1(e.target.value)}
                              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                            />
                          </div>
                        </div>

                        {plrPaymentType === 'two_installments' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-3">
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-[11px] font-semibold text-slate-500">Mês da 2ª Parcela PLR</label>
                              <select
                                value={plrMonth2}
                                onChange={(e) => setPlrMonth2(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                              >
                                {Array.from({ length: 12 }, (_, i) => (
                                  <option key={i + 1} value={i + 1}>
                                    {MONTH_NAMES_PT[i]} {i + 1 === 9 ? '(Padrão)' : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-col space-y-1.5">
                              <label className="text-[11px] font-semibold text-slate-500">Valor Estimado 2ª Parcela (R$)</label>
                              <input
                                type="number"
                                step="0.01"
                                required
                                placeholder="0,00"
                                value={plrValue2}
                                onChange={(e) => setPlrValue2(e.target.value)}
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                        <p className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                          <Info size={10} className="text-indigo-500 shrink-0" />
                          Lei 10.101/01: O pagamento da PLR não pode ocorrer mais que duas vezes ao ano e deve respeitar o intervalo mínimo de 3 meses.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end space-x-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 shadow-sm transition cursor-pointer"
                  >
                    Salvar Fonte de Renda
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Modal for Intelligent Adjustment of Occurrence */}
      <AnimatePresence>
        {editingOccurrence && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingOccurrence(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full relative z-10 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-2">
                  <Sliders size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-black text-slate-900 font-display uppercase tracking-wide">
                    Ajustar Ocorrência de Renda
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingOccurrence(null)}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-[10px] text-indigo-600 font-black block uppercase tracking-wider">
                    {editingOccurrence.description}
                  </span>
                  <span className="text-xs text-slate-500 font-semibold block">
                    Referência: {editingOccurrence.month.split('-').reverse().join('/')} • Valor de Contrato: R$ {editingOccurrence.baseAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {/* Received check */}
                <div className="flex items-center space-x-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                  <input
                    type="checkbox"
                    id="occ-is-received"
                    checked={occIsReceived}
                    onChange={(e) => setOccIsReceived(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <label htmlFor="occ-is-received" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                    Marcar como Recebido (Depósito caiu em conta)
                  </label>
                </div>

                {/* Received Amount */}
                <div className="flex flex-col space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Valor Líquido Recebido (R$)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs text-slate-400 font-medium">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={occReceivedAmount}
                      onChange={(e) => setOccReceivedAmount(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-bold text-slate-800"
                    />
                  </div>
                  <span className="text-[9px] text-slate-400 font-semibold">
                    Útil para descontar impostos ou somar bônus neste mês específico.
                  </span>
                </div>

                {/* Justification Notes */}
                <div className="flex flex-col space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">Justificativa / Notas</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Desconto de Plano de Saúde, Bônus por Performance..."
                    value={occNotes}
                    onChange={(e) => setOccNotes(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                {/* Propagate/Future Reajuste Selector */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-start space-x-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100/50">
                    <input
                      type="checkbox"
                      id="propagate-future-check"
                      checked={propagateFuture}
                      onChange={(e) => setPropagateFuture(e.target.checked)}
                      className="rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 mt-0.5 cursor-pointer"
                    />
                    <div className="flex-1 space-y-0.5 cursor-pointer" onClick={() => setPropagateFuture(!propagateFuture)}>
                      <label htmlFor="propagate-future-check" className="text-xs font-black text-indigo-950 block cursor-pointer select-none">
                        Propagar Reajuste para o Futuro
                      </label>
                      <span className="text-[10px] text-indigo-700/85 font-medium block leading-normal">
                        Atualiza o salário contratual deste ativo e propaga o valor para os próximos meses não recebidos.
                      </span>
                    </div>
                  </div>

                  {/* Real-time propagation preview */}
                  <AnimatePresence>
                    {propagateFuture && calculatedFutureInfo && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-emerald-50 border border-emerald-100/60 p-3.5 rounded-xl space-y-2.5">
                          <div className="flex items-center gap-1.5 text-emerald-800 font-bold text-[11px]">
                            <TrendingUp size={14} className="text-emerald-600" />
                            <span>Prévia do Reajuste Permanente:</span>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 text-[10px] text-emerald-950 font-bold bg-white/60 p-2.5 rounded-lg border border-emerald-100/20">
                            {calculatedFutureInfo.isSplit ? (
                              <>
                                <div className="col-span-2 border-b border-emerald-100/30 pb-1.5 mb-1 flex justify-between">
                                  <span className="text-emerald-800 font-semibold">Novo Salário Base:</span>
                                  <span className="font-extrabold">R$ {calculatedFutureInfo.newBaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="space-y-0.5">
                                  <span className="text-emerald-800 font-semibold block">Próximos Vales:</span>
                                  <span className="text-[11px] font-black">R$ {calculatedFutureInfo.futureVale.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="space-y-0.5 border-l border-emerald-100/40 pl-2.5">
                                  <span className="text-emerald-800 font-semibold block">Próximos Saldos:</span>
                                  <span className="text-[11px] font-black">R$ {calculatedFutureInfo.futureBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                              </>
                            ) : (
                              <div className="col-span-2 flex justify-between items-center py-0.5">
                                <span className="text-emerald-800 font-semibold">Novo Valor Futuro:</span>
                                <span className="text-[12px] font-black text-emerald-950">
                                  R$ {calculatedFutureInfo.newBaseValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} /mês
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEditingOccurrence(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSaveOccAdjustment}
                    className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 shadow-sm transition cursor-pointer flex items-center gap-1.5"
                  >
                    {propagateFuture ? (
                      <>
                        <TrendingUp size={14} />
                        Aplicar Reajuste Permanente
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        Salvar Ajuste Pontual
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Modal for Delete Confirmation */}
      <AnimatePresence>
        {sourceToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSourceToDelete(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full relative z-10"
            >
              <div className="flex items-center gap-3 mb-4 text-rose-600">
                <div className="p-3 bg-rose-50 rounded-xl">
                  <AlertCircle size={20} />
                </div>
                <h3 className="text-sm font-black text-slate-900 font-display uppercase tracking-wide">
                  Confirmar Exclusão
                </h3>
              </div>

              <div className="space-y-4">
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  Tem certeza que deseja excluir permanentemente a fonte de renda <span className="font-black text-slate-900">"{sourceToDelete.name}"</span>?
                </p>
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-2.5 items-start">
                  <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-800 font-semibold leading-normal">
                    Isso removerá permanentemente este registro e todas as ocorrências/projeções associadas a ele. Esta ação não poderá ser desfeita.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setSourceToDelete(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmDeleteSource}
                    className="px-4 py-2 bg-rose-600 text-white text-xs font-black rounded-xl hover:bg-rose-700 shadow-sm transition cursor-pointer"
                  >
                    Excluir Permanentemente
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
