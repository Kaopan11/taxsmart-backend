import { Injectable } from '@nestjs/common';
import { GeminiService } from '../gemini/gemini.service';

export type UploadedReceiptFile = {
  buffer: Buffer;
  mimetype: string;
};

@Injectable()
export class InvoicesService {
  constructor(private readonly geminiService: GeminiService) {}

  extractFromUpload(file: UploadedReceiptFile) {
    return this.geminiService.extractReceipt(file.buffer, file.mimetype);
  }
}