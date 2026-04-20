import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared transporter + template loader used by every mail service.
 * All concrete mail services (auth, invitation, welcome, ...) should extend this.
 */
@Injectable()
export class BaseMailService {
  protected transporter: nodemailer.Transporter;

  constructor(protected readonly config: ConfigService) {
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

  protected get fromAddress(): string {
    return `"Moviroo" <${this.config.get<string>('mail.from')}>`;
  }

  protected loadTemplate(
    templateName: string,
    variables: Record<string, string>,
  ): string {
    // Templates live in src/mail/templates (one level up from services/)
    const templatePath = path.join(__dirname, '..', 'templates', templateName);
    let html = fs.readFileSync(templatePath, 'utf-8');
    for (const [key, value] of Object.entries(variables)) {
      html = html.replaceAll(`{{${key}}}`, value);
    }
    return html;
  }

  protected async send(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject,
      html,
    });
  }
}
