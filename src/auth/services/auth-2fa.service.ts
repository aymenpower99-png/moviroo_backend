import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User,
  TwoFactorMethod,
} from '../../users/entites/user.entity';
import { OtpService } from '../../otp/otp.service';
import { AuthMailService } from '../../mail/services/auth-mail.service';

@Injectable()
export class Auth2faService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly otpService: OtpService,
    private readonly authMail: AuthMailService,
  ) {}

  async setupTotp(user: User) {
    return this.otpService.generateTotpSecret(user);
  }

  async confirmTotpSetup(userId: string, code: string) {
    await this.otpService.verifyAndEnableTotp(userId, code);

    await this.userRepo.update(userId, {
      is2faEnabled: false,
      primary2faMethod: TwoFactorMethod.TOTP,
    });

    return {
      message: 'Authenticator app linked successfully.',
      totpEnabled: true,
      is2faEnabled: false,
      primary2faMethod: TwoFactorMethod.TOTP,
    };
  }

  async disableTotp(userId: string, totpCode: string) {
    // Require a valid TOTP code to confirm the user still has the authenticator app
    await this.otpService.verifyTotpCode(userId, totpCode);
    await this.otpService.disableTotp(userId);

    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    let newPrimary = user.primary2faMethod;
    if (user.primary2faMethod === TwoFactorMethod.TOTP) {
      newPrimary = user.is2faEnabled ? TwoFactorMethod.EMAIL : null;
      await this.userRepo.update(userId, { primary2faMethod: newPrimary });
    }

    // Fire-and-forget security alert
    this.authMail
      .sendSecurityAlert(user.email, user.firstName, 'totp_removed')
      .catch(() => {});

    return {
      message: 'Authenticator app unlinked.',
      totpEnabled: false,
      primary2faMethod: newPrimary,
    };
  }

  async toggle2fa(userId: string, enable: boolean, otp?: string) {
    if (enable && otp) {
      await this.otpService.verifyOtp(userId, otp);
    }
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    const patch: Partial<User> = { is2faEnabled: enable };
    let totpEnabled = user.totpEnabled;

    if (enable) {
      patch.primary2faMethod = TwoFactorMethod.EMAIL;
      if (user.totpEnabled) {
        await this.otpService.disableTotp(userId);
        totpEnabled = false;
      }
    } else {
      if (user.primary2faMethod === TwoFactorMethod.EMAIL) {
        patch.primary2faMethod = user.totpEnabled ? TwoFactorMethod.TOTP : null;
      }
    }

    await this.userRepo.update(userId, patch);

    // Send security alert when 2FA is disabled
    if (!enable) {
      this.authMail
        .sendSecurityAlert(user.email, user.firstName, '2fa_disabled')
        .catch(() => {});
    }

    return {
      message: enable
        ? '2-step verification enabled.'
        : '2-step verification disabled.',
      is2faEnabled: enable,
      totpEnabled,
      primary2faMethod: patch.primary2faMethod ?? user.primary2faMethod ?? null,
    };
  }

  async switchPrimary2faMethod(
    userId: string,
    method: TwoFactorMethod,
    verificationCode: string,
  ) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });

    if (method === TwoFactorMethod.EMAIL && !user.is2faEnabled) {
      throw new UnauthorizedException('Email 2FA is not enabled.');
    }
    if (method === TwoFactorMethod.TOTP && !user.totpEnabled) {
      throw new UnauthorizedException('Authenticator app is not enabled.');
    }

    if (user.primary2faMethod === method) {
      return { message: 'Primary method unchanged.', primary2faMethod: method };
    }

    const verifyAgainst = user.primary2faMethod ?? method;
    if (verifyAgainst === TwoFactorMethod.TOTP) {
      await this.otpService.verifyTotpCode(userId, verificationCode);
    } else {
      await this.otpService.verifyOtp(userId, verificationCode);
    }

    await this.userRepo.update(userId, { primary2faMethod: method });

    return { message: 'Primary 2FA method updated.', primary2faMethod: method };
  }

  async sendEmail2faEnableOtp(userId: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    const code = await this.otpService.generateOtp(userId);
    await this.authMail.sendOtp(user.email, user.firstName, code, 'login');
    return { message: 'Verification code sent to your email.' };
  }

  async sendPrimarySwitchEmailOtp(userId: string) {
    const user = await this.userRepo.findOneOrFail({ where: { id: userId } });
    if (!user.is2faEnabled) {
      throw new UnauthorizedException('Email 2FA is not enabled.');
    }
    const code = await this.otpService.generateOtp(userId);
    await this.authMail.sendOtp(user.email, user.firstName, code, 'login');
    return { message: 'Verification code sent to your email.' };
  }
}
