import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DriverLanguage } from '../entities/driver.entity';

export class CreateDriverDto {
  @IsUUID() @IsNotEmpty()
  userId: string;

  @IsString() @IsNotEmpty() @MaxLength(50)
  driverLicenseNumber: string;

  @IsDateString() @IsNotEmpty()
  driverLicenseExpiry: string;

  @IsString() @IsNotEmpty()
  driverLicenseFrontUrl: string;

  @IsString() @IsNotEmpty()
  driverLicenseBackUrl: string;

  @IsEnum(DriverLanguage) @IsOptional()
  language?: DriverLanguage;
}