import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../users/entites/user.entity';
import { AuthMailService } from '../mail/services/auth-mail.service';

@Injectable()
export class AuthPasswordService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private mailService: AuthMailService,
  ) {}

  /** Deterministic SHA-256 hash for reset tokens (enables direct DB lookup). */
  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Security: always return success even if user not found.
   */
  async forgotPassword(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });

    if (!user) {
      return {
        message:
          'If an account with this email exists, a reset link/code was sent.',
      };
    }

    // Generate raw token for the email; store only the SHA-256 hash in DB.
    // SHA-256 is deterministic so we can look it up directly on reset.
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.userRepo.update(user.id, {
      passwordResetToken: tokenHash,
      passwordResetExpiry: expiry,
    });

    await this.mailService.sendForgotPassword(
      user.email,
      user.firstName,
      rawToken,
    );

    return {
      message:
        'If an account with this email exists, a reset link/code was sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    // Hash the incoming token the same way it was stored — direct DB lookup.
    const tokenHash = this.hashToken(token);

    const user = await this.userRepo.findOne({
      where: { passwordResetToken: tokenHash },
    });

    if (
      !user ||
      !user.passwordResetExpiry ||
      user.passwordResetExpiry < new Date()
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.userRepo.update(user.id, {
      password: passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    });

    return { message: 'Password updated successfully' };
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.password)
      throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.userRepo.update(userId, { password: passwordHash });

    return { message: 'Password updated successfully' };
  }
}
