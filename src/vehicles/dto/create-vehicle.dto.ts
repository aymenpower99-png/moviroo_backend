import {
  IsString,
  IsInt,
  IsEnum,
  IsOptional,
  IsUUID,
  IsDateString,
  Length,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { VehicleType, VehicleStatus } from '../entities/vehicle.entity';

export class CreateVehicleDto {
  // ─── Relations ─────────────────────────────────────────────────────────────
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  agencyId?: string;

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
  // ✅ optional — frontend removed plate number field
  @IsOptional()
  @IsString()
  @Length(1, 20)
  licensePlate?: string;

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

  // ─── Status ────────────────────────────────────────────────────────────────
  // ✅ added — frontend has a Status field on creation
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;

  // ─── Documents ─────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MinLength(1)
  registrationDocumentUrl?: string;

  @IsOptional()
  @IsDateString()
  registrationExpiry?: string;

  // ✅ optional — no longer required from the frontend form
  @IsOptional()
  @IsString()
  @MinLength(1)
  insuranceDocumentUrl?: string;

  @IsOptional()
  @IsDateString()
  insuranceExpiry?: string;

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