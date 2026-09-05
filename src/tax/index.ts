export {
  computeDeductibleExpenses,
  computeTaxSavings,
  lookupEffectiveRate,
} from './tax-calculator';
export type {
  CalculatorInvoice,
  DeductibleResult,
  TaxBracket,
  TaxpayerType,
  TaxRules,
} from './tax-calculator.types';
export type { TaxProfileView, UpsertTaxProfileInput } from './tax-profile.types';
export type { TaxSavingsResponse } from './tax-savings.types';
export { DEFAULT_EFFECTIVE_RATE, DEFAULT_TAX_YEAR } from './tax-profile.types';
export { TaxModule } from './tax.module';
export { default as taxRules2026 } from './tax-rules/2026.json';
