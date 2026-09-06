import { ConfigService } from '@nestjs/config';
import type { InvoiceFileStorage } from './invoice-file-storage.interface';
import { LocalInvoiceFileStorage } from './local-invoice-file-storage';
import {
  createS3Client,
  S3InvoiceFileStorage,
} from './s3-invoice-file-storage';

export function createInvoiceFileStorage(
  configService: ConfigService,
): InvoiceFileStorage {
  const driver = configService.get<string>('STORAGE_DRIVER', 'local');

  if (driver === 's3') {
    const bucket = configService.get<string>('S3_BUCKET');
    const endpoint = configService.get<string>('S3_ENDPOINT');
    const region = configService.get<string>('S3_REGION', 'auto');
    const accessKeyId = configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = configService.get<string>('S3_SECRET_ACCESS_KEY');

    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'S3 storage requires S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
      );
    }

    const client = createS3Client({
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
    });

    return new S3InvoiceFileStorage(client, bucket);
  }

  const rootDir =
    configService.get<string>('LOCAL_STORAGE_ROOT') ?? process.cwd();
  return new LocalInvoiceFileStorage(rootDir);
}
