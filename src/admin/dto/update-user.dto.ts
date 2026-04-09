import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../users/entites/user.entity';

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1)
  firstName?: string;

  @IsOptional() @IsString() @MinLength(1)
  lastName?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional() @IsString()
  phone?: string;
}