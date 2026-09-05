/// <reference types="jest" />
/**
 * HTTP-level specs สำหรับ TaxController
 * ใช้ service จริง + mock Prisma · override JwtAuthGuard
 */
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TaxpayerType } from '.prisma/client';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TaxController } from './tax.controller';
import { TaxProfileService } from './tax-profile.service';
import { TaxSavingsService } from './tax-savings.service';

const AUTH_USER = {
  userId: 'user-1',
  email: 'user@taxsmart.local',
  role: 'USER' as const,
};

describe('TaxController (HTTP)', () => {
  let app: INestApplication<App>;
  let prisma: {
    taxProfile: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
    invoice: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      taxProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [TaxController],
      providers: [TaxProfileService, TaxSavingsService, PrismaService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      // จำลอง JWT ผ่าน — ใส่ user ลง request
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = AUTH_USER;
          return true;
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /tax/profile', () => {
    it('returns 200 with default profile when none saved', async () => {
      const response = await request(app.getHttpServer())
        .get('/tax/profile')
        .expect(200);

      expect(response.body).toMatchObject({
        taxpayerType: 'INDIVIDUAL',
        estimatedIncome: 0,
        taxYear: 2026,
        isDefault: true,
      });
    });
  });

  describe('PUT /tax/profile', () => {
    it('returns 200 after upserting Freelance INDIVIDUAL profile', async () => {
      prisma.taxProfile.upsert.mockResolvedValue({
        taxpayerType: TaxpayerType.INDIVIDUAL,
        estimatedIncome: '600000',
        taxYear: 2026,
      });

      const response = await request(app.getHttpServer())
        .put('/tax/profile')
        .send({
          taxpayerType: 'INDIVIDUAL',
          estimatedIncome: 600000,
          taxYear: 2026,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        taxpayerType: 'INDIVIDUAL',
        estimatedIncome: 600000,
        isDefault: false,
      });
    });

    it('returns 200 after upserting SME CORPORATE profile', async () => {
      prisma.taxProfile.upsert.mockResolvedValue({
        taxpayerType: TaxpayerType.CORPORATE,
        estimatedIncome: '2000000',
        taxYear: 2026,
      });

      const response = await request(app.getHttpServer())
        .put('/tax/profile')
        .send({
          taxpayerType: 'CORPORATE',
          estimatedIncome: 2000000,
          taxYear: 2026,
        })
        .expect(200);

      expect(response.body.taxpayerType).toBe('CORPORATE');
    });

    it('returns 400 for invalid body', async () => {
      await request(app.getHttpServer())
        .put('/tax/profile')
        .send({ taxpayerType: 'INVALID', estimatedIncome: -1, taxYear: 2026 })
        .expect(400);
    });
  });

  describe('GET /tax/savings', () => {
    it('returns 200 with default rate 0.15 when no profile and no invoices', async () => {
      const response = await request(app.getHttpServer())
        .get('/tax/savings')
        .query({ year: 2026 })
        .expect(200);

      expect(response.body).toMatchObject({
        taxSavings: 0,
        deductibleExpenses: 0,
        effectiveRate: 0.15,
        assumptions: {
          taxpayerType: 'INDIVIDUAL',
          profileIsDefault: true,
        },
        readiness: {
          readyCount: 0,
          reviewCount: 0,
          excludedCount: 0,
        },
      });
    });

    it('returns 400 when year query is missing', async () => {
      await request(app.getHttpServer()).get('/tax/savings').expect(400);
    });

    it('returns 400 when year query is not a number', async () => {
      await request(app.getHttpServer())
        .get('/tax/savings')
        .query({ year: 'abc' })
        .expect(400);
    });

    it('returns reviewCount when invoice is not ready', async () => {
      prisma.invoice.findMany.mockResolvedValue([
        {
          ocrStatus: 'COMPLETED',
          issueDate: new Date('2026-02-01T00:00:00.000Z'),
          totalAmount: '8000',
          merchantTaxId: null,
          category: 'MEALS',
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/tax/savings')
        .query({ year: 2026 })
        .expect(200);

      expect(response.body.deductibleExpenses).toBe(0);
      expect(response.body.readiness.reviewCount).toBe(1);
    });
  });
});
