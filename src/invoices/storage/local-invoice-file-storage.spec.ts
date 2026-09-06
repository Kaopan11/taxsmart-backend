/// <reference types="jest" />
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalInvoiceFileStorage } from './local-invoice-file-storage';

describe('LocalInvoiceFileStorage', () => {
  let rootDir: string;
  let storage: LocalInvoiceFileStorage;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'taxsmart-invoice-'));
    storage = new LocalInvoiceFileStorage(rootDir);
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('put, get, and delete round-trip', async () => {
    const key = 'invoices/user-1/inv-1.jpg';
    const data = Buffer.from('receipt-bytes');

    await storage.put(key, data);
    expect(await storage.get(key)).toEqual(data);

    await storage.delete(key);
    await expect(storage.get(key)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects invalid storage keys', async () => {
    await expect(storage.put('../../etc/passwd', Buffer.from('x'))).rejects.toThrow(
      'Invalid invoice storage key',
    );
  });

  it('writes under rootDir using key path', async () => {
    const key = 'invoices/user-1/inv-2.pdf';
    await storage.put(key, Buffer.from('pdf'));

    const onDisk = await readFile(join(rootDir, key));
    expect(onDisk).toEqual(Buffer.from('pdf'));
  });
});
