import { createHash, randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import type { StringValue } from 'ms';
import ms from 'ms';
import type { Role } from '.prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  clearRefreshCookie,
  DEFAULT_REFRESH_COOKIE,
  setRefreshCookie,
} from './auth-cookies';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

type PublicUser = {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
};

/** สิ่งที่ส่งกลับใน JSON — refresh อยู่ใน cookie ไม่ใส่ใน body */
type AuthResponse = {
  accessToken: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto, res: Response): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });

    return this.issueTokensAndSetCookie(user, res);
  }

  async login(dto: LoginDto, res: Response): Promise<AuthResponse> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Email is incorrect');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Password is incorrect');
    }

    return this.issueTokensAndSetCookie(
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      res,
    );
  }

  /**
   * P2: อ่าน refresh จาก cookie → ตรวจใน DB → หมุน token ใหม่ → ออก access ใหม่
   */
  async refresh(rawRefreshToken: string | undefined, res: Response): Promise<AuthResponse> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const tokenHash = this.hashToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: { id: true, email: true, fullName: true, role: true },
        },
      },
    });

    if (!stored || stored.expiresAt.getTime() < Date.now()) {
      // cookie หมดอายุหรือไม่รู้จัก — ล้างทิ้ง
      clearRefreshCookie(res, this.cookieName());
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => undefined);
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Rotation: ลบอันเก่า แล้วออกคู่ใหม่ (กัน reuse)
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    return this.issueTokensAndSetCookie(stored.user, res);
  }

  /** P2: ลบ refresh ใน DB + ล้าง cookie */
  async logout(rawRefreshToken: string | undefined, res: Response): Promise<{ ok: true }> {
    if (rawRefreshToken) {
      const tokenHash = this.hashToken(rawRefreshToken);
      await this.prisma.refreshToken
        .deleteMany({ where: { tokenHash } })
        .catch(() => undefined);
    }

    clearRefreshCookie(res, this.cookieName());
    return { ok: true };
  }

  /** P3: โปรไฟล์จาก DB ตาม userId ใน JWT */
  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return user;
  }

  private async issueTokensAndSetCookie(
    user: PublicUser,
    res: Response,
  ): Promise<AuthResponse> {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role, // P3: ใส่ role ใน JWT (ฝั่ง server ยังโหลดจาก DB ใน JwtStrategy)
    });

    const { rawToken, expiresAt } = await this.createRefreshToken(user.id);
    setRefreshCookie(res, rawToken, expiresAt, this.cookieName());

    return { accessToken, user };
  }

  /** สร้าง refresh ดิบ + เก็บเฉพาะ hash ใน MySQL */
  private async createRefreshToken(userId: string) {
    const rawToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = this.refreshExpiresAt();

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { rawToken, expiresAt };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private refreshExpiresAt(): Date {
    const duration =
      (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ??
        '7d') as StringValue;
    const ttlMs = ms(duration);
    if (typeof ttlMs !== 'number') {
      throw new Error('Invalid JWT_REFRESH_EXPIRES_IN');
    }
    return new Date(Date.now() + ttlMs);
  }

  private cookieName(): string {
    return (
      this.configService.get<string>('REFRESH_COOKIE_NAME') ??
      DEFAULT_REFRESH_COOKIE
    );
  }
}
