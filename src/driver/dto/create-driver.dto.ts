import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { DriverLanguage } from '../entities/driver.entity';

export class CreateDriverDto {
  @IsUUID() @IsNotEmpty()
  userId: string;

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

  @IsString() @IsOptional() @MaxLength(20)
  phone?: string;
}