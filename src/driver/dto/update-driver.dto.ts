import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DriverAvailabilityStatus, DriverLanguage } from '../entities/driver.entity';

export class UpdateDriverDto {
  @IsString() @IsOptional() @MaxLength(50)
  driverLicenseNumber?: string;

  @IsDateString() @IsOptional()
  driverLicenseExpiry?: string;

  @IsString() @IsOptional()
  driverLicenseFrontUrl?: string;

  @IsString() @IsOptional()
  driverLicenseBackUrl?: string;

  @IsEnum(DriverLanguage) @IsOptional()
  language?: DriverLanguage;

  @IsEnum(DriverAvailabilityStatus) @IsOptional()
  availabilityStatus?: DriverAvailabilityStatus;
}