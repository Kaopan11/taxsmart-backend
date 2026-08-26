/// <reference types="jest" />
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OcrStatus } from '.prisma/client';
import { InvoicesService } from './invoices.service';

describe('InvoicesService.update', () => {
  const userId = 'user-1';
  const invoiceId = 'inv-1';

  const baseInvoice = {
    id: invoiceId,
    ocrStatus: OcrStatus.COMPLETED,
    merchantName: 'Old Store',
    merchantTaxId: '1234567890123',
    invoiceNumber: 'INV-001',
    issueDate: new Date('2026-01-15T00:00:00.000Z'),
    totalAmount: '100.00',
    category: 'OFFICE_SUPPLIES',
    rawOcrData: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  let prisma: {
    invoice: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: InvoicesService;

  beforeEach(() => {
    prisma = {
      invoice: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new InvoicesService(prisma as never, {} as never);
  });

  it('updates editable fields when ocrStatus is COMPLETED', async () => {
    const updated = { ...baseInvoice, merchantName: 'Updated Store' };
    prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
    prisma.invoice.update.mockResolvedValue(updated);

    const result = await service.update(userId, invoiceId, {
      merchantName: 'Updated Store',
    });

    expect(result.merchantName).toBe('Updated Store');
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: invoiceId },
        data: { merchantName: 'Updated Store' },
      }),
    );
  });

  it('allows update when ocrStatus is FAILED', async () => {
    const failed = { ...baseInvoice, ocrStatus: OcrStatus.FAILED };
    const updated = { ...failed, merchantName: 'Fixed Store' };
    prisma.invoice.findFirst.mockResolvedValue(failed);
    prisma.invoice.update.mockResolvedValue(updated);

    const result = await service.update(userId, invoiceId, {
      merchantName: 'Fixed Store',
    });

    expect(result.merchantName).toBe('Fixed Store');
  });

  it('returns existing invoice when body is empty', async () => {
    prisma.invoice.findFirst.mockResolvedValue(baseInvoice);

    const result = await service.update(userId, invoiceId, {});

    expect(result).toEqual(baseInvoice);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when invoice is missing or not owned', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(
      service.update(userId, invoiceId, { merchantName: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws ConflictException when ocrStatus is DUPLICATE', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      ocrStatus: OcrStatus.DUPLICATE,
    });

    await expect(
      service.update(userId, invoiceId, { merchantName: 'X' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws BadRequestException when ocrStatus is PENDING', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      ocrStatus: OcrStatus.PENDING,
    });

    await expect(
      service.update(userId, invoiceId, { merchantName: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws BadRequestException when ocrStatus is PROCESSING', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      ...baseInvoice,
      ocrStatus: OcrStatus.PROCESSING,
    });

    await expect(
      service.update(userId, invoiceId, { merchantName: 'X' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes category labels to Gemini keys', async () => {
    const updated = { ...baseInvoice, category: 'MEALS' };
    prisma.invoice.findFirst.mockResolvedValue(baseInvoice);
    prisma.invoice.update.mockResolvedValue(updated);

    await service.update(userId, invoiceId, {
      category: 'Meals',
    });

    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { category: 'MEALS' },
      }),
    );
  });
});
