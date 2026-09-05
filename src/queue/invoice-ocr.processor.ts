import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OcrStatus, Prisma } from '.prisma/client';
import { GeminiService } from '../gemini/gemini.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVOICE_OCR_QUEUE,
  type InvoiceOcrJobData,
} from './queue.constants';

@Processor(INVOICE_OCR_QUEUE)
export class InvoiceOcrProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceOcrProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {
    super();
  }

  async process(job: Job<InvoiceOcrJobData>): Promise<void> {
    const { invoiceId, filePath, mimeType } = job.data;
    this.logger.log(`OCR start invoiceId=${invoiceId} jobId=${job.id}`);

    const markedProcessing = await this.safeInvoiceUpdate(
      invoiceId,
      { ocrStatus: OcrStatus.PROCESSING },
      'mark-processing',
    );
    if (!markedProcessing) {
      return;
    }

    try {
      const absolutePath = join(process.cwd(), ...filePath.split('/'));
      const buffer = await readFile(absolutePath);
      const extracted = await this.geminiService.extractReceipt(
        buffer,
        mimeType,
      );

      // ใบอาจถูก DELETE ระหว่างรอ Gemini — หยุดเงียบ ๆ ไม่ throw
      if (await this.isInvoiceDeleted(invoiceId, 'after-extract')) {
        return;
      }

      const current = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { userId: true },
      });
      if (!current) {
        this.logger.warn(
          `OCR aborted invoiceId=${invoiceId} — invoice deleted during OCR`,
        );
        return;
      }

      // เช็กซ้ำได้เมื่อมีทั้งเลขผู้เสียภาษี + เลขที่บิล
      // ใบอื่นของ user เดียวกันที่ COMPLETED หรือ DUPLICATE แล้ว
      let ocrStatus: OcrStatus = OcrStatus.COMPLETED;
      const taxId = extracted.taxId?.trim() || null;
      const invoiceNumber = extracted.invoiceNumber?.trim() || null;

      if (taxId && invoiceNumber) {
        const duplicate = await this.prisma.invoice.findFirst({
          where: {
            userId: current.userId,
            id: { not: invoiceId },
            merchantTaxId: taxId,
            invoiceNumber,
            ocrStatus: {
              in: [OcrStatus.COMPLETED, OcrStatus.DUPLICATE],
            },
          },
          select: { id: true },
        });

        if (duplicate) {
          ocrStatus = OcrStatus.DUPLICATE;
          this.logger.warn(
            `Duplicate invoiceId=${invoiceId} matches existing=${duplicate.id}`,
          );
        }
      }

      if (await this.isInvoiceDeleted(invoiceId, 'before-complete')) {
        return;
      }

      const completed = await this.safeInvoiceUpdate(
        invoiceId,
        {
          ocrStatus,
          merchantName: extracted.storeName,
          merchantTaxId: taxId,
          invoiceNumber,
          issueDate: extracted.invoiceDate
            ? new Date(`${extracted.invoiceDate}T00:00:00.000Z`)
            : null,
          totalAmount: extracted.totalAmount,
          category: extracted.category,
          rawOcrData: extracted,
        },
        'mark-complete',
      );
      if (!completed) {
        return;
      }

      this.logger.log(
        `OCR done invoiceId=${invoiceId} status=${ocrStatus}`,
      );
    } catch (error) {
      // ถ้า user ลบใบระหว่าง OCR จริง ๆ — ไม่ log error รก
      if (await this.isInvoiceDeleted(invoiceId, 'after-error')) {
        return;
      }

      const message =
        error instanceof Error ? error.message : 'Unknown OCR error';
      this.logger.error(`OCR failed invoiceId=${invoiceId}: ${message}`);

      await this.safeInvoiceUpdate(
        invoiceId,
        {
          ocrStatus: OcrStatus.FAILED,
          rawOcrData: { error: message },
        },
        'mark-failed',
      );
    }
  }

  /** ใบถูกลบแล้ว (DELETE) — worker หยุดต่อ ไม่ throw */
  private async isInvoiceDeleted(
    invoiceId: string,
    phase: string,
  ): Promise<boolean> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true },
    });
    if (!row) {
      this.logger.warn(
        `OCR aborted invoiceId=${invoiceId} at ${phase} — invoice deleted`,
      );
      return true;
    }
    return false;
  }

  /**
   * update invoice แบบจับ P2025 (record ถูกลบระหว่างทาง)
   * คืน false = หยุด job เงียบ ๆ
   */
  private async safeInvoiceUpdate(
    invoiceId: string,
    data: Prisma.InvoiceUpdateInput,
    phase: string,
  ): Promise<boolean> {
    try {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data,
      });
      return true;
    } catch (error) {
      if (this.isRecordNotFound(error)) {
        this.logger.warn(
          `OCR update skipped invoiceId=${invoiceId} at ${phase} — invoice deleted`,
        );
        return false;
      }
      throw error;
    }
  }

  private isRecordNotFound(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2025'
    );
  }
}
