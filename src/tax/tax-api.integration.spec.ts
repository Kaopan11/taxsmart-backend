/// <reference types="jest" />
/**
 * Integration tests — TaxProfileService + TaxSavingsService + calculator จริง
 * mock เฉพาะ Prisma (ไม่มี DB) เพื่อล็อกพฤติกรรม API ตาม BE-4
 */
import { OcrStatus, TaxpayerType } from '.prisma/client';
import { TaxProfileService } from './tax-profile.service';
import { TaxSavingsService } from './tax-savings.service';

describe('Tax API (service integration)', () => {
  const userId = 'user-1';
  const year = 2026;

  let prisma: {
    taxProfile: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    invoice: {
      findMany: jest.Mock;
    };
  };
  let taxProfileService: TaxProfileService;
  let taxSavingsService: TaxSavingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      taxProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    taxProfileService = new TaxProfileService(prisma as never);
    taxSavingsService = new TaxSavingsService(
      prisma as never,
      taxProfileService,
    );
  });

  describe('GET /tax/profile behaviour', () => {
    it('returns default INDIVIDUAL when no profile row exists', async () => {
      const profile = await taxProfileService.getProfile(userId);

      expect(profile).toMatchObject({
        taxpayerType: TaxpayerType.INDIVIDUAL,
        estimatedIncome: 0,
        taxYear: 2026,
        isDefault: true,
      });
    });
  });

  describe('PUT /tax/profile behaviour', () => {
    it('persists Freelance-style INDIVIDUAL profile', async () => {
      prisma.taxProfile.upsert.mockResolvedValue({
        taxpayerType: TaxpayerType.INDIVIDUAL,
        estimatedIncome: '500000',
        taxYear: 2026,
      });

      const profile = await taxProfileService.upsertProfile(userId, {
        taxpayerType: TaxpayerType.INDIVIDUAL,
        estimatedIncome: 500000,
        taxYear: 2026,
      });

      expect(profile.isDefault).toBe(false);
      expect(profile.taxpayerType).toBe(TaxpayerType.INDIVIDUAL);
      expect(profile.estimatedIncome).toBe(500000);
    });

    it('persists SME CORPORATE profile', async () => {
      prisma.taxProfile.upsert.mockResolvedValue({
        taxpayerType: TaxpayerType.CORPORATE,
        estimatedIncome: '1500000',
        taxYear: 2026,
      });

      const profile = await taxProfileService.upsertProfile(userId, {
        taxpayerType: TaxpayerType.CORPORATE,
        estimatedIncome: 1500000,
        taxYear: 2026,
      });

      expect(profile.taxpayerType).toBe(TaxpayerType.CORPORATE);
      expect(profile.estimatedIncome).toBe(1500000);
    });
  });

  describe('GET /tax/savings behaviour', () => {
    it('uses default effective rate 0.15 when no profile and no invoices', async () => {
      const result = await taxSavingsService.getSavings(userId, year);

      expect(result.effectiveRate).toBe(0.15);
      expect(result.taxSavings).toBe(0);
      expect(result.assumptions.profileIsDefault).toBe(true);
      expect(result.readiness).toEqual({
        readyCount: 0,
        reviewCount: 0,
        excludedCount: 0,
      });
    });

    it('applies Freelance profile rate when INDIVIDUAL income is set', async () => {
      prisma.taxProfile.findUnique.mockResolvedValue({
        taxpayerType: TaxpayerType.INDIVIDUAL,
        estimatedIncome: '500000',
        taxYear: 2026,
      });
      prisma.invoice.findMany.mockResolvedValue([
        readyInvoice({ totalAmount: '20000' }),
      ]);

      const result = await taxSavingsService.getSavings(userId, year);

      expect(result.assumptions.profileIsDefault).toBe(false);
      // รายได้ 500k → อัตรา effective จาก bracket จริง (ไม่ใช่ default 0.15)
      expect(result.effectiveRate).toBeCloseTo(0.055, 3);
      expect(result.effectiveRate).not.toBe(0.15);
      expect(result.deductibleExpenses).toBe(20000);
      expect(result.taxSavings).toBeGreaterThan(0);
    });

    it('applies SME CORPORATE tier rate', async () => {
      prisma.taxProfile.findUnique.mockResolvedValue({
        taxpayerType: TaxpayerType.CORPORATE,
        estimatedIncome: '1000000',
        taxYear: 2026,
      });
      prisma.invoice.findMany.mockResolvedValue([
        readyInvoice({ totalAmount: '10000' }),
      ]);

      const result = await taxSavingsService.getSavings(userId, year);

      expect(result.assumptions.taxpayerType).toBe(TaxpayerType.CORPORATE);
      expect(result.effectiveRate).toBeCloseTo(0.105, 4);
      expect(result.taxSavings).toBeCloseTo(1050, 0);
    });

    it('puts invoice missing taxId into review, not deductible', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          ocrStatus: OcrStatus.COMPLETED,
          issueDate: new Date('2026-04-01T00:00:00.000Z'),
          totalAmount: '5000',
          merchantTaxId: null,
          category: 'MEALS',
        },
      ]);

      const result = await taxSavingsService.getSavings(userId, year);

      expect(result.deductibleExpenses).toBe(0);
      expect(result.readiness.reviewCount).toBe(1);
      expect(result.readiness.readyCount).toBe(0);
    });

    it('puts invoice missing amount into review', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          ocrStatus: OcrStatus.COMPLETED,
          issueDate: new Date('2026-04-01T00:00:00.000Z'),
          totalAmount: null,
          merchantTaxId: '1234567890123',
          category: 'OTHER',
        },
      ]);

      const result = await taxSavingsService.getSavings(userId, year);

      expect(result.readiness.reviewCount).toBe(1);
      expect(result.deductibleExpenses).toBe(0);
    });

    it('excludes invoice missing issueDate (cannot assign tax year)', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          ocrStatus: OcrStatus.COMPLETED,
          issueDate: null,
          totalAmount: '3000',
          merchantTaxId: '1234567890123',
          category: 'TRAVEL',
        },
      ]);

      const result = await taxSavingsService.getSavings(userId, year);

      // ไม่มี issueDate → isInTaxYear false → excluded (ไม่ใช่ review)
      expect(result.readiness.excludedCount).toBe(1);
      expect(result.readiness.reviewCount).toBe(0);
    });

    it('excludes invoices from other tax years', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        readyInvoice({
          issueDate: new Date('2025-12-31T00:00:00.000Z'),
          totalAmount: '9999',
        }),
      ]);

      const result = await taxSavingsService.getSavings(userId, year);

      expect(result.deductibleExpenses).toBe(0);
      expect(result.readiness.excludedCount).toBe(1);
    });

    it('returns zero savings when user has no invoices in the requested year', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          ocrStatus: OcrStatus.PENDING,
          issueDate: new Date('2026-01-01T00:00:00.000Z'),
          totalAmount: '1000',
          merchantTaxId: '1234567890123',
          category: 'OTHER',
        },
      ]);

      const result = await taxSavingsService.getSavings(userId, year);

      expect(result.taxSavings).toBe(0);
      expect(result.deductibleExpenses).toBe(0);
      expect(result.readiness.readyCount).toBe(0);
      expect(result.readiness.excludedCount).toBe(1);
    });
  });
});

function readyInvoice(overrides: Record<string, unknown> = {}) {
  return {
    ocrStatus: OcrStatus.COMPLETED,
    issueDate: new Date('2026-06-01T00:00:00.000Z'),
    totalAmount: '10000',
    merchantTaxId: '1234567890123',
    category: 'OFFICE_SUPPLIES',
    ...overrides,
  };
}
