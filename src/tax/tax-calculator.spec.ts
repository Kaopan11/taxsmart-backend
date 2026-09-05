/// <reference types="jest" />
import rules2026 from './tax-rules/2026.json';
import {
  computeDeductibleExpenses,
  computeTaxSavings,
  lookupEffectiveRate,
} from './tax-calculator';
import type { CalculatorInvoice, TaxRules } from './tax-calculator.types';

const rules = rules2026 as TaxRules;

const readyInvoice = (
  overrides: Partial<CalculatorInvoice> = {},
): CalculatorInvoice => ({
  ocrStatus: 'COMPLETED',
  issueDate: '2026-06-15T00:00:00.000Z',
  totalAmount: 1000,
  merchantTaxId: '1234567890123',
  category: 'OFFICE_SUPPLIES',
  ...overrides,
});

describe('computeDeductibleExpenses', () => {
  it.each([
    {
      name: 'ready invoice counts at 100% weight',
      invoices: [readyInvoice({ totalAmount: 1000 })],
      year: 2026,
      expected: {
        deductibleExpenses: 1000,
        readyCount: 1,
        reviewCount: 0,
        excludedCount: 0,
      },
    },
    {
      name: 'MEALS applies 50% weight',
      invoices: [readyInvoice({ totalAmount: 1000, category: 'MEALS' })],
      year: 2026,
      expected: {
        deductibleExpenses: 500,
        readyCount: 1,
        reviewCount: 0,
        excludedCount: 0,
      },
    },
    {
      name: 'OTHER applies 80% weight',
      invoices: [readyInvoice({ totalAmount: 1000, category: 'OTHER' })],
      year: 2026,
      expected: {
        deductibleExpenses: 800,
        readyCount: 1,
        reviewCount: 0,
        excludedCount: 0,
      },
    },
    {
      name: 'missing taxId goes to review not deductible',
      invoices: [
        readyInvoice({ merchantTaxId: null, totalAmount: 2000 }),
      ],
      year: 2026,
      expected: {
        deductibleExpenses: 0,
        readyCount: 0,
        reviewCount: 1,
        excludedCount: 0,
      },
    },
    {
      name: 'wrong year is excluded',
      invoices: [readyInvoice({ issueDate: '2025-01-01T00:00:00.000Z' })],
      year: 2026,
      expected: {
        deductibleExpenses: 0,
        readyCount: 0,
        reviewCount: 0,
        excludedCount: 1,
      },
    },
    {
      name: 'PENDING is excluded',
      invoices: [readyInvoice({ ocrStatus: 'PENDING' })],
      year: 2026,
      expected: {
        deductibleExpenses: 0,
        readyCount: 0,
        reviewCount: 0,
        excludedCount: 1,
      },
    },
    {
      name: 'DUPLICATE is excluded',
      invoices: [readyInvoice({ ocrStatus: 'DUPLICATE' })],
      year: 2026,
      expected: {
        deductibleExpenses: 0,
        readyCount: 0,
        reviewCount: 0,
        excludedCount: 1,
      },
    },
  ])('$name', ({ invoices, year, expected }) => {
    const result = computeDeductibleExpenses(invoices, year, rules);

    expect(result.deductibleExpenses).toBe(expected.deductibleExpenses);
    expect(result.readiness.readyCount).toBe(expected.readyCount);
    expect(result.readiness.reviewCount).toBe(expected.reviewCount);
    expect(result.readiness.excludedCount).toBe(expected.excludedCount);
  });
});

describe('lookupEffectiveRate', () => {
  it.each([
    {
      name: 'default 15% when income is zero (no profile)',
      taxpayerType: 'INDIVIDUAL' as const,
      estimatedIncome: 0,
      expected: 0.15,
    },
    {
      name: 'INDIVIDUAL low income bracket',
      taxpayerType: 'INDIVIDUAL' as const,
      estimatedIncome: 200000,
      expected: 0.0125,
    },
    {
      name: 'CORPORATE SME tier 15%',
      taxpayerType: 'CORPORATE' as const,
      estimatedIncome: 1000000,
      expected: 0.105,
    },
  ])('$name', ({ taxpayerType, estimatedIncome, expected }) => {
    const rate = lookupEffectiveRate(taxpayerType, estimatedIncome, rules);
    expect(rate).toBeCloseTo(expected, 4);
  });
});

describe('computeTaxSavings', () => {
  it('multiplies deductible by effective rate', () => {
    expect(computeTaxSavings(10000, 0.15)).toBe(1500);
  });

  it('returns zero when deductible is zero', () => {
    expect(computeTaxSavings(0, 0.15)).toBe(0);
  });
});
