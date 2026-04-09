import {
  IsDateString, IsEnum, IsOptional,
  IsString, IsUUID, MaxLength,
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

  /** Assign a vehicle to this driver by vehicle UUID */
  @IsUUID() @IsOptional()
  vehicleId?: string;
}