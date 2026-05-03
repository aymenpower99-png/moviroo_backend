import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entites/user.entity';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthEmailChangeService } from './auth-email-change.service';

@Injectable()
export class AuthProfileService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private emailChangeService: AuthEmailChangeService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Normalise phone: strip any leading country code so only local digits are stored
    const phone = dto.phone ? this.normalisePhone(dto.phone) : undefined;

    // Email change requested
    if (dto.email && dto.email !== user.email) {
      // Also update name/phone if provided in same request
      if (dto.firstName || dto.lastName || phone) {
        await this.userRepo.update(userId, {
          ...(dto.firstName && { firstName: dto.firstName }),
          ...(dto.lastName  && { lastName:  dto.lastName  }),
          ...(phone         && { phone }),
        });
      }
      return this.emailChangeService.requestEmailChange(user, dto.email);
    }

    // Normal update (no email change)
    await this.userRepo.update(userId, {
      ...(dto.firstName && { firstName: dto.firstName }),
      ...(dto.lastName  && { lastName:  dto.lastName  }),
      ...(phone         && { phone }),
    });

    const updated = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const { password, refreshToken, otpCode, totpSecret, inviteToken, emailChangeToken, ...safe } = updated;
    return { ...safe, emailChangePending: !!safe.pendingEmail };
  }

  /** Strip any leading international prefix (+216, +33, etc.) and keep local digits only. */
  private normalisePhone(raw: string): string {
    const trimmed = raw.trim();
    // Remove a leading +NNN (1–4 digit country code)
    return trimmed.replace(/^\+\d{1,4}/, '');
  }
}