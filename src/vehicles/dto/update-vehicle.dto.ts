import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  IsUUID,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  MinLength,
  Allow,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { VehicleType } from '../entities/vehicle.entity';

export class UpdateVehicleDto {
  /**
   * Pass a UUID to reassign driver, or explicitly pass `null` to unassign.
   * Note: maintenance endpoint auto-unassigns — use this only for manual changes.
   */
  @IsOptional()
  @Transform(({ value }) => (value === null ? null : value))
  @Allow()
  driverId?: string | null;

  @IsOptional()
  @IsUUID()
  agencyId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  make?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  model?: string;

  @IsOptional()
  @IsInt()
  @Min(1980)
  year?: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  licensePlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(17)
  vin?: string;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  seats?: number;

  @IsOptional()
  @IsString()
  registrationDocumentUrl?: string;

  @IsOptional()
  @IsString()
  insuranceDocumentUrl?: string;

  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

  @IsOptional()
  @IsString()
  technicalControlUrl?: string;

  @IsOptional()
  @IsDateString()
  technicalControlExpiry?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}