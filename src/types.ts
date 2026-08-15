export type ExpenseType = 'personal' | 'third_party';

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  transactionDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  type: ExpenseType;
  userId: string;
  isPaid: boolean;
  paidAt?: string; // Date when expense was marked as paid (YYYY-MM-DD)
  originalAmount?: number; // Original amount before interest or adjustments
  interestType?: 'percentage' | 'fixed' | 'none'; // Manual interest type applied
  interestValue?: number; // Manual interest value
  dailyInterestType?: 'percentage' | 'fixed' | 'none'; // Auto daily interest type
  dailyInterestValue?: number; // Auto daily interest value (e.g., 1% or R$ 2.00)
  manualInterestApplied?: number; // Accumulated manual interest amount
  responsibleMemberId?: string; // ID of the member responsible or 'all'
  isInstallments?: boolean;
  installmentsCount?: number;
  currentInstallment?: number;
  installmentGroupId?: string;
  isRecurring?: boolean;
  recurrenceFrequency?: 'monthly' | 'none';
  recurringActive?: boolean; // Se true, está ativa para gerar todo mês. Se false, está desativada/pausada.
  isVariableValue?: boolean; // Se true, o valor muda todo mês (ex: Luz, Água)
  needsAmount?: boolean; // Se true, aguarda o preenchimento do valor da fatura do mês
  recurringTemplateId?: string; // ID da despesa modelo/template de recorrência
  memberShareTokens?: string[]; // array of share tokens of members who can view this
  amountPaid?: number; // amount already paid for this expense
  isArchived?: boolean; // Se true, despesa/série foi arquivada e fica oculta do gerenciador ativo
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
}

export interface Member {
  id: string;
  name: string;
  userId: string;
  shareToken: string; // unique random token
  createdAt: string;
}

export interface Budget {
  id: string;
  category: string;
  amount: number;
  month: string; // YYYY-MM
  userId: string;
  createdAt: string;
}

export type TransmissionRule = '5th_working_day' | 'last_day' | 'specific_day';

export interface IncomeSource {
  id: string;
  name: string; // Ex: Salário, Aluguel
  employer: string; // Empresa/Contratante
  baseValue: number; // Montante bruto acordado
  netValue?: number; // Valor líquido mensal esperado (após descontos de folha)
  startDate: string; // Vigência início (YYYY-MM-DD)
  endDate?: string; // Vigência término opcional (YYYY-MM-DD)
  transmissionRule: TransmissionRule;
  specificDay?: number; // Se specific_day, o dia (1-31)
  isSplit: boolean; // Protocolo de Split
  splitPercentage?: number; // % do Vale (ex: 40)
  splitDay?: number; // Dia do vale
  finalDay?: number; // Dia do saldo final se splitado, ou dia padrão
  userId: string;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;

  // Benefícios Extras / Bônus
  hasThirteenth?: boolean;
  thirteenthPaymentType?: 'one_installment' | 'two_installments';
  thirteenthFirstMonth?: number; // mês da 1ª parcela (1-12), padrão 11
  thirteenthSecondMonth?: number; // mês da 2ª parcela (1-12), padrão 12
  thirteenthSingleMonth?: number; // mês da parcela única (1-12), padrão 12

  hasFourteenth?: boolean;
  fourteenthMonth?: number; // mês do 14º (1-12), padrão 12
  fourteenthValue?: number; // valor do 14º, opcional (se vazio, usa baseValue)

  hasPLR?: boolean;
  plrPaymentType?: 'one_installment' | 'two_installments';
  plrMonth1?: number; // mês da 1ª parcela PLR (1-12), padrão 3
  plrValue1?: number; // valor da 1ª parcela PLR
  plrMonth2?: number; // mês da 2ª parcela PLR (1-12), padrão 9
  plrValue2?: number; // valor da 2ª parcela PLR
}

export interface IncomeOccurrence {
  id: string;
  incomeSourceId: string;
  userId: string;
  description: string; // Ex: "Salário - Janeiro/2026 (Vale)"
  expectedDate: string; // YYYY-MM-DD
  baseAmount: number; // Valor calculado bruto/original
  isReceived: boolean; // Se foi marcado como recebido
  receivedAmount: number; // Valor real recebido (Líquido)
  notes: string; // Justificativa de campo
  isVale: boolean; // Se é o adiantamento
  month: string; // YYYY-MM
  createdAt?: string;
  updatedAt?: string;
  occurrenceType?: 'salary' | 'thirteenth_1' | 'thirteenth_2' | 'fourteenth' | 'plr_1' | 'plr_2';
}

export interface InstallmentOverride {
  isPaid: boolean;
  dueDate?: string; // overridden due date if postponed
  constructionFee?: number; // Pre-keys handover taxa de evolução / juros de obra
  iptu?: number;
  condominio?: number;
  reforms?: number;
  extraPaid?: number; // extra amortização extraordinária
  paidAt?: string;
  notes?: string;
  amortization?: number; // Custom base amortization override
  interest?: number;     // Custom interest override
  insurance?: number;    // Custom insurance override
}

export interface FinancingContract {
  id: string;
  userId: string;
  propertyName: string; // Ex: "Apartamento Vila Marina"
  contractType?: 'financing' | 'down_payment' | 'construction' | 'other' | 'other_installments' | 'other_fees'; // Tipo de componente
  totalValue: number; // Valor Total da Compra (ex: 500000)
  financedAmount: number; // Valor Financiado (ex: 350000)
  totalInstallments: number; // Parcelas totais (ex: 360)
  startDate: string; // Data do 1º vencimento (YYYY-MM-DD)
  amortizationSystem: 'SAC' | 'PRICE';
  interestRateAnnum: number; // Taxa de juros anual % (ex: 9.5)
  monthlyInsurance: number; // Seguro / Taxas mensais fixas (ex: 75.00)
  hasKeysHandover: boolean; // Se está em fase de construção
  keysHandoverDate?: string; // Data de entrega das chaves (YYYY-MM-DD)
  installmentsOverride?: { [installmentNumber: string]: InstallmentOverride };
  paymentType?: 'cash' | 'installments'; // For down_payment
  customDescription?: string; // For custom balloon installments or fees
  isRecurring?: boolean;
  recurrenceFrequency?: 'semiannual' | 'annual' | 'single';
  recurrenceCount?: number;
  createdAt: string;
  updatedAt: string;
}



