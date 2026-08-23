import type { CookieOptions, Response } from 'express';

/** ชื่อ cookie มาตรฐาน — ต้องตรงกับ .env REFRESH_COOKIE_NAME */
export const DEFAULT_REFRESH_COOKIE = 'refresh_token';

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
  const isProd = process.env.NODE_ENV === 'production';

  const options: CookieOptions = {
    httpOnly: true,
    secure: isProd, // local http → false; production https → true
    sameSite: 'lax', // localhost:4000 → :3000 ใช้ได้กับ credentials
    path: '/auth', // ส่งเฉพาะตอนเรียก /auth/*
    expires: expiresAt,
  };

  res.cookie(cookieName, rawToken, options);
}

/** ลบ cookie ตอน logout */
export function clearRefreshCookie(
  res: Response,
  cookieName = DEFAULT_REFRESH_COOKIE,
) {
  const isProd = process.env.NODE_ENV === 'production';

  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/auth',
  });
}
