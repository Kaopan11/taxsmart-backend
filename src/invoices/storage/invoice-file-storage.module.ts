import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { INVOICE_FILE_STORAGE } from './invoice-file-storage.constants';
import { createInvoiceFileStorage } from './invoice-file-storage.factory';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: INVOICE_FILE_STORAGE,
      inject: [ConfigService],
      useFactory: createInvoiceFileStorage,
    },
  ],
  exports: [INVOICE_FILE_STORAGE],
})
export class InvoiceFileStorageModule {}
