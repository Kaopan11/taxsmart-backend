import { TaxpayerType } from '.prisma/client';

/** Response ของ GET /tax/savings?year= */
export type TaxSavingsResponse = {
  taxSavings: number;
  deductibleExpenses: number;
  effectiveRate: number;
  assumptions: {
    taxYear: number;
    taxpayerType: TaxpayerType;
    estimatedIncome: number;
    profileIsDefault: boolean;
    rulesTaxYear: number;
  };
  readiness: {
    readyCount: number;
    reviewCount: number;
    excludedCount: number;
  };
};
