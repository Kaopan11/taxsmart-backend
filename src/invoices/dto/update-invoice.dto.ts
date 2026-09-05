import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/** Body ของ PATCH /invoices/:id — partial update เฉพาะฟิลด์ที่แก้ได้ */
export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  merchantName?: string;

  @IsOptional()
  @IsString()
  merchantTaxId?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  totalAmount?: number;

  /** Gemini key (OFFICE_SUPPLIES) หรือ label จากฟอร์ม (Office Supplies) */
  @IsOptional()
  @IsString()
  category?: string;
}
