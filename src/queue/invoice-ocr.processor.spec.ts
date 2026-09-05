/// <reference types="jest" />
import { readFile } from 'node:fs/promises';
import { Job } from 'bullmq';
import { OcrStatus } from '.prisma/client';
import { InvoiceOcrProcessor } from './invoice-ocr.processor';
import type { InvoiceOcrJobData } from './queue.constants';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('InvoiceOcrProcessor — delete race', () => {
  const invoiceId = 'inv-deleted';
  const job = {
    id: invoiceId,
    data: {
      invoiceId,
      filePath: 'uploads/inv-deleted.jpg',
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
    processor = new InvoiceOcrProcessor(prisma as never, geminiService as never);
  });

  it('stops quietly when invoice was deleted before PROCESSING update', async () => {
    prisma.invoice.update.mockRejectedValue({ code: 'P2025' });

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(geminiService.extractReceipt).not.toHaveBeenCalled();
  });

  it('stops quietly when invoice disappears after OCR extract', async () => {
    mockedReadFile.mockResolvedValue(Buffer.from('img'));
    geminiService.extractReceipt.mockResolvedValue({
      storeName: 'Shop',
      taxId: null,
      invoiceNumber: null,
    });
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
  });

  it('stops quietly when invoice was deleted before marking FAILED', async () => {
    mockedReadFile.mockRejectedValue(new Error('Gemini down'));
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(processor.process(job)).resolves.toBeUndefined();

    expect(prisma.invoice.update).toHaveBeenCalledTimes(1);
  });

  it('marks FAILED when OCR fails and invoice still exists', async () => {
    mockedReadFile.mockRejectedValue(new Error('Gemini down'));
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
