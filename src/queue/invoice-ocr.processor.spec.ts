/// <reference types="jest" />
import { Job } from 'bullmq';
import { OcrStatus } from '.prisma/client';
import { InvoiceOcrProcessor } from './invoice-ocr.processor';
import type { InvoiceOcrJobData } from './queue.constants';
import type { InvoiceFileStorage } from '../invoices/storage/invoice-file-storage.interface';

describe('InvoiceOcrProcessor — delete race', () => {
  const invoiceId = 'inv-deleted';
  const job = {
    id: invoiceId,
    data: {
      invoiceId,
      storageKey: 'invoices/user-1/inv-deleted.jpg',
      mimeType: 'image/jpeg',
    },
  } as Job<InvoiceOcrJobData>;

  let prisma: {
    invoice: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let geminiService: {
    extractReceipt: jest.Mock;
  };
  let fileStorage: jest.Mocked<InvoiceFileStorage>;
  let processor: InvoiceOcrProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      invoice: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    geminiService = {
      extractReceipt: jest.fn(),
    };
    fileStorage = {
      put: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };
    processor = new InvoiceOcrProcessor(
      prisma as never,
      geminiService as never,
      fileStorage,
    );
  });

  it('stops quietly when invoice was deleted before PROCESSING update', async () => {
    prisma.invoice.update.mockRejectedValue({ code: 'P2025' });

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(geminiService.extractReceipt).not.toHaveBeenCalled();
  });

  it('stops quietly when invoice disappears after OCR extract', async () => {
    fileStorage.get.mockResolvedValue(Buffer.from('img'));
    geminiService.extractReceipt.mockResolvedValue({
      storeName: 'Shop',
      taxId: null,
      invoiceNumber: null,
    });
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(fileStorage.get).toHaveBeenCalledWith(
      'invoices/user-1/inv-deleted.jpg',
    );
    expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
  });

  it('stops quietly when invoice was deleted before marking FAILED', async () => {
    fileStorage.get.mockRejectedValue(new Error('Gemini down'));
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
  });

  it('marks FAILED when OCR fails and invoice still exists', async () => {
    fileStorage.get.mockRejectedValue(new Error('Gemini down'));
    prisma.invoice.findUnique.mockResolvedValue({ id: invoiceId });

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(prisma.invoice.update).toHaveBeenLastCalledWith({
      where: { id: invoiceId },
      data: {
        ocrStatus: OcrStatus.FAILED,
        rawOcrData: { error: 'Gemini down' },
      },
    });
  });
});
