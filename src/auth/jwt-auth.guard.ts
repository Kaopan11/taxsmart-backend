import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * บังคับให้มี Authorization: Bearer <accessToken>
 * ใช้กับ invoices ใน P1
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
