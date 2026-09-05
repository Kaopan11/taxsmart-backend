import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [QueueModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}