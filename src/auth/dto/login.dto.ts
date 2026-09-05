import { IsString, MinLength } from 'class-validator';

/** Body ของ POST /auth/login */
export class LoginDto {
  @IsString({ message: 'Email is required' })
  email!: string;

  @IsString({ message: 'Password is required' })
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}
