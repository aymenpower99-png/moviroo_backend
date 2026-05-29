import {
  IsDateString, IsEnum, IsNumber, IsOptional,
  IsString, IsUUID, MaxLength, Min,
} from 'class-validator';
import { DriverAvailabilityStatus } from '../entities/driver.entity';

export class UpdateDriverDto {
  @IsString() @IsOptional() @MaxLength(50)
  driverLicenseNumber?: string;

  @IsDateString() @IsOptional()
  driverLicenseExpiry?: string;

  @IsString() @IsOptional()
  driverLicenseFrontUrl?: string;

  @IsString() @IsOptional()
  driverLicenseBackUrl?: string;

  @IsEnum(DriverAvailabilityStatus) @IsOptional()
  availabilityStatus?: DriverAvailabilityStatus;

  /** Assign or unassign a vehicle to this driver by vehicle UUID (null = unassign) */
  @IsUUID() @IsOptional()
  vehicleId?: string | null;

  /** Assign or unassign a work area to this driver by work area UUID (null = unassign) */
  @IsUUID() @IsOptional()
  workAreaId?: string | null;

  @IsNumber() @IsOptional() @Min(0)
  fixedMonthlySalary?: number;
}