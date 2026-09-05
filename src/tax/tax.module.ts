import { Module } from '@nestjs/common';
import { TaxController } from './tax.controller';
import { TaxProfileService } from './tax-profile.service';

@Module({
  controllers: [TaxController],
  providers: [TaxProfileService],
  exports: [TaxProfileService],
})
export class TaxModule {}
