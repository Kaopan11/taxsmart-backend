import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, Max, Min } from 'class-validator';
import { TaxpayerType } from '.prisma/client';

/** Body ของ PUT /tax/profile */
export class UpdateTaxProfileDto {
  @IsEnum(TaxpayerType)
  taxpayerType!: TaxpayerType;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedIncome!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  taxYear!: number;
}
