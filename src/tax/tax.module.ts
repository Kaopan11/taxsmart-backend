import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxProfileService } from './tax-profile.service';
import { TaxSavingsService } from './tax-savings.service';

@Module({
  controllers: [TaxController],
  providers: [TaxProfileService, TaxSavingsService],
  exports: [TaxProfileService, TaxSavingsService],
})
export class TaxModule {}
