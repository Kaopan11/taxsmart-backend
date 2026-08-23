import { Role } from '.prisma/client';

/**
 * สิ่งที่ JwtStrategy ใส่ใน request.user หลังถอด token
 * ใช้ใน invoices เพื่อรู้ว่าเป็น user คนไหน
 */
export type AuthUser = {
  userId: string;
  email: string;
  role: Role;
};
