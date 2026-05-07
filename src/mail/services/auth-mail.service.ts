import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMailService } from './base-mail.service';

/**
 * Transactional authentication emails:
 *   - OTP (verify-email / login)
 *   - Forgot password
 *   - Email change verification + security alert
 */
@Injectable()
export class AuthMailService extends BaseMailService {
  private readonly logger = new Logger(AuthMailService.name);

  constructor(config: ConfigService) {
    super(config);
  }

  async sendVerifyEmailLink(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const backendUrl =
      this.config.get<string>('app.backendUrl') ?? 'http://localhost:3000/api';
    const verifyLink = `${backendUrl}/auth/verify-email?token=${token}`;

    const html = this.loadTemplate('verify-email.html', {
      FIRST_NAME: firstName,
      VERIFY_LINK: verifyLink,
      EXPIRY_MINUTES: '30',
      YEAR: new Date().getFullYear().toString(),
    });

    await this.send(to, 'Moviroo – Verify your email address', html);
    this.logger.log(`Verify-email link sent to ${to}`);
  }

  async sendOtp(
    to: string,
    firstName: string,
    code: string,
    purpose: 'verify-email' | 'login',
  ): Promise<void> {
    const title =
      purpose === 'verify-email'
        ? 'Verify your email address'
        : 'Login verification code';
    const subtitle =
      purpose === 'verify-email'
        ? 'Welcome to Moviroo! Use the code below to verify your email address.'
        : 'Use the code below to complete your sign-in.';

    const html = this.loadTemplate('otp.html', {
      TITLE: title,
      FIRST_NAME: firstName,
      SUBTITLE: subtitle,
      CODE: code,
      EXPIRY_MINUTES: '10',
      YEAR: new Date().getFullYear().toString(),
    });

    const subject =
      purpose === 'verify-email'
        ? 'Moviroo – Verify your email address'
        : 'Moviroo – Your login verification code';

    await this.send(to, subject, html);
    this.logger.log(`OTP sent to ${to} [${purpose}]`);
  }

  async sendForgotPassword(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const backendUrl =
      this.config.get<string>('app.backendUrl') ?? 'http://localhost:3000/api';
    const resetLink = `${backendUrl}/auth/reset-password?token=${token}`;

    const html = this.loadTemplate('forgot-password.html', {
      FIRST_NAME: firstName,
      RESET_LINK: resetLink,
      EXPIRY_MINUTES: '30',
      YEAR: new Date().getFullYear().toString(),
    });

    await this.send(to, 'Moviroo – Reset your password', html);
    this.logger.log(`Forgot-password email sent to ${to}`);
  }

  async sendEmailChangeVerification(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const backendUrl =
      this.config.get<string>('app.backendUrl') ?? 'http://localhost:3000/api';
    const verifyLink = `${backendUrl}/auth/email-change/confirm?token=${token}`;

    const html = this.loadTemplate('email-change-verify.html', {
      FIRST_NAME: firstName,
      VERIFY_LINK: verifyLink,
      YEAR: new Date().getFullYear().toString(),
    });

    await this.send(to, 'Moviroo – Confirm your new email address', html);
    this.logger.log(`Email-change verification sent to ${to}`);
  }

  async sendEmailChangeAlert(
    to: string,
    firstName: string,
    newEmail: string,
  ): Promise<void> {
    const html = this.loadTemplate('email-change-alert.html', {
      FIRST_NAME: firstName,
      NEW_EMAIL: newEmail,
      YEAR: new Date().getFullYear().toString(),
    });

    await this.send(to, 'Moviroo – Your email is being changed', html);
    this.logger.log(`Email-change alert sent to ${to}`);
  }

  /**
   * Security alert email sent after a sensitive account change:
   *   - password_changed: user changed their login password
   *   - 2fa_disabled:     two-step verification was turned off
   *   - totp_removed:     authenticator app was unlinked
   */
  async sendSecurityAlert(
    to: string,
    firstName: string,
    event: 'password_changed' | '2fa_disabled' | 'totp_removed',
  ): Promise<void> {
    const events: Record<
      'password_changed' | '2fa_disabled' | 'totp_removed',
      { title: string; desc: string }
    > = {
      password_changed: {
        title: 'Password changed',
        desc: 'Your Moviroo account password was successfully changed.',
      },
      '2fa_disabled': {
        title: '2-step verification disabled',
        desc: 'Two-step verification has been turned off on your account.',
      },
      totp_removed: {
        title: 'Authenticator app removed',
        desc: 'Your authenticator app has been unlinked from your account.',
      },
    };

    const { title, desc } = events[event];

    const html = this.loadTemplate('security-alert.html', {
      FIRST_NAME: firstName,
      EVENT_TITLE: title,
      EVENT_DESC: desc,
      YEAR: new Date().getFullYear().toString(),
    });

    await this.send(to, `Moviroo – Security alert: ${title}`, html);
    this.logger.log(`Security alert [${event}] sent to ${to}`);
  }
}
