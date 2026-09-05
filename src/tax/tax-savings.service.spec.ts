/// <reference types="jest" />
import { BadRequestException } from '@nestjs/common';
import { OcrStatus, TaxpayerType } from '.prisma/client';
import { TaxSavingsService } from './tax-savings.service';

describe('TaxSavingsService.getSavings', () => {
  const userId = 'user-1';
  const year = 2026;

  let prisma: {
    invoice: {
      findMany: jest.Mock;
    };
  };
  let taxProfileService: {
    getProfile: jest.Mock;
  };
  let service: TaxSavingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    taxProfileService = {
      getProfile: jest.fn().mockResolvedValue({
        taxpayerType: TaxpayerType.INDIVIDUAL,
        estimatedIncome: 0,
        taxYear: 2026,
        isDefault: true,
      }),
    };
    service = new TaxSavingsService(prisma as never, taxProfileService as never);
  });

  it('returns zero savings with default profile when no invoices', async () => {
    const result = await service.getSavings(userId, year);

    expect(result).toEqual({
      taxSavings: 0,
      deductibleExpenses: 0,
      effectiveRate: 0.15,
      assumptions: {
        taxYear: 2026,
        taxpayerType: TaxpayerType.INDIVIDUAL,
        estimatedIncome: 0,
        profileIsDefault: true,
        rulesTaxYear: 2026,
      },
      readiness: {
        readyCount: 0,
        reviewCount: 0,
        excludedCount: 0,
      },
    });
  });

  it('computes savings from ready COMPLETED invoices', async () => {
    prisma.invoice.findMany.mockResolvedValue([
      {
        ocrStatus: OcrStatus.COMPLETED,
        issueDate: new Date('2026-03-01T00:00:00.000Z'),
        totalAmount: '10000',
        merchantTaxId: '1234567890123',
        category: 'OFFICE_SUPPLIES',
      },
    ]);

    const result = await service.getSavings(userId, year);

    expect(result.deductibleExpenses).toBe(10000);
    expect(result.effectiveRate).toBe(0.15);
    expect(result.taxSavings).toBe(1500);
    expect(result.readiness.readyCount).toBe(1);
  });

  it('uses saved profile income for effective rate', async () => {
    taxProfileService.getProfile.mockResolvedValue({
      taxpayerType: TaxpayerType.INDIVIDUAL,
      estimatedIncome: 200000,
      taxYear: 2026,
      isDefault: false,
    });
    prisma.invoice.findMany.mockResolvedValue([
      {
        ocrStatus: OcrStatus.COMPLETED,
        issueDate: new Date('2026-03-01T00:00:00.000Z'),
        totalAmount: '10000',
        merchantTaxId: '1234567890123',
        category: 'OFFICE_SUPPLIES',
      },
    ]);

    const result = await service.getSavings(userId, year);

    expect(result.effectiveRate).toBeCloseTo(0.0125, 4);
    expect(result.taxSavings).toBeCloseTo(125, 2);
    expect(result.assumptions.profileIsDefault).toBe(false);
  });

  it('throws BadRequestException for unsupported tax year', async () => {
    await expect(service.getSavings(userId, 2025)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
