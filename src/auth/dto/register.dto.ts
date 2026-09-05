import { IsEmail, IsString, Length, MinLength } from 'class-validator';

/** Body ของ POST /auth/register */
export class RegisterDto {
  @IsString({ message: 'Name is required' })
  @Length(6, 20, { message: 'Name must be between 6 and 20 characters' })
  fullName!: string;

  @IsEmail({}, { message: 'Invalid email' })
  email!: string;

  @IsString({ message: 'Password is required' })
  @MinLength(9, { message: 'Password must be more than 8 characters' })
  password!: string;
}
