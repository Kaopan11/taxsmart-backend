import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { OcrStatus } from '.prisma/client';
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

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { ocrStatus: OcrStatus.PROCESSING },
    });

    try {
      const absolutePath = join(process.cwd(), ...filePath.split('/'));
      const buffer = await readFile(absolutePath);
      const extracted = await this.geminiService.extractReceipt(
        buffer,
        mimeType,
      );

      // ต้องรู้ userId ของใบนี้ก่อนเช็กซ้ำ
      const current = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: { userId: true },
      });
      if (!current) {
        throw new Error(`Invoice ${invoiceId} not found during OCR`);
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

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          ocrStatus,
          merchantName: extracted.storeName,
          merchantTaxId: taxId,
          invoiceNumber,
          issueDate: extracted.invoiceDate
            ? new Date(`${extracted.invoiceDate}T00:00:00.000Z`)
            : null,
          totalAmount: extracted.totalAmount,
          // Step B5: เก็บหมวดเป็นคอลัมน์ เพื่อ GET /invoices?category=...
          category: extracted.category,
          rawOcrData: extracted,
        },
      });

      this.logger.log(
        `OCR done invoiceId=${invoiceId} status=${ocrStatus}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown OCR error';
      this.logger.error(`OCR failed invoiceId=${invoiceId}: ${message}`);

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          ocrStatus: OcrStatus.FAILED,
          rawOcrData: { error: message },
        },
      });
    }
  }
}
