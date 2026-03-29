import { IsString, Length, IsEmail, IsOptional, IsUUID, IsBoolean } from 'class-validator';

// ─── Submit OTP (email verify OR login step-2) ────────────────────────────────

export class VerifyOtpDto {
  @IsUUID()
  userId: string;

  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  code: string;
}

// ─── Resend OTP ───────────────────────────────────────────────────────────────

export class ResendOtpDto {
  @IsUUID()
  userId: string;
}

// ─── Magic Link verify (token comes from URL query param) ─────────────────────

export class VerifyMagicLinkDto {
  @IsString()
  @Length(64, 64, { message: 'Invalid magic link token' })
  token: string;
}

// ─── Enable / disable 2-step verification ────────────────────────────────────


export class Toggle2faDto {
  @IsBoolean()
  enabled: boolean;
}