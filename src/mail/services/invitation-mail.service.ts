import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMailService } from './base-mail.service';

/**
 * Emails sent when an admin creates an account and invites a user
 * (driver or passenger) to set their password + activate.
 */
@Injectable()
export class InvitationMailService extends BaseMailService {
  private readonly logger = new Logger(InvitationMailService.name);

  constructor(config: ConfigService) {
    super(config);
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

    await this.send(email, "You've been invited to Moviroo", html);
    this.logger.log(`Invitation sent to ${email}`);
  }
}
