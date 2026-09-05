import { Injectable } from '@nestjs/common';
import { TaxpayerType } from '.prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  TaxProfileView,
  UpsertTaxProfileInput,
} from './tax-profile.types';
import { DEFAULT_TAX_YEAR } from './tax-profile.types';

@Injectable()
export class TaxProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /tax/profile — อ่านจาก DB หรือคืน default (INDIVIDUAL, income 0, ปี 2026) */
  async getProfile(userId: string): Promise<TaxProfileView> {
    const row = await this.prisma.taxProfile.findUnique({
      where: { userId },
      select: {
        taxpayerType: true,
        estimatedIncome: true,
        taxYear: true,
      },
    });

    if (!row) {
      return {
        taxpayerType: TaxpayerType.INDIVIDUAL,
        estimatedIncome: 0,
        taxYear: DEFAULT_TAX_YEAR,
        isDefault: true,
      };
    }

    return this.toView(row);
  }

  /** PUT /tax/profile — upsert ตาม user จาก JWT */
  async upsertProfile(
    userId: string,
    input: UpsertTaxProfileInput,
  ): Promise<TaxProfileView> {
    const row = await this.prisma.taxProfile.upsert({
      where: { userId },
      create: {
        userId,
        taxpayerType: input.taxpayerType,
        estimatedIncome: input.estimatedIncome,
        taxYear: input.taxYear,
      },
      update: {
        taxpayerType: input.taxpayerType,
        estimatedIncome: input.estimatedIncome,
        taxYear: input.taxYear,
      },
      select: {
        taxpayerType: true,
        estimatedIncome: true,
        taxYear: true,
      },
    });

    return this.toView(row);
  }

  private toView(row: {
    taxpayerType: TaxpayerType;
    estimatedIncome: { toString(): string } | number | string;
    taxYear: number;
  }): TaxProfileView {
    return {
      taxpayerType: row.taxpayerType,
      estimatedIncome: Number(row.estimatedIncome),
      taxYear: row.taxYear,
      isDefault: false,
    };
  }
}
