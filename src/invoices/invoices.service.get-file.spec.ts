/// <reference types="jest" />
import { NotFoundException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { InvoicesService } from './invoices.service';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

const mockedReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('InvoicesService.getInvoiceFile', () => {
  const userId = 'user-1';
  const invoiceId = 'inv-1';

  let prisma: {
    invoice: {
      findFirst: jest.Mock;
    };
  };
  let service: InvoicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      invoice: {
        findFirst: jest.fn(),
      },
    };
    service = new InvoicesService(prisma as never, {} as never);
  });

  it('returns buffer, contentType, and filename for owned invoice', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      fileUrl: 'uploads/inv-1.jpg',
    });
    mockedReadFile.mockResolvedValue(Buffer.from('fake-image'));

    const result = await service.getInvoiceFile(userId, invoiceId);

    expect(result.buffer).toEqual(Buffer.from('fake-image'));
    expect(result.contentType).toBe('image/jpeg');
    expect(result.filename).toBe('inv-1.jpg');
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: invoiceId, userId },
      select: { fileUrl: true },
    });
  });

  it('throws NotFoundException when invoice is missing or not owned', async () => {
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(
      service.getInvoiceFile(userId, invoiceId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when file is missing on disk', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      fileUrl: 'uploads/inv-1.jpg',
    });
    mockedReadFile.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    await expect(
      service.getInvoiceFile(userId, invoiceId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException for invalid fileUrl path', async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      fileUrl: '../../etc/passwd',
    });

    await expect(
      service.getInvoiceFile(userId, invoiceId),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockedReadFile).not.toHaveBeenCalled();
  });
});
