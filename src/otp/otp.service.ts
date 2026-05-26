import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt, createHash } from 'crypto';
import { authenticator } from '@otplib/preset-default';
import * as QRCode from 'qrcode';
import { User } from '../users/entites/user.entity';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_LENGTH = 6;

/** Account-level brute-force protection settings. */
const MAX_OTP_ATTEMPTS = 5;
const MAX_TOTP_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ─── Brute-force protection helpers ───────────────────────────────────────

  private _assertNotLocked(
    user: User,
    kind: 'otp' | 'totp',
  ): void {
    const lockedUntil =
      kind === 'otp' ? user.otpLockedUntil : user.totpLockedUntil;
    if (lockedUntil && new Date() < lockedUntil) {
      const mins = Math.ceil(
        (lockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new ForbiddenException(
        `Too many failed attempts. Please wait ${mins} minute${mins === 1 ? '' : 's'} and try again.`,
      );
    }
  }

  private async _recordFailedAttempt(
    userId: string,
    kind: 'otp' | 'totp',
  ): Promise<void> {
    const colAttempts =
      kind === 'otp' ? 'otpFailedAttempts' : 'totpFailedAttempts';
    const colLocked =
      kind === 'otp' ? 'otpLockedUntil' : 'totpLockedUntil';
    const maxAttempts =
      kind === 'otp' ? MAX_OTP_ATTEMPTS : MAX_TOTP_ATTEMPTS;

    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const attempts = (user[colAttempts] as number) + 1;

    if (attempts >= maxAttempts) {
      await this.userRepo.update(userId, {
        [colAttempts]: attempts,
        [colLocked]: new Date(Date.now() + LOCKOUT_DURATION_MS),
      });
      throw new ForbiddenException(
        `Too many failed attempts. Please wait ${LOCKOUT_DURATION_MS / 60000} minutes and try again.`,
      );
    }

    await this.userRepo.update(userId, { [colAttempts]: attempts });
  }

  private async _clearAttempts(
    userId: string,
    kind: 'otp' | 'totp',
  ): Promise<void> {
    const colAttempts =
      kind === 'otp' ? 'otpFailedAttempts' : 'totpFailedAttempts';
    const colLocked =
      kind === 'otp' ? 'otpLockedUntil' : 'totpLockedUntil';

    await this.userRepo.update(userId, {
      [colAttempts]: 0,
      [colLocked]: null,
    });
  }

  // ─── Email OTP ────────────────────────────────────────────────────────────

  async generateOtp(userId: string): Promise<string> {
    const code   = this.makeCode();
    const hashed = this.hash(code);
    const expiry = new Date(Date.now() + OTP_TTL_MS);

    await this.userRepo.update(userId, {
      otpCode:   hashed,
      otpExpiry: expiry,
    });

    return code;
  }

  async verifyOtp(userId: string, code: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    this._assertNotLocked(user, 'otp');

    if (!user.otpCode || !user.otpExpiry) {
      throw new BadRequestException('No OTP requested');
    }

    if (new Date() > user.otpExpiry) {
      await this.clearOtp(userId);
      throw new BadRequestException('OTP expired');
    }

    const inputHash = this.hash(code);
    if (inputHash !== user.otpCode) {
      await this._recordFailedAttempt(userId, 'otp');
      throw new UnauthorizedException('Invalid OTP code');
    }

    await this._clearAttempts(userId, 'otp');
    await this.clearOtp(userId);
  }

  async clearOtp(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      otpCode:   null,
      otpExpiry: null,
    });
  }

  // ─── TOTP (Authenticator App) ─────────────────────────────────────────────

  async generateTotpSecret(user: User): Promise<{ secret: string; qrCodeUrl: string; otpauthUrl: string }> {
    const secret     = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, 'Moviroo', secret);
    const qrCodeUrl  = await (QRCode.toDataURL as Function)(otpauthUrl) as string;

    await this.userRepo.update(user.id, { totpSecret: secret });

    return { secret, qrCodeUrl, otpauthUrl };
  }

  async verifyAndEnableTotp(userId: string, code: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.totpSecret) throw new BadRequestException('TOTP setup not started');

    this._assertNotLocked(user, 'totp');

    const isValid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!isValid) {
      await this._recordFailedAttempt(userId, 'totp');
      throw new UnauthorizedException('Invalid authenticator code');
    }

    await this._clearAttempts(userId, 'totp');
    await this.userRepo.update(userId, { totpEnabled: true });
  }

  async verifyTotpCode(userId: string, code: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.totpSecret || !user.totpEnabled) {
      throw new BadRequestException('TOTP not enabled');
    }

    this._assertNotLocked(user, 'totp');

    const isValid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!isValid) {
      await this._recordFailedAttempt(userId, 'totp');
      throw new UnauthorizedException('Invalid authenticator code');
    }

    await this._clearAttempts(userId, 'totp');
  }

  async disableTotp(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      totpSecret:  null,
      totpEnabled: false,
      totpFailedAttempts: 0,
      totpLockedUntil: null,
    });
  }

  // ─── Private utils ────────────────────────────────────────────────────────

  private makeCode(): string {
    return randomInt(0, 999999).toString().padStart(OTP_LENGTH, '0');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}