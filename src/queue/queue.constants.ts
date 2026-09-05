export const INVOICE_OCR_QUEUE = 'invoice-ocr';

export type InvoiceOcrJobData = {
  invoiceId: string;
  filePath: string;
  mimeType: string;
};