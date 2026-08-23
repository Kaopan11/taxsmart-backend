import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** Body ของ POST /auth/register */
export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password!: string;

  /** ตรงกับ User.fullName ใน Prisma — ไม่บังคับ */
  @IsOptional()
  @IsString()
  fullName?: string;
}
