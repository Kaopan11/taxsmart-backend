import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { InvoiceFileStorage } from './invoice-file-storage.interface';
import { assertValidStorageKey } from './invoice-storage-key.util';

export class LocalInvoiceFileStorage implements InvoiceFileStorage {
  constructor(private readonly rootDir: string) {}

  private resolvePath(key: string): string {
    const normalized = assertValidStorageKey(key);
    return join(this.rootDir, normalized);
  }

  async put(key: string, data: Buffer): Promise<void> {
    const absolutePath = this.resolvePath(key);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolvePath(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolvePath(key));
  }
}
