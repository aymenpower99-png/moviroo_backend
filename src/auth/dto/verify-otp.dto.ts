import { IsString, Length, IsUUID, IsBoolean } from 'class-validator';

export class VerifyOtpDto {
  @IsUUID()
  userId: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  code: string;
}

export class ResendOtpDto {
  @IsUUID()
  userId: string;
}

export class Toggle2faDto {
  @IsBoolean()
  enabled: boolean;
}