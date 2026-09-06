import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { InvoiceFileStorageModule } from './storage/invoice-file-storage.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [QueueModule, InvoiceFileStorageModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
