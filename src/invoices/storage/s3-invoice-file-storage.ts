import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { InvoiceFileStorage } from './invoice-file-storage.interface';
import { assertValidStorageKey } from './invoice-storage-key.util';

export class S3InvoiceFileStorage implements InvoiceFileStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, data: Buffer): Promise<void> {
    const normalized = assertValidStorageKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: normalized,
        Body: data,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const normalized = assertValidStorageKey(key);
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: normalized,
      }),
    );

    if (!response.Body) {
      throw Object.assign(new Error('Object not found'), { code: 'ENOENT' });
    }

    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    const normalized = assertValidStorageKey(key);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: normalized,
      }),
    );
  }
}

export function createS3Client(config: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}
