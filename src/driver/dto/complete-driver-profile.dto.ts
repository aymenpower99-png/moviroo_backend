import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { DriverLanguage } from '../entities/driver.entity';

export class CompleteDriverProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  driverLicenseNumber: string;

  @IsDateString() @IsNotEmpty()
  driverLicenseExpiry: string;

  @IsString() @IsNotEmpty()
  driverLicenseFrontUrl: string;

  @IsString() @IsNotEmpty()
  driverLicenseBackUrl: string;

  @IsEnum(DriverLanguage) @IsNotEmpty()
  language: DriverLanguage;

  @IsString() @IsNotEmpty() @MaxLength(20)
  phone: string;
}