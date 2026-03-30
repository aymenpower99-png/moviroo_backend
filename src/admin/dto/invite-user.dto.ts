import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../users/entites/user.entity';

export class InviteUserDto {
  @IsString()
  @MinLength(1)
  firstName: string;

  @IsString()
  @MinLength(1)
  lastName: string;

  @IsEmail()
  email: string;

  @IsEnum([UserRole.DRIVER, UserRole.PASSENGER], {
    message: 'role must be driver or passenger',
  })
  role: UserRole.DRIVER | UserRole.PASSENGER;
}