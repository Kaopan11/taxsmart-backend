import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  resolveInvoiceFilePath,
} from './invoice-file.util';

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
  fileUrl: true, // FE รู้ว่ามีไฟล์ — แต่ fetch ผ่าน GET /invoices/:id/file ไม่เปิด URL ตรง
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

    // jobId = invoiceId → ตอน DELETE เรียก getJob(invoiceId).remove() ยกเลิกคิวได้ตรง ๆ
    await this.invoiceOcrQueue.add(
      'extract',
      {
        invoiceId,
        filePath: relativePath.replaceAll('\\', '/'),
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
   * GET /invoices/:id/file — อ่านไฟล์ใบเสร็จจาก disk
   * ต้องเป็นเจ้าของ invoice; ไม่เปิด static public /uploads
   */
  async getInvoiceFile(userId: string, id: string): Promise<InvoiceFilePayload> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      select: { fileUrl: true },
    });

    if (!invoice) {
      throw new NotFoundException(`Invoice ${id} not found`);
    }

    let absolutePath: string;
    try {
      absolutePath = resolveInvoiceFilePath(invoice.fileUrl);
    } catch {
      throw new NotFoundException(`Invoice file for ${id} not found`);
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(absolutePath);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      if (code === 'ENOENT') {
        throw new NotFoundException(`Invoice file for ${id} not found`);
      }
      throw error;
    }

    return {
      buffer,
      contentType: contentTypeFromFileUrl(invoice.fileUrl),
      filename: filenameFromFileUrl(invoice.fileUrl),
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

    // ลบไฟล์บน disk — ไฟล์หายหรือ path ไม่ valid ไม่ block การลบ DB
    try {
      const absolutePath = resolveInvoiceFilePath(invoice.fileUrl);
      await unlink(absolutePath);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error
          ? (error as NodeJS.ErrnoException).code
          : undefined;
      const isMissingFile = code === 'ENOENT';
      const isInvalidPath =
        error instanceof Error &&
        error.message === 'Invalid invoice file path';
      if (!isMissingFile && !isInvalidPath) {
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
