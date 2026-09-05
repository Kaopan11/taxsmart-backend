/** ประเภทผู้เสียภาษี — ใช้ตอน lookup effective rate */
export type TaxpayerType = 'INDIVIDUAL' | 'CORPORATE';

/** ใบเสร็จขั้นต่ำที่ calculator ต้องการ (ไม่ผูก Prisma) */
export type CalculatorInvoice = {
  ocrStatus: string;
  issueDate: Date | string | null;
  totalAmount: number | string | null;
  merchantTaxId: string | null;
  category: string | null;
};

export type TaxBracket = {
  upTo: number | null;
  rate: number;
};

/** โครงสร้าง tax-rules/YYYY.json */
export type TaxRules = {
  taxYear: number;
  defaultEffectiveRate: number;
  categoryWeights: {
    MEALS: number;
    OTHER: number;
    default: number;
  };
  individualBrackets: TaxBracket[];
  corporateTiers: TaxBracket[];
};

export type DeductibleResult = {
  deductibleExpenses: number;
  readiness: {
    readyCount: number;
    reviewCount: number;
    excludedCount: number;
  };
};
