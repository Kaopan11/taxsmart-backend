/// <reference types="jest" />
import { OcrStatus } from '.prisma/client';
import { InvoicesService } from './invoices.service';
import type { InvoiceFileStorage } from './storage/invoice-file-storage.interface';

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'fixed-invoice-id'),
}));

describe('InvoicesService.enqueueUpload', () => {
  let prisma: {
    invoice: {
      create: jest.Mock;
    };
  };
  let invoiceOcrQueue: {
    add: jest.Mock;
  };
  let fileStorage: jest.Mocked<InvoiceFileStorage>;
  let service: InvoicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      invoice: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    invoiceOcrQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };
    fileStorage = {
      put: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new InvoicesService(
      prisma as never,
      invoiceOcrQueue as never,
      fileStorage,
    );
  });

  it('stores file, creates invoice, and enqueues OCR with storageKey', async () => {
    const result = await service.enqueueUpload('user-1', {
      buffer: Buffer.from('receipt'),
      mimetype: 'image/jpeg',
    });

    expect(result).toEqual({
      invoiceId: 'fixed-invoice-id',
      ocrStatus: OcrStatus.PENDING,
    });
    expect(fileStorage.put).toHaveBeenCalledWith(
      'invoices/user-1/fixed-invoice-id.jpg',
      Buffer.from('receipt'),
    );
    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          id: 'fixed-invoice-id',
          fileUrl: 'invoices/user-1/fixed-invoice-id.jpg',
        }),
      }),
    );
    expect(invoiceOcrQueue.add).toHaveBeenCalledWith(
      'extract',
      {
        invoiceId: 'fixed-invoice-id',
        storageKey: 'invoices/user-1/fixed-invoice-id.jpg',
        mimeType: 'image/jpeg',
      },
      { jobId: 'fixed-invoice-id' },
    );
  });

  it('does not create invoice when storage put fails', async () => {
    fileStorage.put.mockRejectedValue(new Error('disk full'));

    await expect(
      service.enqueueUpload('user-1', {
        buffer: Buffer.from('receipt'),
        mimetype: 'image/jpeg',
      }),
    ).rejects.toThrow('disk full');

    expect(prisma.invoice.create).not.toHaveBeenCalled();
    expect(invoiceOcrQueue.add).not.toHaveBeenCalled();
  });

  it('rolls back storage when invoice create fails', async () => {
    prisma.invoice.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.enqueueUpload('user-1', {
        buffer: Buffer.from('receipt'),
        mimetype: 'image/jpeg',
      }),
    ).rejects.toThrow('db down');

    expect(fileStorage.delete).toHaveBeenCalledWith(
      'invoices/user-1/fixed-invoice-id.jpg',
    );
    expect(invoiceOcrQueue.add).not.toHaveBeenCalled();
  });
});
