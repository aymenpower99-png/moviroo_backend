import {
  IsString,
  IsInt,
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

export class UpdateVehicleDto {
  // ─── Class reassignment ───────────────────────────────────────────────────
  @IsOptional()
  @IsUUID()
  classId?: string;

  // ─── Driver (pass null to unassign) ──────────────────────────────────────
  @IsOptional()
  @Transform(({ value }) => (value === null ? null : value))
  @Allow()
  driverId?: string | null;

  @IsOptional()
  @IsUUID()
  agencyId?: string;

  // ─── Car Identity ─────────────────────────────────────────────────────────
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
  @Max(new Date().getFullYear() + 1)
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

  // ─── Documents ────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString()
  registrationDocumentUrl?: string;

  @IsOptional()
  @IsDateString()
  registrationExpiry?: string;

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

  // ─── Photos ──────���────────────────────────────────────────────────────────
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}