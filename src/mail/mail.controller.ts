import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BaseMailService } from './services/base-mail.service';

@Controller('mail')
@UseGuards(AuthGuard('jwt'))
export class MailController {
  constructor(private readonly baseMailService: BaseMailService) {}

  // ── POST /mail/test ───────────────────────────────────────────────────────
  // Test endpoint to send a test email (for debugging mail configuration)
  @Post('test')
  async sendTestEmail(@Body() body: { to: string }) {
    const { to } = body;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Email</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6C63FF; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #6C63FF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Test Email from Moviroo</h1>
          </div>
          <div class="content">
            <p>Hello,</p>
            <p>This is a test email sent from the Moviroo backend to verify your email configuration.</p>
            <p><strong>Configuration Details:</strong></p>
            <ul>
              <li>Host: ssl0.ovh.net</li>
              <li>Port: 587</li>
              <li>Encryption: TLS</li>
              <li>From: no-reply@moviroo.tn</li>
            </ul>
            <p>If you received this email, your mail configuration is working correctly!</p>
            <p>Best regards,<br>Moviroo Team</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.baseMailService.send(
      to,
      'Moviroo - Test Email',
      html,
    );

    return { message: 'Test email sent successfully', to };
  }
}
