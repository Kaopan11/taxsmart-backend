/// <reference types="jest" />
import {
  assertValidStorageKey,
  buildInvoiceStorageKey,
} from './invoice-storage-key.util';

describe('invoice-storage-key.util', () => {
  it('builds key invoices/{userId}/{invoiceId}.{ext}', () => {
    expect(buildInvoiceStorageKey('user-1', 'inv-1', '.jpg')).toBe(
      'invoices/user-1/inv-1.jpg',
    );
  });

  it('accepts extension without leading dot', () => {
    expect(buildInvoiceStorageKey('user-1', 'inv-1', 'pdf')).toBe(
      'invoices/user-1/inv-1.pdf',
    );
  });

  it('assertValidStorageKey normalizes valid key', () => {
    expect(assertValidStorageKey('invoices/u/i.jpg')).toBe('invoices/u/i.jpg');
  });

  it('rejects keys outside invoices/ prefix', () => {
    expect(() => assertValidStorageKey('uploads/x.jpg')).toThrow(
      'Invalid invoice storage key',
    );
  });

  it('rejects path traversal', () => {
    expect(() => assertValidStorageKey('../../etc/passwd')).toThrow(
      'Invalid invoice storage key',
    );
  });
});
