import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

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

  @IsString() @IsOptional() @MaxLength(20)
  phone?: string;
}