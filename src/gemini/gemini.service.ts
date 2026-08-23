import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type ReceiptCategory =
  | 'OFFICE_SUPPLIES'
  | 'TRAVEL'
  | 'MEALS'
  | 'UTILITIES'
  | 'INTERNET_PHONE'
  | 'PROFESSIONAL_SERVICES'
  | 'RENT'
  | 'TRAINING'
  | 'OTHER';

export type ExtractedReceipt = {
  storeName: string | null;
  taxId: string | null;
  /** เลขที่ใบเสร็จ / ใบกำกับภาษี — ใช้คู่กับ taxId ตอนเช็กซ้ำ */
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmount: number | null;
  category: ReceiptCategory;
};

@Injectable()
export class GeminiService {
  private readonly apiKey: string;
  private readonly model = 'gemini-3.6-flash';

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    this.apiKey = apiKey;
  }

  async extractReceipt(
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<ExtractedReceipt> {
    const { GoogleGenAI, Type } = await import('@google/genai');
    const client = new GoogleGenAI({ apiKey: this.apiKey });

    const response = await client.models.generateContent({
      model: this.model,
      contents: [
        {
          inlineData: {
            mimeType,
            data: fileBuffer.toString('base64'),
          },
        },
        {
          text: 'Extract invoice/receipt data from this image or PDF.',
        },
      ],
      config: {
        systemInstruction: [
          'You are TaxSmart AI, an OCR engine for Thai tax invoices and receipts.',
          'Read only what is visible. Do not invent values.',
          'If a field is missing or unreadable, return null.',
          'taxId must be 13 digits when present, digits only.',
          'invoiceNumber is the receipt/invoice document number when present.',
          'invoiceDate must be YYYY-MM-DD.',
          'totalAmount is the final payable amount in THB, no currency symbol.',
          'Pick the closest tax category for SME/freelance deduction.',
        ].join(' '),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            storeName: { type: Type.STRING, nullable: true },
            taxId: { type: Type.STRING, nullable: true },
            invoiceNumber: { type: Type.STRING, nullable: true },
            invoiceDate: { type: Type.STRING, nullable: true },
            totalAmount: { type: Type.NUMBER, nullable: true },
            category: {
              type: Type.STRING,
              enum: [
                'OFFICE_SUPPLIES',
                'TRAVEL',
                'MEALS',
                'UTILITIES',
                'INTERNET_PHONE',
                'PROFESSIONAL_SERVICES',
                'RENT',
                'TRAINING',
                'OTHER',
              ],
            },
          },
          required: [
            'storeName',
            'taxId',
            'invoiceNumber',
            'invoiceDate',
            'totalAmount',
            'category',
          ],
        },
      },
    });

    const raw = response.text;
    if (!raw) {
      throw new InternalServerErrorException('Gemini returned an empty response');
    }

    return JSON.parse(raw) as ExtractedReceipt;
  }
}
