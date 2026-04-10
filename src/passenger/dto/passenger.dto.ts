import {
  IsString, IsOptional, IsBoolean,
  IsEnum, IsNumber, IsLatitude, IsLongitude,
  IsUUID, MaxLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../entities/passengers.entity';

// ── Payment Address ───────────────────────────────────────────────────────────

export class PaymentAddressDto {
  @IsOptional() @IsString() @MaxLength(30)
  label?: string;

  @IsString() @MaxLength(255)
  address: string;

  @IsString() @MaxLength(100)
  city: string;

  @IsString() @MaxLength(100)
  province: string;

  @IsString() @MaxLength(20)
  postalCode: string;

  @IsNumber() @IsLatitude()
  lat: number;

  @IsNumber() @IsLongitude()
  lng: number;
}

export class AddPaymentAddressDto {
  @ValidateNested()
  @Type(() => PaymentAddressDto)
  address: PaymentAddressDto;
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

  @IsOptional() @IsString() @MaxLength(100)
  emergencyContactName?: string;

  @IsOptional() @IsString() @MaxLength(20)
  emergencyContactPhone?: string;

  @IsOptional() @IsBoolean()
  newsletterOptIn?: boolean;
}