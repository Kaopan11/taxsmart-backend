/// <reference types="jest" />
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { S3InvoiceFileStorage } from './s3-invoice-file-storage';

describe('S3InvoiceFileStorage', () => {
  const bucket = 'taxsmart-invoices-prod';
  const send = jest.fn();
  const client = { send } as never;
  let storage: S3InvoiceFileStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    storage = new S3InvoiceFileStorage(client, bucket);
  });

  it('put sends PutObjectCommand with validated key', async () => {
    send.mockResolvedValue(undefined);

    await storage.put('invoices/user-1/inv-1.jpg', Buffer.from('img'));

    expect(send).toHaveBeenCalledWith(expect.any(PutObjectCommand));
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input).toEqual({
      Bucket: bucket,
      Key: 'invoices/user-1/inv-1.jpg',
      Body: Buffer.from('img'),
    });
  });

  it('get returns buffer from S3 body', async () => {
    send.mockResolvedValue({
      Body: {
        transformToByteArray: jest
          .fn()
          .mockResolvedValue(Uint8Array.from([1, 2, 3])),
      },
    });

    const buffer = await storage.get('invoices/user-1/inv-1.jpg');

    expect(buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand));
  });

  it('delete sends DeleteObjectCommand', async () => {
    send.mockResolvedValue(undefined);

    await storage.delete('invoices/user-1/inv-1.jpg');

    expect(send).toHaveBeenCalledWith(expect.any(DeleteObjectCommand));
  });

  it('rejects invalid keys before calling S3', async () => {
    await expect(storage.put('uploads/x.jpg', Buffer.from('x'))).rejects.toThrow(
      'Invalid invoice storage key',
    );
    expect(send).not.toHaveBeenCalled();
  });
});
