import type { CookieOptions, Response } from 'express';

/** ชื่อ cookie มาตรฐาน — ต้องตรงกับ .env REFRESH_COOKIE_NAME */
export const DEFAULT_REFRESH_COOKIE = 'refresh_token';

/** ตัวเลือก cookie ร่วม — prod ใช้ SameSite=None สำหรับ cross-site (Vercel → Render) */
export function refreshCookieBaseOptions(): Pick<
  CookieOptions,
  'httpOnly' | 'secure' | 'sameSite' | 'path'
> {
  const isProd = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProd, // SameSite=None ต้องมี Secure
    sameSite: isProd ? 'none' : 'lax',
    path: '/auth',
  };
}

/**
 * ตั้งค่า httpOnly cookie สำหรับ refresh token
 * JS ฝั่ง browser อ่านค่านี้ไม่ได้ (กัน XSS ขโมย refresh)
 */
export function setRefreshCookie(
  res: Response,
  rawToken: string,
  expiresAt: Date,
  cookieName = DEFAULT_REFRESH_COOKIE,
) {
  res.cookie(cookieName, rawToken, {
    ...refreshCookieBaseOptions(),
    expires: expiresAt,
  });
}

/** ลบ cookie ตอน logout */
export function clearRefreshCookie(
  res: Response,
  cookieName = DEFAULT_REFRESH_COOKIE,
) {
  res.clearCookie(cookieName, refreshCookieBaseOptions());
}
