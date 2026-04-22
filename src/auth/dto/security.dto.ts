import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';
import { TwoFactorMethod } from '../../users/entites/user.entity';

// ── Switch primary 2FA method ───────────────────────────────────────────────
export class SwitchPrimary2faDto {
  @IsEnum(TwoFactorMethod)
  method: TwoFactorMethod;

  // OTP/TOTP code proving control of the CURRENT primary method
  @IsString()
  @Length(6, 6, { message: 'Code must be exactly 6 digits' })
  code: string;
}

// ── Delete account ──────────────────────────────────────────────────────────
// Accepts exactly ONE of: password, otp, passkeyToken (any non-empty).
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  otp?: string;

  // A short-lived token issued by /auth/passkey/verify after successful biometric.
  @IsOptional()
  @IsString()
  passkeyToken?: string;
}

// ── Passkey verify (device biometric success) ───────────────────────────────
// Frontend calls this AFTER the device prompts Face ID / Fingerprint / PIN and
// receives a success result. The token returned proves a recent challenge and
// can be used for sensitive endpoints that require re-auth.
export class PasskeyVerifyDto {
  // Frontend just declares what method succeeded locally; backend trusts JWT.
  @IsEnum(['face', 'fingerprint', 'pin'])
  method: 'face' | 'fingerprint' | 'pin';
}
