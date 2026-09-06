export const INVOICE_OCR_QUEUE = 'invoice-ocr';

export type InvoiceOcrJobData = {
  invoiceId: string;
  storageKey: string;
  mimeType: string;
};