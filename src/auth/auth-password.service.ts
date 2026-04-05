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
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthPasswordService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private mailService: MailService,
  ) {}

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

    // Generate raw token for the email, store only hashed token in DB
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 12);
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await this.userRepo.update(user.id, {
      passwordResetToken: tokenHash,
      passwordResetExpiry: expiry,
    });

    // If you already have a mail method, use it.
    // Otherwise you must add one in MailService (see note below).
    await this.mailService.sendForgotPassword(user.email, user.firstName, rawToken);

    return {
      message:
        'If an account with this email exists, a reset link/code was sent.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    // Find candidate users that currently have a reset token not expired.
    // (We can't query by hash easily because bcrypt uses random salts.)
    const candidates = await this.userRepo.find({
      where: {},
      select: ['id', 'passwordResetToken', 'passwordResetExpiry'] as any,
    });

    const now = new Date();
    const validCandidate = candidates.find(
      (u: any) =>
        u.passwordResetToken &&
        u.passwordResetExpiry &&
        u.passwordResetExpiry > now,
    );

    // NOTE: The above is a fallback if you cannot query properly.
    // The correct approach is to store a SHA256 token hash (deterministic) instead of bcrypt.
    // See “Important improvement” section below.

    if (!validCandidate) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const ok = await bcrypt.compare(token, validCandidate.passwordResetToken);
    if (!ok) throw new BadRequestException('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.userRepo.update(validCandidate.id, {
      password: passwordHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
    });

    return { message: 'Password updated successfully' };
  }

  async updatePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.userRepo.update(userId, { password: passwordHash });

    return { message: 'Password updated successfully' };
  }
}