import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { User } from '../users/entites/user.entity';
import { MailService } from '../mail/mail.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthEmailChangeService {
  private readonly logger = new Logger(AuthEmailChangeService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private mailService: MailService,
  ) {}

  // ─── Request email change (called from updateProfile) ─────────────────────

  async requestEmailChange(user: User, newEmail: string) {
    const taken = await this.userRepo.findOne({ where: { email: newEmail } });
    if (taken) throw new ConflictException('Email already in use');

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userRepo.update(user.id, {
      pendingEmail:      newEmail,
      emailChangeToken:  token,
      emailChangeExpiry: expiry,
    });

    // 1️⃣ Verification link → NEW email (required)
    await this.mailService.sendEmailChangeVerification(newEmail, user.firstName, token);

    // 2️⃣ Security alert → OLD email (non-blocking — safe in Resend test mode)
    this.mailService.sendEmailChangeAlert(user.email, user.firstName, newEmail)
      .then(() => this.logger.log(`Security alert sent to old email: ${user.email}`))
      .catch(err  => this.logger.warn(`Alert to old email skipped (${user.email}): ${err.message}`));

    return {
      message:            'Verification email sent. Please check your new inbox to confirm the change.',
      pendingEmail:       newEmail,
      emailChangePending: true,
    };
  }

  // ─── Confirm email change (token from link) ───────────────────────────────

  async confirmEmailChange(token: string) {
    const user = await this.userRepo.findOne({ where: { emailChangeToken: token } });

    if (!user || !user.emailChangeExpiry || user.emailChangeExpiry < new Date()) {
      throw new BadRequestException(
        'Link expired or invalid. Please request a new verification email.',
      );
    }

    const newEmail = user.pendingEmail!;

    await this.userRepo.update(user.id, {
      email:             newEmail,
      pendingEmail:      null,
      emailChangeToken:  null,
      emailChangeExpiry: null,
    });

    return { message: 'Email updated successfully', newEmail };
  }

  // ─── Resend verification email ────────────────────────────────────────────

  async resendVerification(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)              throw new NotFoundException('User not found');
    if (!user.pendingEmail) throw new BadRequestException('No pending email change found');

    const token  = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000);

    await this.userRepo.update(userId, {
      emailChangeToken:  token,
      emailChangeExpiry: expiry,
    });

    await this.mailService.sendEmailChangeVerification(user.pendingEmail, user.firstName, token);
    return { message: 'Verification email resent' };
  }

  // ─── Cancel email change ──────────────────────────────────────────────────

  async cancelEmailChange(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user)              throw new NotFoundException('User not found');
    if (!user.pendingEmail) throw new BadRequestException('No pending email change to cancel');

    await this.userRepo.update(userId, {
      pendingEmail:      null,
      emailChangeToken:  null,
      emailChangeExpiry: null,
    });

    return { message: 'Email change cancelled' };
  }
}