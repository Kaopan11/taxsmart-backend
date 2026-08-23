import { SetMetadata } from '@nestjs/common';
import { Role } from '.prisma/client';

export const ROLES_KEY = 'roles';

/**
 * P3: ระบุว่า endpoint นี้ต้องมี role อะไร
 * ใช้คู่กับ RolesGuard เช่น @Roles(Role.ADMIN)
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
