import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

const LOGO_URL    = 'https://res.cloudinary.com/dox9rfabz/image/upload/f_auto,q_auto/ls2_b5rolr';
const BRAND_COLOR = '#7C3AED';
const BRAND_DARK  = '#5B21B6';

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Moviroo</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F4F4F5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header: clean white with logo only -->
          <tr>
            <td align="center" style="
              background:#ffffff;
              padding:32px 40px 24px;
              border-radius:16px 16px 0 0;
              border-left:1px solid #E5E7EB;
              border-right:1px solid #E5E7EB;
              border-top:1px solid #E5E7EB;
            ">
              <img
                src="${LOGO_URL}"
                alt="Moviroo"
                width="140"
                style="display:block;height:auto;margin:0 auto;"
              />
            </td>
          </tr>

          <!-- Purple accent line under logo -->
          <tr>
            <td style="
              height:4px;
              background:linear-gradient(90deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%);
            "></td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="
              background:#ffffff;
              padding:40px;
              border-left:1px solid #E5E7EB;
              border-right:1px solid #E5E7EB;
            ">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="
              background:#F9FAFB;
              padding:24px 40px;
              border-radius:0 0 16px 16px;
              border:1px solid #E5E7EB;
              border-top:none;
              text-align:center;
            ">
              <p style="margin:0 0 8px;font-size:13px;color:#6B7280;">
                © ${new Date().getFullYear()} Moviroo. All rights reserved.
              </p>
              <p style="margin:0;font-size:12px;color:#9CA3AF;">
                You received this email because you have an account with Moviroo.<br/>
                If you did not request this, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const otpTemplate = (
  firstName: string,
  code: string,
  purpose: 'verify-email' | 'login',
  expiryMinutes = 10,
) => baseTemplate(`
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
    ${purpose === 'verify-email' ? 'Verify your email address' : 'Login verification code'}
  </h1>
  <p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.6;">
    Hi <strong style="color:#111827;">${firstName}</strong>,<br/>
    ${purpose === 'verify-email'
      ? 'Welcome to Moviroo! Use the code below to verify your email address and activate your account.'
      : 'Use the code below to complete your sign-in. This code is valid for a limited time.'}
  </p>

  <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;" />

  <!-- Label -->
  <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:1.5px;">
    Your verification code
  </p>

  <!-- OTP Box -->
  <div style="
    background:#F5F3FF;
    border:2px dashed ${BRAND_COLOR};
    border-radius:12px;
    padding:28px 24px;
    text-align:center;
    margin-bottom:28px;
  ">
    <span style="
      font-size:52px;
      font-weight:800;
      letter-spacing:18px;
      color:${BRAND_COLOR};
      font-family:'Courier New',monospace;
    ">${code}</span>
  </div>

  <!-- Expiry warning -->
  <div style="
    background:#FFFBEB;
    border-left:4px solid #F59E0B;
    border-radius:6px;
    padding:14px 16px;
    margin-bottom:28px;
  ">
    <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
      This code expires in <strong>${expiryMinutes} minutes</strong>.
      Never share this code with anyone — Moviroo will never ask for it.
    </p>
  </div>

  <p style="margin:0;font-size:13px;color:#9CA3AF;text-align:center;">
    Did not request this?
    <a href="mailto:support@moviroo.com" style="color:${BRAND_COLOR};text-decoration:none;font-weight:600;">Contact support</a>
  </p>
`);

const magicLinkTemplate = (firstName: string, link: string) => baseTemplate(`
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
    Your sign-in link
  </h1>
  <p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.6;">
    Hi <strong style="color:#111827;">${firstName}</strong>,<br/>
    Click the button below to sign in to your Moviroo account.
    This link is valid for 15 minutes and can only be used once.
  </p>

  <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 28px;" />

  <!-- CTA Button -->
  <div style="text-align:center;margin-bottom:28px;">
    <a href="${link}" style="
      display:inline-block;
      background:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_DARK} 100%);
      color:#ffffff;
      font-size:15px;
      font-weight:700;
      padding:16px 48px;
      border-radius:10px;
      text-decoration:none;
      letter-spacing:0.3px;
    ">
      Sign in to Moviroo
    </a>
  </div>

  <!-- Expiry -->
  <div style="
    background:#FFFBEB;
    border-left:4px solid #F59E0B;
    border-radius:6px;
    padding:14px 16px;
    margin-bottom:28px;
  ">
    <p style="margin:0;font-size:13px;color:#92400E;line-height:1.5;">
      This link expires in <strong>15 minutes</strong> and can only be used once.
    </p>
  </div>

  <!-- Fallback URL -->
  <p style="margin:0 0 6px;font-size:12px;color:#9CA3AF;text-align:center;">
    If the button does not work, copy and paste this link into your browser:
  </p>
  <p style="margin:0;font-size:11px;text-align:center;word-break:break-all;">
    <a href="${link}" style="color:${BRAND_COLOR};text-decoration:none;">${link}</a>
  </p>
`);

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

  async sendOtp(
    to: string,
    firstName: string,
    code: string,
    purpose: 'verify-email' | 'login',
  ): Promise<void> {
    const subject = purpose === 'verify-email'
      ? 'Moviroo – Verify your email address'
      : 'Moviroo – Your login verification code';

    await this.transporter.sendMail({
      from:    `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to,
      subject,
      html:    otpTemplate(firstName, code, purpose),
    });

    this.logger.log(`OTP email sent to ${to} [${purpose}]`);
  }

  async sendMagicLink(
    to: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const baseUrl = this.config.get<string>('app.frontendUrl');
    const link    = `${baseUrl}/auth/magic-link?token=${token}`;

    await this.transporter.sendMail({
      from:    `"Moviroo" <${this.config.get<string>('mail.from')}>`,
      to,
      subject: 'Moviroo – Your sign-in link',
      html:    magicLinkTemplate(firstName, link),
    });

    this.logger.log(`Magic link email sent to ${to}`);
  }
}