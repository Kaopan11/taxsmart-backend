export const INVOICE_STORAGE_KEY_PREFIX = 'invoices/';

/** Object key: invoices/{userId}/{invoiceId}.{ext} */
export function buildInvoiceStorageKey(
  userId: string,
  invoiceId: string,
  extension: string,
): string {
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  return `${INVOICE_STORAGE_KEY_PREFIX}${userId}/${invoiceId}${ext}`;
}

/** ป้องกัน path traversal — ใช้ก่อน get/put/delete ทุก adapter */
export function assertValidStorageKey(key: string): string {
  const normalized = key.replaceAll('\\', '/');

  if (normalized.includes('..') || !normalized.startsWith(INVOICE_STORAGE_KEY_PREFIX)) {
    throw new Error('Invalid invoice storage key');
  }

  return normalized;
}
