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

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          ocrStatus: OcrStatus.COMPLETED,
          merchantName: extracted.storeName,
          merchantTaxId: extracted.taxId,
          issueDate: extracted.invoiceDate
            ? new Date(`${extracted.invoiceDate}T00:00:00.000Z`)
            : null,
          totalAmount: extracted.totalAmount,
          rawOcrData: extracted,
        },
      });

      this.logger.log(`OCR done invoiceId=${invoiceId}`);
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