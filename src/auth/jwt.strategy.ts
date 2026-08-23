import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth-user.type';

/** โครงสร้างใน JWT ที่เรา sign ตอน login/register */
type JwtPayload = {
  sub: string; // userId
  email: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }

    super({
      // อ่าน token จาก header: Authorization: Bearer ...
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /** หลังถอด JWT สำเร็จ — ตรวจว่า user ยังมีใน DB แล้วคืน AuthUser */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return {
      userId: user.id,
      email: user.email,
      role: user.role,
    };
  }
}
