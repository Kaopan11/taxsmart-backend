/// <reference types="jest" />
import { TaxpayerType } from '.prisma/client';
import { TaxProfileService } from './tax-profile.service';

describe('TaxProfileService', () => {
  const userId = 'user-1';

  let prisma: {
    taxProfile: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let service: TaxProfileService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      taxProfile: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    service = new TaxProfileService(prisma as never);
  });

  it('returns default profile when user has no saved row', async () => {
    prisma.taxProfile.findUnique.mockResolvedValue(null);

    const profile = await service.getProfile(userId);

    expect(profile).toEqual({
      taxpayerType: TaxpayerType.INDIVIDUAL,
      estimatedIncome: 0,
      taxYear: 2026,
      isDefault: true,
    });
  });

  it('returns saved profile when row exists', async () => {
    prisma.taxProfile.findUnique.mockResolvedValue({
      taxpayerType: TaxpayerType.CORPORATE,
      estimatedIncome: '1500000',
      taxYear: 2026,
    });

    const profile = await service.getProfile(userId);

    expect(profile).toEqual({
      taxpayerType: TaxpayerType.CORPORATE,
      estimatedIncome: 1500000,
      taxYear: 2026,
      isDefault: false,
    });
  });

  it('upserts profile for the authenticated user', async () => {
    prisma.taxProfile.upsert.mockResolvedValue({
      taxpayerType: TaxpayerType.INDIVIDUAL,
      estimatedIncome: '500000',
      taxYear: 2026,
    });

    const profile = await service.upsertProfile(userId, {
      taxpayerType: TaxpayerType.INDIVIDUAL,
      estimatedIncome: 500000,
      taxYear: 2026,
    });

    expect(prisma.taxProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId },
        create: expect.objectContaining({
          userId,
          taxpayerType: TaxpayerType.INDIVIDUAL,
          estimatedIncome: 500000,
          taxYear: 2026,
        }),
        update: expect.objectContaining({
          taxpayerType: TaxpayerType.INDIVIDUAL,
          estimatedIncome: 500000,
          taxYear: 2026,
        }),
      }),
    );
    expect(profile.isDefault).toBe(false);
    expect(profile.estimatedIncome).toBe(500000);
  });
});
