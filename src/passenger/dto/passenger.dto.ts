import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  IsEnum,
  IsNumber,
  IsLatitude,
  IsLongitude,
  MaxLength,
  ValidateNested,
  IsPhoneNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleType, PaymentMethod } from '../entities/passengers.entity';

// ─── Payment AddressDto ────────────────────────────────────────────────────────

export class PaymentAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  label?: string;

  @IsString()
  @MaxLength(255)
  address: string;

  @IsString()
  @MaxLength(100)
  city: string;

  @IsString()
  @MaxLength(100)
  province: string;

  @IsString()
  @MaxLength(20)
  postalCode: string;

  @IsNumber()
  @IsLatitude()
  lat: number;

  @IsNumber()
  @IsLongitude()
  lng: number;
}

export class AddPaymentAddressDto {
  @ValidateNested()
  @Type(() => PaymentAddressDto)
  address: PaymentAddressDto;
}
// ─── Profile Update ───────────────────────────────────────────────────────

export class UpdatePassengerDto {
  @IsOptional()
  @IsEnum(VehicleType)
  preferredVehicleType?: VehicleType;

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