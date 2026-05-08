import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entites/user.entity';
import { OtpService } from '../otp/otp.service';
import { AuthMailService } from '../mail/services/auth-mail.service';
import { AuthBiometricService } from './auth-passkey.service';
import { DeleteAccountDto } from './dto/security.dto';

/**
 * Account lifecycle: hard delete with mandatory re-authentication.
 *
 * Re-auth supports exactly ONE of:
 *   - password: current account password
 *   - otp:      email OTP (sent via requestDeleteOtp)
 *   - passkeyToken: action token from AuthBiometricService.verifyPasskey
 */
@Injectable()
export class AuthAccountService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    private otpService: OtpService,
    private authMailService: AuthMailService,
    private biometricService: AuthBiometricService,
  ) {}

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const providedCount =
      (dto.password ? 1 : 0) + (dto.otp ? 1 : 0) + (dto.passkeyToken ? 1 : 0);
    if (providedCount !== 1) {
      throw new BadRequestException(
        'Provide exactly one of: password, otp, or passkeyToken.',
      );
    }

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    // ── Verify re-auth ────────────────────────────────────────────────────
    if (dto.password) {
      if (!user.password) {
        throw new BadRequestException(
          'This account has no password set (social login).',
        );
      }
      const ok = await bcrypt.compare(dto.password, user.password);
      if (!ok) throw new UnauthorizedException('Invalid credentials');
    } else if (dto.otp) {
      await this.otpService.verifyOtp(userId, dto.otp);
    } else if (dto.passkeyToken) {
      await this.biometricService.validateActionToken(
        userId,
        dto.passkeyToken,
        'delete-account',
      );
    }

    // ── Hard delete ───────────────────────────────────────────────────────
    await this.userRepo.delete(userId);

    return { message: 'Account permanently deleted.' };
  }

  /**
   * Sends an email OTP for the delete flow.
   * Always succeeds silently for security.
   */
  async requestDeleteOtp(userId: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const code = await this.otpService.generateOtp(userId);
    await this.authMailService.sendOtp(
      user.email,
      user.firstName,
      code,
      'login',
    );
    return { message: 'Verification code sent to your email.' };
  }
}
