import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const LOGO_URL    = 'https://res.cloudinary.com/dox9rfabz/image/upload/v1774816416/ls2-removebg-preview_azlsfa.png';
const BRAND_COLOR = '#7C3AED';
const BRAND_DARK  = '#5B21B6';

const baseTemplate = (content: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Moviroo</title>
</head>
<body style="margin:0;padding:0;background:#F4F4F5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="background:#fff;padding:32px 40px 24px;border-radius:16px 16px 0 0;border:1px solid #E5E7EB;border-bottom:none;">
            <img src="${LOGO_URL}" alt="Moviroo" width="140" style="display:block;height:auto;margin:0 auto;"/>
          </td>
        </tr>
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,${BRAND_COLOR} 0%,${BRAND_DARK} 100%);"></td>
        </tr>
        <tr>
          <td style="background:#fff;padding:40px;border-left:1px solid #E5E7EB;border-right:1px solid #E5E7EB;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:24px 40px;border-radius:0 0 16px 16px;border:1px solid #E5E7EB;border-top:none;text-align:center;">
            <p style="margin:0 0 6px;font-size:13px;color:#6B7280;">&copy; ${new Date().getFullYear()} Moviroo. All rights reserved.</p>
            <p style="margin:0;font-size:12px;color:#9CA3AF;">If you did not request this, you can safely ignore this email.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const otpTemplate = (firstName: string, code: string, purpose: 'verify-email' | 'login', expiryMinutes = 10) =>
  baseTemplate(`
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
    ${purpose === 'verify-email' ? 'Verify your email address' : 'Login verification code'}
  </h1>
  <p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.6;">
    Hi <strong style="color:#111827;">${firstName}</strong>,<br/>
    ${purpose === 'verify-email'
      ? 'Welcome to Moviroo! Use the code below to verify your email address.'
      : 'Use the code below to complete your sign-in.'}
  </p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;"/>
  <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1.5px;">Your verification code</p>
  <div style="background:#F5F3FF;border:2px dashed ${BRAND_COLOR};border-radius:12px;padding:28px 24px;text-align:center;margin-bottom:28px;">
    <span style="font-size:52px;font-weight:800;letter-spacing:18px;color:${BRAND_COLOR};font-family:'Courier New',monospace;">${code}</span>
  </div>
  <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:6px;padding:14px 16px;margin-bottom:28px;">
    <p style="margin:0;font-size:13px;color:#92400E;">Expires in <strong>${expiryMinutes} minutes</strong>. Never share this code.</p>
  </div>
  <p style="margin:0;font-size:13px;color:#9CA3AF;text-align:center;">
    Did not request this? <a href="mailto:support@moviroo.com" style="color:${BRAND_COLOR};font-weight:600;">Contact support</a>
  </p>`);

const invitationTemplate = (firstName: string, activationLink: string) =>
  baseTemplate(`
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">You've been invited to Moviroo</h1>
  <p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.6;">
    Hi <strong style="color:#111827;">${firstName}</strong>,<br/>
    Click the button below to set your password and activate your account.
  </p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;"/>
  <div style="text-align:center;margin-bottom:28px;">
    <a href="${activationLink}" style="display:inline-block;padding:14px 32px;background:${BRAND_COLOR};color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Activate Account</a>
  </div>
  <p style="margin:0 0 8px;font-size:13px;color:#6B7280;text-align:center;">Or copy this link:</p>
  <p style="margin:0 0 28px;font-size:12px;color:#9CA3AF;text-align:center;word-break:break-all;">${activationLink}</p>
  <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:6px;padding:14px 16px;">
    <p style="margin:0;font-size:13px;color:#92400E;">This link expires in <strong>72 hours</strong>.</p>
  </div>`);

const emailChangeVerifyTemplate = (firstName: string, verifyLink: string) =>
  baseTemplate(`
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Confirm your new email address</h1>
  <p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.6;">
    Hi <strong style="color:#111827;">${firstName}</strong>,<br/>
    Click the button below to verify and complete your email update.
  </p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;"/>
  <div style="text-align:center;margin-bottom:28px;">
    <a href="${verifyLink}" style="display:inline-block;padding:14px 32px;background:${BRAND_COLOR};color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">Verify Email</a>
  </div>
  <p style="margin:0 0 8px;font-size:13px;color:#6B7280;text-align:center;">Or copy this link:</p>
  <p style="margin:0 0 28px;font-size:12px;color:#9CA3AF;text-align:center;word-break:break-all;">${verifyLink}</p>
  <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:6px;padding:14px 16px;">
    <p style="margin:0;font-size:13px;color:#92400E;">This link expires in <strong>1 hour</strong>. If you did not request this, ignore this email.</p>
  </div>`);

const emailChangeAlertTemplate = (firstName: string, newEmail: string) =>
  baseTemplate(`
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Security alert: email change requested</h1>
  <p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.6;">
    Hi <strong style="color:#111827;">${firstName}</strong>,<br/>
    Your Moviroo account email is being changed to <strong style="color:#111827;">${newEmail}</strong>.<br/>
    If this was you, no action is needed.
  </p>
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;"/>
  <div style="background:#FEF2F2;border-left:4px solid #EF4444;border-radius:6px;padding:14px 16px;margin-bottom:28px;">
    <p style="margin:0;font-size:13px;color:#991B1B;"><strong>If this wasn't you</strong>, contact support immediately.</p>
  </div>
  <div style="text-align:center;">
    <a href="mailto:support@moviroo.com" style="display:inline-block;padding:12px 28px;background:#EF4444;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Secure my account</a>
  </div>`);

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:   this.config.get<string>('mail.host'),
      port:   this.config.get<number>('mail.port'),
      secure: this.config.get<boolean>('mail.secure'),
      auth: {
        user: this.config.get<string>('mail.user'),
        pass: this.config.get<string>('mail.pass'),
      },
    } as any);
  }

  async sendOtp(to: string, firstName: string, code: string, purpose: 'verify-email' | 'login'): Promise<void> {
    await this.transporter.sendMail({
      from:    `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to, subject: purpose === 'verify-email'
        ? 'Moviroo \u2013 Verify your email address'
        : 'Moviroo \u2013 Your login verification code',
      html: otpTemplate(firstName, code, purpose),
    });
    this.logger.log(`OTP sent to ${to} [${purpose}]`);
  }

  async sendInvitation(email: string, firstName: string, activationLink: string): Promise<void> {
    await this.transporter.sendMail({
      from:    `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to:      email,
      subject: "You've been invited to Moviroo",
      html:    invitationTemplate(firstName, activationLink),
    });
    this.logger.log(`Invitation sent to ${email}`);
  }

  async sendEmailChangeVerification(to: string, firstName: string, token: string): Promise<void> {
    const frontendUrl = this.config.get<string>('app.frontendUrl') ?? 'http://localhost:5173';
    const verifyLink  = `${frontendUrl}/verify-email-change?token=${token}`;
    await this.transporter.sendMail({
      from:    `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to,
      subject: 'Moviroo \u2013 Confirm your new email address',
      html:    emailChangeVerifyTemplate(firstName, verifyLink),
    });
    this.logger.log(`Email-change verification sent to ${to}`);
  }

  async sendEmailChangeAlert(to: string, firstName: string, newEmail: string): Promise<void> {
    await this.transporter.sendMail({
      from:    `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to,
      subject: 'Moviroo \u2013 Your email is being changed',
      html:    emailChangeAlertTemplate(firstName, newEmail),
    });
    this.logger.log(`Email-change alert sent to ${to}`);
  }
}