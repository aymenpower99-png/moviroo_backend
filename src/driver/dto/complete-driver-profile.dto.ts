import {
  IsDateString,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export class CompleteDriverProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(50)
  driverLicenseNumber: string;

  @IsDateString() @IsNotEmpty()
  driverLicenseExpiry: string;

  @IsString() @IsNotEmpty()
  driverLicenseFrontUrl: string;

  @IsString() @IsNotEmpty()
  driverLicenseBackUrl: string;

  @IsString() @IsNotEmpty() @MaxLength(20)
  phone: string;
}