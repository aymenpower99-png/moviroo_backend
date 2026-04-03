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

    // Email change requested
    if (dto.email && dto.email !== user.email) {
      // Also update name/phone if provided in same request
      if (dto.firstName || dto.lastName || dto.phone) {
        await this.userRepo.update(userId, {
          ...(dto.firstName && { firstName: dto.firstName }),
          ...(dto.lastName  && { lastName:  dto.lastName  }),
          ...(dto.phone     && { phone:     dto.phone     }),
        });
      }
      return this.emailChangeService.requestEmailChange(user, dto.email);
    }

    // Normal update (no email change)
    await this.userRepo.update(userId, {
      ...(dto.firstName && { firstName: dto.firstName }),
      ...(dto.lastName  && { lastName:  dto.lastName  }),
      ...(dto.phone     && { phone:     dto.phone     }),
    });

    const updated = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const { password, refreshToken, otpCode, totpSecret, inviteToken, emailChangeToken, ...safe } = updated;
    return { ...safe, emailChangePending: !!safe.pendingEmail };
  }
}