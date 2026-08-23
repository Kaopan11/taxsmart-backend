import { IsEmail, IsString, MinLength } from 'class-validator';

/** Body ของ POST /auth/login */
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
