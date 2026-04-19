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

  /** Assign a vehicle to this driver by vehicle UUID */
  @IsUUID() @IsOptional()
  vehicleId?: string;

  @IsNumber() @IsOptional() @Min(0)
  fixedMonthlySalary?: number;
}