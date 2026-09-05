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
export { default as taxRules2026 } from './tax-rules/2026.json';
