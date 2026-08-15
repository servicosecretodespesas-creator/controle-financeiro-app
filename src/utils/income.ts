import { IncomeSource, IncomeOccurrence } from '../types';

/**
 * Checks if a given date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Checks if a given date is a Brazilian national holiday (fixed dates)
 */
export function isHoliday(date: Date): boolean {
  const month = date.getMonth(); // 0-indexed (0 = Jan, 11 = Dec)
  const day = date.getDate();

  // Fixed National Holidays in Brazil
  if (month === 0 && day === 1) return true;   // Ano Novo
  if (month === 3 && day === 21) return true;  // Tiradentes
  if (month === 4 && day === 1) return true;   // Dia do Trabalho
  if (month === 8 && day === 7) return true;   // Independência
  if (month === 9 && day === 12) return true;  // Nossa Sra. Aparecida
  if (month === 10 && day === 2) return true;  // Finados
  if (month === 10 && day === 15) return true; // Proclamação da República
  if (month === 11 && day === 25) return true; // Natal
  
  return false;
}

/**
 * Computes the 5th working day of a given month & year
 */
export function get5thWorkingDay(year: number, month: number): Date {
  let workingDaysCount = 0;
  let currentDate = new Date(year, month, 1);

  while (workingDaysCount < 5) {
    if (!isWeekend(currentDate) && !isHoliday(currentDate)) {
      workingDaysCount++;
    }
    if (workingDaysCount < 5) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return currentDate;
}

/**
 * Formats a Date object to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Calculates the expected date of an income payment for a specific year and month
 */
export function calculatePaymentDate(
  rule: '5th_working_day' | 'last_day' | 'specific_day',
  year: number,
  month: number,
  specificDay?: number
): string {
  if (rule === '5th_working_day') {
    return formatDate(get5thWorkingDay(year, month));
  } else if (rule === 'last_day') {
    const lastDayDate = new Date(year, month + 1, 0);
    return formatDate(lastDayDate);
  } else {
    const targetDay = specificDay || 10;
    // Cap targetDay at the last day of the month to prevent overflowing to next month
    const lastDayOfThisMonth = new Date(year, month + 1, 0).getDate();
    const day = Math.min(targetDay, lastDayOfThisMonth);
    return formatDate(new Date(year, month, day));
  }
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * Generates the projected monthly occurrences for a source across the current year and the next year
 */
export function generateOccurrencesForSource(
  source: IncomeSource,
  userId: string
): Omit<IncomeOccurrence, 'id'>[] {
  const occurrences: Omit<IncomeOccurrence, 'id'>[] = [];
  
  // Define start date
  const start = new Date(source.startDate + 'T00:00:00');
  const startYear = start.getFullYear();
  
  // We project for current year and next year
  const currentYear = new Date().getFullYear();
  const projectionYears = [currentYear, currentYear + 1];

  for (const year of projectionYears) {
    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      const firstOfMonth = new Date(year, monthIdx, 1);
      const lastOfMonth = new Date(year, monthIdx + 1, 0);
      
      // Check if this month is within the source validity
      if (lastOfMonth < start) {
        continue;
      }
      
      if (source.endDate) {
        const end = new Date(source.endDate + 'T23:59:59');
        if (firstOfMonth > end) {
          continue;
        }
      }
      
      const monthStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
      const monthNumber = monthIdx + 1; // 1-12

      // Base payment date calculation for single payments or final balance
      let basePaymentDate = '';
      if (source.isSplit && source.transmissionRule === 'specific_day') {
        const finalDay = source.finalDay || 5;
        basePaymentDate = calculatePaymentDate('specific_day', year, monthIdx, finalDay);
      } else {
        basePaymentDate = calculatePaymentDate(
          source.transmissionRule,
          year,
          monthIdx,
          source.specificDay
        );
      }

      // 1. Regular Monthly Salary Occurrences
      if (source.isSplit) {
        // Generates split occurrences: Vale & Balance
        const valePercentage = source.splitPercentage || 40;
        const valeAmount = Number(((source.baseValue * valePercentage) / 100).toFixed(2));
        
        let balanceAmount = 0;
        if (source.netValue && source.netValue > 0) {
          // Balance is Net Salary minus Vale Advance (e.g., 1018.34 - 442.09 = 576.25)
          balanceAmount = Number((source.netValue - valeAmount).toFixed(2));
        } else {
          const balancePercentage = 100 - valePercentage;
          balanceAmount = Number(((source.baseValue * balancePercentage) / 100).toFixed(2));
        }
        
        // 1.1 Vale Occurrence
        const valeDay = source.splitDay || 20;
        const valeDate = calculatePaymentDate('specific_day', year, monthIdx, valeDay);
        occurrences.push({
          incomeSourceId: source.id,
          userId,
          description: `${source.name} (Vale)`,
          expectedDate: valeDate,
          baseAmount: valeAmount,
          isReceived: false,
          receivedAmount: valeAmount, // liquid defaults to base amount, can be edited
          notes: '',
          isVale: true,
          month: monthStr,
          occurrenceType: 'salary'
        });

        // 1.2 Final Balance Occurrence
        occurrences.push({
          incomeSourceId: source.id,
          userId,
          description: `${source.name} (Saldo Final)`,
          expectedDate: basePaymentDate,
          baseAmount: balanceAmount,
          isReceived: false,
          receivedAmount: balanceAmount,
          notes: '',
          isVale: false,
          month: monthStr,
          occurrenceType: 'salary'
        });
        
      } else {
        // Single standard occurrence
        const standardAmount = (source.netValue && source.netValue > 0) ? source.netValue : source.baseValue;
        occurrences.push({
          incomeSourceId: source.id,
          userId,
          description: source.name,
          expectedDate: basePaymentDate,
          baseAmount: standardAmount,
          isReceived: false,
          receivedAmount: standardAmount,
          notes: '',
          isVale: false,
          month: monthStr,
          occurrenceType: 'salary'
        });
      }

      // 2. Benefício: 13º Salário
      if (source.hasThirteenth) {
        const payType = source.thirteenthPaymentType || 'two_installments';
        if (payType === 'two_installments') {
          const firstMonth = source.thirteenthFirstMonth || 11;
          const secondMonth = source.thirteenthSecondMonth || 12;

          if (monthNumber === firstMonth) {
            const amount = Number((source.baseValue / 2).toFixed(2));
            occurrences.push({
              incomeSourceId: source.id,
              userId,
              description: `${source.name} (13º Salário - 1ª Parcela)`,
              expectedDate: basePaymentDate,
              baseAmount: amount,
              isReceived: false,
              receivedAmount: amount,
              notes: '',
              isVale: false,
              month: monthStr,
              occurrenceType: 'thirteenth_1'
            });
          }

          if (monthNumber === secondMonth) {
            const amount = Number((source.baseValue / 2).toFixed(2));
            occurrences.push({
              incomeSourceId: source.id,
              userId,
              description: `${source.name} (13º Salário - 2ª Parcela)`,
              expectedDate: basePaymentDate,
              baseAmount: amount,
              isReceived: false,
              receivedAmount: amount,
              notes: '',
              isVale: false,
              month: monthStr,
              occurrenceType: 'thirteenth_2'
            });
          }
        } else {
          // single installment
          const singleMonth = source.thirteenthSingleMonth || 12;
          if (monthNumber === singleMonth) {
            occurrences.push({
              incomeSourceId: source.id,
              userId,
              description: `${source.name} (13º Salário)`,
              expectedDate: basePaymentDate,
              baseAmount: source.baseValue,
              isReceived: false,
              receivedAmount: source.baseValue,
              notes: '',
              isVale: false,
              month: monthStr,
              occurrenceType: 'thirteenth_1'
            });
          }
        }
      }

      // 3. Benefício: 14º Salário
      if (source.hasFourteenth) {
        const targetMonth = source.fourteenthMonth || 12;
        if (monthNumber === targetMonth) {
          const amount = source.fourteenthValue || source.baseValue;
          occurrences.push({
            incomeSourceId: source.id,
            userId,
            description: `${source.name} (14º Salário)`,
            expectedDate: basePaymentDate,
            baseAmount: amount,
            isReceived: false,
            receivedAmount: amount,
            notes: '',
            isVale: false,
            month: monthStr,
            occurrenceType: 'fourteenth'
          });
        }
      }

      // 4. Benefício: PLR (Participação nos Lucros e Resultados)
      if (source.hasPLR) {
        const pType = source.plrPaymentType || 'one_installment';
        const m1 = source.plrMonth1 || 3;
        const val1 = source.plrValue1 || 0;

        if (monthNumber === m1 && val1 > 0) {
          occurrences.push({
            incomeSourceId: source.id,
            userId,
            description: `${source.name} (PLR - 1ª Parcela)`,
            expectedDate: basePaymentDate,
            baseAmount: val1,
            isReceived: false,
            receivedAmount: val1,
            notes: '',
            isVale: false,
            month: monthStr,
            occurrenceType: 'plr_1'
          });
        }

        if (pType === 'two_installments') {
          const m2 = source.plrMonth2 || 9;
          const val2 = source.plrValue2 || 0;
          if (monthNumber === m2 && val2 > 0) {
            occurrences.push({
              incomeSourceId: source.id,
              userId,
              description: `${source.name} (PLR - 2ª Parcela)`,
              expectedDate: basePaymentDate,
              baseAmount: val2,
              isReceived: false,
              receivedAmount: val2,
              notes: '',
              isVale: false,
              month: monthStr,
              occurrenceType: 'plr_2'
            });
          }
        }
      }
    }
  }

  return occurrences;
}
