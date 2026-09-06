/// <reference types="jest" />
import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import type { InvoiceFileStorage } from './storage/invoice-file-storage.interface';

describe('InvoicesService.getInvoiceFile', () => {
  const userId = 'user-1';
  const invoiceId = 'inv-1';

  let prisma: {
    invoice: {
      findFirst: jest.Mock;
    };
  };
  let fileStorage: jest.Mocked<InvoiceFileStorage>;
  let service: InvoicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      invoice: {
        findFirst: jest.fn(),
      },
    };
    fileStorage = {
      put: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
    };
    service = new InvoicesService(prisma as never, {} as never, fileStorage);
  });

  it('returns buffer, contentType, and filename for owned invoice', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      fileUrl: 'invoices/user-1/inv-1.jpg',
    });
    fileStorage.get.mockResolvedValue(Buffer.from('fake-image'));

    const result = await service.getInvoiceFile(userId, invoiceId);

    expect(result.buffer).toEqual(Buffer.from('fake-image'));
    expect(result.contentType).toBe('image/jpeg');
    expect(result.filename).toBe('inv-1.jpg');
    expect(fileStorage.get).toHaveBeenCalledWith('invoices/user-1/inv-1.jpg');
  });

  it('throws NotFoundException when invoice is missing or not owned', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(
      service.getInvoiceFile(userId, invoiceId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when file is missing in storage', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      fileUrl: 'invoices/user-1/inv-1.jpg',
    });
    fileStorage.get.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    await expect(
      service.getInvoiceFile(userId, invoiceId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException for invalid storage key', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      fileUrl: '../../etc/passwd',
    });

    await expect(
      service.getInvoiceFile(userId, invoiceId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(fileStorage.get).not.toHaveBeenCalled();
  });
});
