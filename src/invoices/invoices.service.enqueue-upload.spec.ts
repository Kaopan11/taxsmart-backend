/// <reference types="jest" />
import { mkdir, writeFile } from 'node:fs/promises';
import { OcrStatus } from '.prisma/client';
import { InvoicesService } from './invoices.service';

jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => 'fixed-invoice-id'),
}));

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
  readFile: jest.fn(),
}));

const mockedMkdir = mkdir as jest.MockedFunction<typeof mkdir>;
const mockedWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;

describe('InvoicesService.enqueueUpload', () => {
  let prisma: {
    invoice: {
      create: jest.Mock;
    };
  };
  let invoiceOcrQueue: {
    add: jest.Mock;
  };
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
    service = new InvoicesService(prisma as never, invoiceOcrQueue as never);
  });

  it('enqueues OCR job with jobId equal to invoiceId', async () => {
    const result = await service.enqueueUpload('user-1', {
      buffer: Buffer.from('receipt'),
      mimetype: 'image/jpeg',
    });

    expect(result).toEqual({
      invoiceId: 'fixed-invoice-id',
      ocrStatus: OcrStatus.PENDING,
    });
    expect(invoiceOcrQueue.add).toHaveBeenCalledWith(
      'extract',
      {
        invoiceId: 'fixed-invoice-id',
        filePath: 'uploads/fixed-invoice-id.jpg',
        mimeType: 'image/jpeg',
      },
      { jobId: 'fixed-invoice-id' },
    );
    expect(mockedMkdir).toHaveBeenCalled();
    expect(mockedWriteFile).toHaveBeenCalled();
    expect(prisma.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: 'fixed-invoice-id' }),
      }),
    );
  });
});
