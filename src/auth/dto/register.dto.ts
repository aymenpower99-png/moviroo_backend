import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsEnum,
  Matches,
  IsBoolean,
} from 'class-validator';
import { UserRole } from '../../users/entites/user.entity';
import { ConsentType } from '../entities/user-consent.entity';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{8,15}$/, { message: 'Invalid phone number' })
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  // GDPR Consent Fields
  @IsBoolean()
  termsOfServiceConsent: boolean;

  @IsBoolean()
  locationTrackingConsent: boolean;

  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
