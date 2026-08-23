import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DEFAULT_REFRESH_COOKIE } from './auth-cookies';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /auth/register — ตั้ง refresh cookie + คืน accessToken */
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.register(dto, res);
  }

  /** POST /auth/login */
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res);
  }

  /**
   * POST /auth/refresh
   * อ่าน httpOnly cookie → หมุน refresh → ออก accessToken ใหม่
   */
  @Post('refresh')
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName =
      process.env.REFRESH_COOKIE_NAME ?? DEFAULT_REFRESH_COOKIE;
    const raw = req.cookies?.[cookieName] as string | undefined;
    return this.authService.refresh(raw, res);
  }

  /** POST /auth/logout — ลบ refresh ใน DB + ล้าง cookie */
  @Post('logout')
  logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName =
      process.env.REFRESH_COOKIE_NAME ?? DEFAULT_REFRESH_COOKIE;
    const raw = req.cookies?.[cookieName] as string | undefined;
    return this.authService.logout(raw, res);
  }
}
