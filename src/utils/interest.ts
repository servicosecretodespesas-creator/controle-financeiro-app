import { Expense } from '../types';

export function getLocalTodayStr(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface InterestCalculation {
  daysOverdue: number;
  dailyInterest: number;
  manualInterest: number;
  autoOnceInterest: number;
  originalAmount: number;
  currentAmount: number; // original + manual + daily + autoOnceInterest
  dueDate: string;
  isOverdue: boolean;
  endDateLabel: string;
}

export function calculateExpenseInterest(expense: Expense): InterestCalculation {
  let original = expense.originalAmount ?? expense.amount;
  if (expense.isInstallments && expense.originalAmount && expense.installmentsCount && expense.originalAmount > expense.amount) {
    original = expense.amount;
  }
  const manual = expense.manualInterestApplied ?? 0;
  
  // Calculate days overdue using local date
  const todayStr = getLocalTodayStr();
  
  let endStr = todayStr;
  let endDateLabel = 'Hoje';
  
  if (expense.isPaid) {
    endStr = expense.paidAt || expense.dueDate;
    endDateLabel = expense.paidAt ? `Data de Pagamento (${expense.paidAt.split('-').reverse().join('/')})` : 'Vencimento';
  }
  
  const due = new Date(expense.dueDate + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  
  // Diff in days using 12:00:00 to avoid DST daylight savings shifts
  const diffTime = end.getTime() - due.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  const daysOverdue = diffDays > 0 ? diffDays : 0;
  const isOverdue = !expense.isPaid && todayStr > expense.dueDate;
  
  let dailyInterest = 0;
  if (daysOverdue > 0 && expense.dailyInterestType && expense.dailyInterestType !== 'none' && expense.dailyInterestValue) {
    if (expense.dailyInterestType === 'fixed') {
      dailyInterest = daysOverdue * expense.dailyInterestValue;
    } else if (expense.dailyInterestType === 'percentage') {
      dailyInterest = daysOverdue * (expense.dailyInterestValue / 100) * original;
    }
  }

  let autoOnceInterest = 0;
  if (daysOverdue > 0 && expense.interestType && expense.interestType !== 'none' && expense.interestValue) {
    if (expense.interestType === 'fixed') {
      autoOnceInterest = expense.interestValue;
    } else if (expense.interestType === 'percentage') {
      autoOnceInterest = (expense.interestValue / 100) * original;
    }
  }
  
  return {
    daysOverdue,
    dailyInterest: parseFloat(dailyInterest.toFixed(2)),
    manualInterest: parseFloat(manual.toFixed(2)),
    autoOnceInterest: parseFloat(autoOnceInterest.toFixed(2)),
    originalAmount: original,
    currentAmount: parseFloat((original + manual + dailyInterest + autoOnceInterest).toFixed(2)),
    dueDate: expense.dueDate,
    isOverdue,
    endDateLabel
  };
}
