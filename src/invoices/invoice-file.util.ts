import { basename, extname } from 'node:path';

/** นามสกุลที่ upload รองรับ → Content-Type สำหรับ response */
const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

/** แปลง storage key ใน DB (เช่น invoices/uuid/id.jpg) → mime สำหรับ header */
export function contentTypeFromFileUrl(fileUrl: string): string {
  const ext = extname(fileUrl.replaceAll('\\', '/')).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
}

/** ชื่อไฟล์ที่แสดงใน Content-Disposition (preview ใน browser) */
export function filenameFromFileUrl(fileUrl: string): string {
  return basename(fileUrl.replaceAll('\\', '/'));
}
