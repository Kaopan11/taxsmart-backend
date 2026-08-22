import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { OcrStatus } from '.prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVOICE_OCR_QUEUE,
  type InvoiceOcrJobData,
} from '../queue/queue.constants';

export type UploadedReceiptFile = {
  buffer: Buffer;
  mimetype: string;
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INVOICE_OCR_QUEUE)
    private readonly invoiceOcrQueue: Queue<InvoiceOcrJobData>,
  ) {}

  async enqueueUpload(file: UploadedReceiptFile) {
    const demoUser = await this.prisma.user.findUnique({
      where: { email: 'demo@taxsmart.local' },
    });
    if (!demoUser) {
      throw new NotFoundException('Demo user is missing');
    }

    const invoiceId = randomUUID();
    const extension = MIME_TO_EXT[file.mimetype] ?? '.bin';
    const relativePath = join('uploads', `${invoiceId}${extension}`);
    const absolutePath = join(process.cwd(), relativePath);

    await mkdir(join(process.cwd(), 'uploads'), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    await this.prisma.invoice.create({
      data: {
        id: invoiceId,
        userId: demoUser.id,
        fileUrl: relativePath.replaceAll('\\', '/'),
        ocrStatus: OcrStatus.PENDING,
      },
    });

    await this.invoiceOcrQueue.add('extract', {
      invoiceId,
      filePath: relativePath.replaceAll('\\', '/'),
      mimeType: file.mimetype,
    });

    return {
      invoiceId,
      ocrStatus: OcrStatus.PENDING,
    };
  }

  async findAll() {
    // Step 5: รายการใบทั้งหมดของ demo user (ยังไม่มี JWT)
    const demoUser = await this.prisma.user.findUnique({
      where: { email: 'demo@taxsmart.local' },
    });
    if (!demoUser) {
      throw new NotFoundException('Demo user is missing');
    }

    return this.prisma.invoice.findMany({
      where: { userId: demoUser.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ocrStatus: true,
        merchantName: true,
        merchantTaxId: true,
        invoiceNumber: true,
        issueDate: true,
        totalAmount: true,
        rawOcrData: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        ocrStatus: true,
        merchantName: true,
        merchantTaxId: true,
        invoiceNumber: true,
        issueDate: true,
        totalAmount: true,
        rawOcrData: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    return invoice;
  }
}