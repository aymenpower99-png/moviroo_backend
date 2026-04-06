import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('mail.host'),
      port: this.config.get<number>('mail.port'),
      secure: this.config.get<boolean>('mail.secure'),
      auth: {
        user: this.config.get<string>('mail.user'),
        pass: this.config.get<string>('mail.pass'),
      },
    } as any);
  }

  private loadTemplate(
    templateName: string,
    variables: Record<string, string>,
  ): string {
    const templatePath = path.join(__dirname, 'templates', templateName);
    let html = fs.readFileSync(templatePath, 'utf-8');
    for (const [key, value] of Object.entries(variables)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }
    return html;
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

    await this.transporter.sendMail({
      from: `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to,
      subject:
        purpose === 'verify-email'
          ? 'Moviroo – Verify your email address'
          : 'Moviroo – Your login verification code',
      html,
    });
    this.logger.log(`OTP sent to ${to} [${purpose}]`);
  }

  async sendInvitation(
    email: string,
    firstName: string,
    activationLink: string,
  ): Promise<void> {
    const html = this.loadTemplate('invitation.html', {
      FIRST_NAME: firstName,
      ACTIVATION_LINK: activationLink,
      YEAR: new Date().getFullYear().toString(),
    });

    await this.transporter.sendMail({
      from: `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to: email,
      subject: "You've been invited to Moviroo",
      html,
    });
    this.logger.log(`Invitation sent to ${email}`);
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

    await this.transporter.sendMail({
      from: `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to,
      subject: 'Moviroo – Confirm your new email address',
      html,
    });
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

    await this.transporter.sendMail({
      from: `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to,
      subject: 'Moviroo – Your email is being changed',
      html,
    });
    this.logger.log(`Email-change alert sent to ${to}`);
  }

  // ─── Send Forgot Password ─────────────────────────────────────────────────

  async sendForgotPassword(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    // ✅ Points to the React frontend /reset-password page
    const backendUrl =
      this.config.get<string>('app.backendUrl') ?? 'http://localhost:3000/api';
    const resetLink = `${backendUrl}/auth/reset-password?token=${token}`;

    const html = this.loadTemplate('forgot-password.html', {
      FIRST_NAME: firstName,
      RESET_LINK: resetLink,
      EXPIRY_MINUTES: '30',
      YEAR: new Date().getFullYear().toString(),
    });

    await this.transporter.sendMail({
      from: `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to,
      subject: 'Moviroo – Reset your password',
      html,
    });
    this.logger.log(`Forgot-password email sent to ${to}`);
  }
}
