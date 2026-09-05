import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeDeductibleExpenses,
  computeTaxSavings,
  lookupEffectiveRate,
} from './tax-calculator';
import type { TaxpayerType as CalculatorTaxpayerType } from './tax-calculator.types';
import type { TaxRules } from './tax-calculator.types';
import { TaxProfileService } from './tax-profile.service';
import type { TaxSavingsResponse } from './tax-savings.types';
import taxRules2026 from './tax-rules/2026.json';

/** ฟิลด์ที่ calculator ต้องใช้จาก invoice */
const INVOICE_SAVINGS_SELECT = {
  ocrStatus: true,
  issueDate: true,
  totalAmount: true,
  merchantTaxId: true,
  category: true,
} as const;

@Injectable()
export class TaxSavingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxProfileService: TaxProfileService,
  ) {}

  /**
   * GET /tax/savings?year= — ประมาณการประหยัดภาษีจากใบเสร็จ + profile
   * ดึง invoices ทั้งหมดของ user แล้วให้ calculator กรองตามปี
   */
  async getSavings(userId: string, year: number): Promise<TaxSavingsResponse> {
    const rules = this.getRulesForYear(year);
    const profile = await this.taxProfileService.getProfile(userId);

    const invoices = await this.prisma.invoice.findMany({
      where: { userId },
      select: INVOICE_SAVINGS_SELECT,
    });

    // แปลง Prisma Decimal → number ก่อนส่งเข้า pure calculator
    const calculatorInvoices = invoices.map((invoice) => ({
      ocrStatus: invoice.ocrStatus,
      issueDate: invoice.issueDate,
      merchantTaxId: invoice.merchantTaxId,
      category: invoice.category,
      totalAmount:
        invoice.totalAmount === null ? null : Number(invoice.totalAmount),
    }));

    const { deductibleExpenses, readiness } = computeDeductibleExpenses(
      calculatorInvoices,
      year,
      rules,
    );

    // Prisma enum → calculator type (ค่า string ตรงกัน — แยก layer ตาม BE-1/BE-2)
    const effectiveRate = lookupEffectiveRate(
      profile.taxpayerType as CalculatorTaxpayerType,
      profile.estimatedIncome,
      rules,
    );

    const taxSavings = computeTaxSavings(deductibleExpenses, effectiveRate);

    return {
      taxSavings,
      deductibleExpenses,
      effectiveRate,
      assumptions: {
        taxYear: year,
        taxpayerType: profile.taxpayerType,
        estimatedIncome: profile.estimatedIncome,
        profileIsDefault: profile.isDefault,
        rulesTaxYear: rules.taxYear,
      },
      readiness,
    };
  }

  /** ตอนนี้มี rules 2026 ไฟล์เดียว — ปีอื่นคืน 400 */
  private getRulesForYear(year: number): TaxRules {
    const rules = taxRules2026 as TaxRules;
    if (year !== rules.taxYear) {
      throw new BadRequestException(
        `Tax year ${year} is not supported. Use ${rules.taxYear}.`,
      );
    }
    return rules;
  }
}
