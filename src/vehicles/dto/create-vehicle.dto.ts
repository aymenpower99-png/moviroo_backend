import {
  IsString,
  IsInt,
  IsOptional,
  IsUUID,
  IsDateString,
  Length,
  Min,
  Max,
  MinLength,
} from 'class-validator';

export class CreateVehicleDto {
  // ─── Class (MANDATORY) ────────────────────────────────────────────────────
  @IsUUID()
  classId: string;

  // ─── Driver & Agency ──────────────────────────────────────────────────────
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  agencyId?: string;

  // ─── Car Identity ─────────────────────────────────────────────────────────
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

  @IsOptional()
  @IsString()
  @Length(1, 30)
  color?: string;

  @IsOptional()
  @IsString()
  @Length(1, 20)
  licensePlate?: string;

  @IsOptional()
  @IsString()
  @Length(17, 17, { message: 'VIN must be exactly 17 characters' })
  vin?: string;

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

  // ─── Photos ───────────────────────────────────────────────────────────────
  @IsOptional()
  @IsString({ each: true })
  photos?: string[];
}