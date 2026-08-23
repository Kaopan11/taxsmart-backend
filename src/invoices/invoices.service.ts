import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { OcrStatus, Prisma } from '.prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVOICE_OCR_QUEUE,
  type InvoiceOcrJobData,
} from '../queue/queue.constants';

export type UploadedReceiptFile = {
  buffer: Buffer;
  mimetype: string;
};

/** Query ของ GET /invoices?q=&status=&category= */
export type InvoiceListQuery = {
  q?: string;
  status?: string;
  category?: string;
};

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const VALID_STATUSES = new Set<string>(Object.values(OcrStatus));

const CATEGORY_ALIASES: Record<string, string> = {
  OFFICE_SUPPLIES: 'OFFICE_SUPPLIES',
  'OFFICE SUPPLIES': 'OFFICE_SUPPLIES',
  TRAVEL: 'TRAVEL',
  MEALS: 'MEALS',
  UTILITIES: 'UTILITIES',
  INTERNET_PHONE: 'INTERNET_PHONE',
  'INTERNET / PHONE': 'INTERNET_PHONE',
  PROFESSIONAL_SERVICES: 'PROFESSIONAL_SERVICES',
  'PROFESSIONAL SERVICES': 'PROFESSIONAL_SERVICES',
  RENT: 'RENT',
  TRAINING: 'TRAINING',
  OTHER: 'OTHER',
};

const INVOICE_LIST_SELECT = {
  id: true,
  ocrStatus: true,
  merchantName: true,
  merchantTaxId: true,
  invoiceNumber: true,
  issueDate: true,
  totalAmount: true,
  category: true,
  rawOcrData: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INVOICE_OCR_QUEUE)
    private readonly invoiceOcrQueue: Queue<InvoiceOcrJobData>,
  ) {}

  /** P1: รับ userId จาก JWT แทน demo@taxsmart.local */
  async enqueueUpload(userId: string, file: UploadedReceiptFile) {
    const invoiceId = randomUUID();
    const extension = MIME_TO_EXT[file.mimetype] ?? '.bin';
    const relativePath = join('uploads', `${invoiceId}${extension}`);
    const absolutePath = join(process.cwd(), relativePath);

    await mkdir(join(process.cwd(), 'uploads'), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    await this.prisma.invoice.create({
      data: {
        id: invoiceId,
        userId,
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

  async findAll(userId: string, query: InvoiceListQuery = {}) {
    const where: Prisma.InvoiceWhereInput = {
      userId,
    };

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { merchantName: { contains: q } },
        { merchantTaxId: { contains: q } },
        { invoiceNumber: { contains: q } },
      ];
    }

    const status = query.status?.trim();
    if (status && status.toLowerCase() !== 'all') {
      if (!VALID_STATUSES.has(status)) {
        throw new BadRequestException(
          `Invalid status. Use one of: ${[...VALID_STATUSES].join(', ')}`,
        );
      }
      where.ocrStatus = status as OcrStatus;
    }

    const categoryKey = this.normalizeCategory(query.category);
    if (categoryKey) {
      where.category = categoryKey;
    }

    return this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: INVOICE_LIST_SELECT,
    });
  }

  /** ดูได้เฉพาะใบของตัวเอง */
  async findById(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      select: INVOICE_LIST_SELECT,
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    return invoice;
  }

  private normalizeCategory(raw?: string): string | null {
    if (!raw?.trim()) {
      return null;
    }
    const key = raw.trim().toUpperCase();
    const normalized = CATEGORY_ALIASES[key];
    if (!normalized) {
      throw new BadRequestException(
        `Invalid category. Use Gemini keys like OFFICE_SUPPLIES or labels like "Office Supplies"`,
      );
    }
    return normalized;
  }
}
