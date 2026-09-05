import { TaxpayerType } from '.prisma/client';

/** ค่า default เมื่อ user ยังไม่เคยบันทึก Tax Profile */
export const DEFAULT_TAX_YEAR = 2026;

export const DEFAULT_EFFECTIVE_RATE = 0.15;

export type TaxProfileView = {
  taxpayerType: TaxpayerType;
  estimatedIncome: number;
  taxYear: number;
  /** true = ยังไม่มีแถวใน DB คืนค่า default */
  isDefault: boolean;
};

export type UpsertTaxProfileInput = {
  taxpayerType: TaxpayerType;
  estimatedIncome: number;
  taxYear: number;
};
