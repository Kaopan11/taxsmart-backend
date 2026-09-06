import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OcrStatus, Prisma } from '.prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVOICE_OCR_QUEUE,
  type InvoiceOcrJobData,
} from '../queue/queue.constants';
import type { UpdateInvoiceDto } from './dto/update-invoice.dto';
import {
  contentTypeFromFileUrl,
  filenameFromFileUrl,
} from './invoice-file.util';
import { INVOICE_FILE_STORAGE } from './storage/invoice-file-storage.constants';
import type { InvoiceFileStorage } from './storage/invoice-file-storage.interface';
import { assertValidStorageKey, buildInvoiceStorageKey } from './storage/invoice-storage-key.util';

export type UploadedReceiptFile = {
  buffer: Buffer;
  mimetype: string;
};

/** ข้อมูลไฟล์ที่ controller ใช้ส่ง binary + headers */
export type InvoiceFilePayload = {
  buffer: Buffer;
  contentType: string;
  filename: string;
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
  fileUrl: true, // storage key — fetch ผ่าน GET /invoices/:id/file
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
    @Inject(INVOICE_FILE_STORAGE)
    private readonly fileStorage: InvoiceFileStorage,
  ) {}

  /** P1: รับ userId จาก JWT แทน demo@taxsmart.local */
  async enqueueUpload(userId: string, file: UploadedReceiptFile) {
    const invoiceId = randomUUID();
    const extension = MIME_TO_EXT[file.mimetype] ?? '.bin';
    const storageKey = buildInvoiceStorageKey(userId, invoiceId, extension);

    await this.fileStorage.put(storageKey, file.buffer);

    try {
      await this.prisma.invoice.create({
        data: {
          id: invoiceId,
          userId,
          fileUrl: storageKey,
          ocrStatus: OcrStatus.PENDING,
        },
      });
    } catch (error) {
      await this.fileStorage.delete(storageKey).catch(() => undefined);
      throw error;
    }

    // jobId = invoiceId → ตอน DELETE เรียก getJob(invoiceId).remove() ยกเลิกคิวได้ตรง ๆ
    await this.invoiceOcrQueue.add(
      'extract',
      {
        invoiceId,
        storageKey,
        mimeType: file.mimetype,
      },
      { jobId: invoiceId },
    );

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

  /**
   * GET /invoices/:id/file — อ่านไฟล์ใบเสร็จจาก storage
   * ต้องเป็นเจ้าของ invoice; bucket private — ไม่เปิด public URL
   */
  async getInvoiceFile(userId: string, id: string): Promise<InvoiceFilePayload> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      select: { fileUrl: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    let storageKey: string;
    try {
      storageKey = assertValidStorageKey(invoice.fileUrl);
    } catch {
      throw new NotFoundException(`Invoice file for ${id} not found`);
    }

    let buffer: Buffer;
    try {
      buffer = await this.fileStorage.get(storageKey);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (code === 'ENOENT' || code === 'NoSuchKey') {
        throw new NotFoundException(`Invoice file for ${id} not found`);
      }
      throw error;
    }

    return {
      buffer,
      contentType: contentTypeFromFileUrl(storageKey),
      filename: filenameFromFileUrl(storageKey),
    };
  }

  /**
   * PATCH /invoices/:id — อัปเดตฟิลด์ที่แก้ได้หลัง OCR จบ
   * อนุญาตเฉพาะ COMPLETED / FAILED; ไม่แตะ fileUrl และไม่รัน OCR ใหม่
   */
  async update(userId: string, id: string, dto: UpdateInvoiceDto) {
    const existing = await this.prisma.invoice.findFirst({
      where: { id, userId },
      select: INVOICE_LIST_SELECT,
    });

    if (!existing) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    if (existing.ocrStatus === OcrStatus.DUPLICATE) {
      throw new ConflictException(
        'Cannot update a duplicate invoice (tax ID + invoice number already exists)',
      );
    }

    if (
      existing.ocrStatus === OcrStatus.PENDING ||
      existing.ocrStatus === OcrStatus.PROCESSING
    ) {
      throw new BadRequestException(
        'Cannot update invoice while OCR is still in progress',
      );
    }

    const data: Prisma.InvoiceUpdateInput = {};

    if (dto.merchantName !== undefined) {
      data.merchantName = dto.merchantName;
    }
    if (dto.merchantTaxId !== undefined) {
      data.merchantTaxId = dto.merchantTaxId;
    }
    if (dto.invoiceNumber !== undefined) {
      data.invoiceNumber = dto.invoiceNumber;
    }
    if (dto.issueDate !== undefined) {
      data.issueDate = new Date(dto.issueDate);
    }
    if (dto.totalAmount !== undefined) {
      data.totalAmount = dto.totalAmount;
    }
    if (dto.category !== undefined) {
      const categoryKey = this.normalizeCategory(dto.category);
      if (!categoryKey) {
        throw new BadRequestException('category must not be empty');
      }
      data.category = categoryKey;
    }

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return this.prisma.invoice.update({
      where: { id },
      data,
      select: INVOICE_LIST_SELECT,
    });
  }

  /**
   * DELETE /invoices/:id — ลบใบเสร็จถาวร (hard delete)
   * ลบได้ทุก ocrStatus — ต่างจาก PATCH ที่ block PENDING/PROCESSING/DUPLICATE
   */
  async remove(userId: string, id: string): Promise<void> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      select: { id: true, fileUrl: true, ocrStatus: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    // ยกเลิกคิว OCR ถ้ายังไม่จบ — jobId ตั้งเป็น invoiceId ตอน upload
    if (
      invoice.ocrStatus === OcrStatus.PENDING ||
      invoice.ocrStatus === OcrStatus.PROCESSING
    ) {
      const job = await this.invoiceOcrQueue.getJob(id);
      if (job) {
        await job.remove();
      }
    }

    // ลบ object ใน storage — ไฟล์หายหรือ key ไม่ valid ไม่ block การลบ DB
    try {
      const storageKey = assertValidStorageKey(invoice.fileUrl);
      await this.fileStorage.delete(storageKey);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      const isMissingFile = code === 'ENOENT' || code === 'NoSuchKey';
      const isInvalidKey =
        error instanceof Error &&
        error.message === 'Invalid invoice storage key';
      if (!isMissingFile && !isInvalidKey) {
        throw error;
      }
    }

    // InvoiceItem ลบ cascade ตาม schema — ไม่ต้องลบเอง
    await this.prisma.invoice.delete({ where: { id } });
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
