import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt, randomBytes, createHash } from 'crypto';
import { User } from '../users/entites/user.entity';

const OTP_TTL_MS        = 10 * 60 * 1000;  // 10 minutes
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;  // 15 minutes
const OTP_LENGTH        = 6;

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ─── Generate & persist OTP ───────────────────────────────────────────────

  async generateOtp(userId: string): Promise<string> {
    const code    = this.makeCode();
    const hashed  = this.hash(code);
    const expiry  = new Date(Date.now() + OTP_TTL_MS);

    await this.userRepo.update(userId, {
      otpCode:   hashed,
      otpExpiry: expiry,
    });

    return code; // plain code → send via email
  }

  // ─── Verify OTP ───────────────────────────────────────────────────────────

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

  // ─── Generate & persist Magic Link token ──────────────────────────────────

  async generateMagicToken(userId: string): Promise<string> {
    const raw    = randomBytes(32).toString('hex');   // 64-char hex
    const hashed = this.hash(raw);
    const expiry = new Date(Date.now() + MAGIC_LINK_TTL_MS);

    await this.userRepo.update(userId, {
      magicLinkToken:  hashed,
      magicLinkExpiry: expiry,
    });

    return raw; // plain token → embed in URL
  }

  // ─── Verify Magic Link token, return user ─────────────────────────────────

  async verifyMagicToken(rawToken: string): Promise<User> {
    const hashed = this.hash(rawToken);

    const user = await this.userRepo.findOne({
      where: { magicLinkToken: hashed },
    });

    if (!user) throw new UnauthorizedException('Invalid magic link');

    if (!user.magicLinkExpiry || new Date() > user.magicLinkExpiry) {
      await this.clearMagicToken(user.id);
      throw new BadRequestException('Magic link expired');
    }

    await this.clearMagicToken(user.id);
    return user;
  }

  // ─── Cleanup helpers ──────────────────────────────────────────────────────

  async clearOtp(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      otpCode:   null,
      otpExpiry: null,
    });
  }

  async clearMagicToken(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      magicLinkToken:  null,
      magicLinkExpiry: null,
    });
  }

  // ─── Private utils ────────────────────────────────────────────────────────

  private makeCode(): string {
    // Cryptographically random 6-digit code, zero-padded
    return randomInt(0, 999999).toString().padStart(OTP_LENGTH, '0');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}