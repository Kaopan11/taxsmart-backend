/// <reference types="jest" />
import { NotFoundException } from '@nestjs/common';
import { OcrStatus } from '.prisma/client';
import { InvoicesService } from './invoices.service';
import type { InvoiceFileStorage } from './storage/invoice-file-storage.interface';

describe('InvoicesService.remove', () => {
  const userId = 'user-1';
  const invoiceId = 'inv-1';

  let prisma: {
    invoice: {
      findFirst: jest.Mock;
      delete: jest.Mock;
    };
  };
  let invoiceOcrQueue: {
    getJob: jest.Mock;
  };
  let fileStorage: jest.Mocked<InvoiceFileStorage>;
  let service: InvoicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      invoice: {
        findFirst: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };
    invoiceOcrQueue = {
      getJob: jest.fn().mockResolvedValue(null),
    };
    fileStorage = {
      put: jest.fn(),
      get: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new InvoicesService(
      prisma as never,
      invoiceOcrQueue as never,
      fileStorage,
    );
  });

  it('deletes owned invoice, storage object, and returns void', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      fileUrl: 'invoices/user-1/inv-1.jpg',
      ocrStatus: OcrStatus.COMPLETED,
    });

    await expect(service.remove(userId, invoiceId)).resolves.toBeUndefined();

    expect(fileStorage.delete).toHaveBeenCalledWith('invoices/user-1/inv-1.jpg');
    expect(prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: invoiceId } });
    expect(invoiceOcrQueue.getJob).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when invoice is missing or not owned', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(service.remove(userId, invoiceId)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(fileStorage.delete).not.toHaveBeenCalled();
    expect(prisma.invoice.delete).not.toHaveBeenCalled();
  });

  it('removes BullMQ job when ocrStatus is PENDING', async () => {
    const jobRemove = jest.fn().mockResolvedValue(undefined);
    prisma.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      fileUrl: 'invoices/user-1/inv-1.jpg',
      ocrStatus: OcrStatus.PENDING,
    });
    invoiceOcrQueue.getJob.mockResolvedValue({ remove: jobRemove });

    await service.remove(userId, invoiceId);

    expect(invoiceOcrQueue.getJob).toHaveBeenCalledWith(invoiceId);
    expect(jobRemove).toHaveBeenCalled();
    expect(prisma.invoice.delete).toHaveBeenCalled();
  });

  it('removes BullMQ job when ocrStatus is PROCESSING', async () => {
    const jobRemove = jest.fn().mockResolvedValue(undefined);
    prisma.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      fileUrl: 'invoices/user-1/inv-1.pdf',
      ocrStatus: OcrStatus.PROCESSING,
    });
    invoiceOcrQueue.getJob.mockResolvedValue({ remove: jobRemove });

    await service.remove(userId, invoiceId);

    expect(invoiceOcrQueue.getJob).toHaveBeenCalledWith(invoiceId);
    expect(jobRemove).toHaveBeenCalled();
  });

  it('still deletes DB when storage object is missing', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      fileUrl: 'invoices/user-1/inv-1.jpg',
      ocrStatus: OcrStatus.COMPLETED,
    });
    fileStorage.delete.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    await service.remove(userId, invoiceId);

    expect(prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: invoiceId } });
  });

  it('allows delete for DUPLICATE status', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      fileUrl: 'invoices/user-1/inv-1.jpg',
      ocrStatus: OcrStatus.DUPLICATE,
    });

    await service.remove(userId, invoiceId);

    expect(prisma.invoice.delete).toHaveBeenCalled();
  });
});
