import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaymentMethod } from '../entities/passengers.entity';

export class UpdateNotificationsDto {
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;
}

// ── Profile Update ────────────────────────────────────────────────────────────

export class UpdatePassengerDto {
  /**
   * UUID of the passenger's preferred class.
   * Null = no preference (picks at booking time).
   * This is a real class UUID — not a hardcoded string.
   */
  @IsOptional()
  @IsUUID()
  preferredClassId?: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  defaultPaymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsBoolean()
  newsletterOptIn?: boolean;
}
