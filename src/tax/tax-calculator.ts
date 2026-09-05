import type {
  CalculatorInvoice,
  DeductibleResult,
  TaxBracket,
  TaxpayerType,
  TaxRules,
} from './tax-calculator.types';

/** แปลง totalAmount จาก Prisma Decimal/string → number */
function parseAmount(value: number | string | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/** issueDate อยู่ในปีที่เลือกหรือไม่ */
function isInTaxYear(issueDate: Date | string | null, year: number): boolean {
  if (!issueDate) {
    return false;
  }
  const date = issueDate instanceof Date ? issueDate : new Date(issueDate);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return date.getUTCFullYear() === year;
}

/** Ready = มีครบ totalAmount + merchantTaxId + issueDate */
function isReady(invoice: CalculatorInvoice): boolean {
  const amount = parseAmount(invoice.totalAmount);
  const taxId = invoice.merchantTaxId?.trim();
  return amount !== null && amount > 0 && Boolean(taxId) && Boolean(invoice.issueDate);
}

/** น้ำหนักหมวด — MEALS 50%, OTHER 80%, ที่เหลือ 100% */
function categoryWeight(category: string | null, rules: TaxRules): number {
  const key = category?.trim().toUpperCase();
  if (key === 'MEALS') {
    return rules.categoryWeights.MEALS;
  }
  if (key === 'OTHER') {
    return rules.categoryWeights.OTHER;
  }
  return rules.categoryWeights.default;
}

/**
 * รวมค่าใช้จ่ายหักลดหย่อนได้จากใบเสร็จ
 * นับเฉพาะ COMPLETED + issueDate ในปี · แยก ready / review / excluded
 */
export function computeDeductibleExpenses(
  invoices: CalculatorInvoice[],
  year: number,
  rules: TaxRules,
): DeductibleResult {
  let deductibleExpenses = 0;
  let readyCount = 0;
  let reviewCount = 0;
  let excludedCount = 0;

  for (const invoice of invoices) {
    // นับเฉพาะ COMPLETED — DUPLICATE/FAILED/PENDING/PROCESSING ไม่นับ
    if (invoice.ocrStatus !== 'COMPLETED') {
      excludedCount += 1;
      continue;
    }

    if (!isInTaxYear(invoice.issueDate, year)) {
      excludedCount += 1;
      continue;
    }

    if (!isReady(invoice)) {
      reviewCount += 1;
      continue;
    }

    const amount = parseAmount(invoice.totalAmount)!;
    const weight = categoryWeight(invoice.category, rules);
    deductibleExpenses += amount * weight;
    readyCount += 1;
  }

  return {
    deductibleExpenses: roundMoney(deductibleExpenses),
    readiness: { readyCount, reviewCount, excludedCount },
  };
}

/** คำนวณภาษีจากขั้นบันไดแบบสะสม */
function computeTaxFromBrackets(income: number, brackets: TaxBracket[]): number {
  let tax = 0;
  let previousCeiling = 0;

  for (const bracket of brackets) {
    const ceiling = bracket.upTo ?? Number.POSITIVE_INFINITY;
    const taxableInBracket = Math.min(income, ceiling) - previousCeiling;
    if (taxableInBracket > 0) {
      tax += taxableInBracket * bracket.rate;
    }
    previousCeiling = ceiling;
    if (income <= ceiling) {
      break;
    }
  }

  return tax;
}

/**
 * อัตราภาษีที่มีผล (effective) จากรายได้ประมาณการ
 * ไม่มีรายได้ → default 15% (กรณีไม่มี Tax Profile)
 */
export function lookupEffectiveRate(
  taxpayerType: TaxpayerType,
  estimatedIncome: number,
  rules: TaxRules,
): number {
  if (!estimatedIncome || estimatedIncome <= 0) {
    return rules.defaultEffectiveRate;
  }

  const brackets =
    taxpayerType === 'CORPORATE'
      ? rules.corporateTiers
      : rules.individualBrackets;

  const tax = computeTaxFromBrackets(estimatedIncome, brackets);
  return roundRate(tax / estimatedIncome);
}

/** ประหยัดภาษีโดยประมาณ = ค่าใช้จ่ายหักได้ × อัตราที่มีผล */
export function computeTaxSavings(
  deductible: number,
  effectiveRate: number,
): number {
  return roundMoney(deductible * effectiveRate);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
