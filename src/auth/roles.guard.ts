import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '.prisma/client';
import type { AuthUser } from './auth-user.type';
import { ROLES_KEY } from './roles.decorator';

/**
 * P3: ตรวจ role ของ user จาก JWT (request.user)
 * ต้องใช้หลัง JwtAuthGuard เสมอ
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // ไม่มี @Roles() → ผ่าน (แค่ล็อกอินก็พอ)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('No authenticated user');
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Admin role required');
    }

    return true;
  }
}
