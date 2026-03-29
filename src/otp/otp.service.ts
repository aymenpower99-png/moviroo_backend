import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt, createHash } from 'crypto';
import { authenticator } from '@otplib/preset-default';
import * as QRCode from 'qrcode';
import { User } from '../users/entites/user.entity';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_LENGTH = 6;

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

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

    if (!user.otpCode || !user.otpExpiry) {
      throw new BadRequestException('No OTP requested');
    }

    if (new Date() > user.otpExpiry) {
      await this.clearOtp(userId);
      throw new BadRequestException('OTP expired');
    }

    const inputHash = this.hash(code);
    if (inputHash !== user.otpCode) {
      throw new UnauthorizedException('Invalid OTP code');
    }

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

    const isValid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!isValid) throw new UnauthorizedException('Invalid authenticator code');

    await this.userRepo.update(userId, { totpEnabled: true });
  }

  async verifyTotpCode(userId: string, code: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    if (!user.totpSecret || !user.totpEnabled) {
      throw new BadRequestException('TOTP not enabled');
    }

    const isValid = authenticator.verify({ token: code, secret: user.totpSecret });
    if (!isValid) throw new UnauthorizedException('Invalid authenticator code');
  }

  async disableTotp(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      totpSecret:  null,
      totpEnabled: false,
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