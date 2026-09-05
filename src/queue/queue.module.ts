import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiModule } from '../gemini/gemini.module';
import { InvoiceOcrProcessor } from './invoice-ocr.processor';
import { INVOICE_OCR_QUEUE } from './queue.constants';

@Module({
  imports: [
    GeminiModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const password = configService.get<string>('REDIS_PASSWORD');
        const tlsEnabled = configService.get<string>('REDIS_TLS') === 'true';

        return {
          connection: {
            host: configService.get<string>('REDIS_HOST', 'localhost'),
            port: Number(configService.get('REDIS_PORT', 6379)),
            ...(password ? { password } : {}),
            ...(tlsEnabled ? { tls: {} } : {}),
          },
        };
      },
    }),
    BullModule.registerQueue({
      name: INVOICE_OCR_QUEUE,
    }),
  ],
  providers: [InvoiceOcrProcessor],
  exports: [BullModule],
})
export class QueueModule {}
