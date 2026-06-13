import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entites/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthEmailChangeService } from './auth-email-change.service';
import { WelcomeMailService } from '../mail/services/welcome-mail.service';

@Injectable()
export class AuthProfileService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private emailChangeService: AuthEmailChangeService,
    private welcomeMail: WelcomeMailService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Store phone in full E.164 format (+21620123456) — never strip the country code
    const phone = dto.phone ? dto.phone.trim() : undefined;

    // Email change requested
    if (dto.email && dto.email !== user.email) {
      // Also update name/phone if provided in same request
      if (dto.firstName || dto.lastName || phone) {
        await this.userRepo.update(userId, {
          ...(dto.firstName && { firstName: dto.firstName }),
          ...(dto.lastName  && { lastName:  dto.lastName  }),
          ...(phone         && { phone }),
          ...(dto.language  && { language:  dto.language  }),
        });
      }
      return this.emailChangeService.requestEmailChange(user, dto.email);
    }

    // Normal update (no email change)
    await this.userRepo.update(userId, {
      ...(dto.firstName && { firstName: dto.firstName }),
      ...(dto.lastName  && { lastName:  dto.lastName  }),
      ...(phone         && { phone }),
      ...(dto.language  && { language:  dto.language  }),
    });

    const updated = await this.userRepo.findOneOrFail({ where: { id: userId } });

    // Send welcome email on first profile completion (phone goes from empty → filled)
    const isFirstProfileCompletion = !user.phone && !!phone;
    if (isFirstProfileCompletion) {
      this.welcomeMail.sendWelcome(
        user.role,
        user.email,
        updated.firstName || user.firstName,
      );
    }

    const { password, refreshToken, otpCode, totpSecret, inviteToken, emailChangeToken, ...safe } = updated;
    return { ...safe, emailChangePending: !!safe.pendingEmail };
  }
}