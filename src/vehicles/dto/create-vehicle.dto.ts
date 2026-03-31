import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  IsUUID,
  IsUrl,
  IsDateString,
  Length,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { VehicleType } from '../entities/vehicle.entity';

export class CreateVehicleDto {
  // ─── Relations ─────────────────────────────────────────────────────────────
  @IsUUID()
  driverId: string;

  @IsUUID()
  agencyId: string;

  // ─── Car Identity ──────────────────────────────────────────────────────────
  @IsString()
  @Length(1, 50)
  make: string;

  @IsString()
  @Length(1, 50)
  model: string;

  @IsInt()
  @Min(1980)
  @Max(new Date().getFullYear() + 1)
  year: number;

  @IsString()
  @Length(1, 30)
  color: string;

  // ─── Registration ──────────────────────────────────────────────────────────
  @IsString()
  @Length(1, 20)
  licensePlate: string;

  @IsOptional()
  @IsString()
  @Length(17, 17, { message: 'VIN must be exactly 17 characters' })
  vin?: string;

  // ─── Config ────────────────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  seats?: number;

  // ─── Documents ─────────────────────────────────────────────────────────────
  @IsString()
  @MinLength(1)
  registrationDocumentUrl: string;

  @IsString()
  @MinLength(1)
  insuranceDocumentUrl: string;

  @IsDateString()
  insuranceExpiry: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  technicalControlUrl?: string;

  @IsOptional()
  @IsDateString()
  technicalControlExpiry?: string;

  // ─── Photos ────────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString({ each: true })
  photos?: string[];
}