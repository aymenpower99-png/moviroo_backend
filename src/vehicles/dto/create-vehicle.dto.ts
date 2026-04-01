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
import { VehicleType } from '../entities/vehicle.entity';

export class CreateVehicleDto {
  // ─── Relations ────────────────────────────────────────────────────────────
  /** Optional: assign a driver on creation. If provided + photos exist → Available */
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  agencyId?: string;

  // ─── Car Identity (Required) ──────────────────────────────────────────────
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

  // ─── Car Identity (Optional) ──────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @Length(1, 30)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  seats?: number;

  // ─── Registration ─────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @Length(1, 20)
  licensePlate?: string;

  @IsOptional()
  @IsString()
  @Length(17, 17, { message: 'VIN must be exactly 17 characters' })
  vin?: string;

  // ─── Config ───────────────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  // ─── Documents ────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  @MinLength(1)
  registrationDocumentUrl?: string;

  @IsOptional()
  @IsDateString()
  registrationExpiry?: string;

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

  // ─── Photos (Optional) ────────────────────────────────────────────────────
  /** Provide photo URLs. Status → Available only if photos + driverId both present */
  @IsOptional()
  @IsString({ each: true })
  photos?: string[];
}