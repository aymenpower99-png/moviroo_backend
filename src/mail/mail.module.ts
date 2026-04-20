import { Module, Global } from '@nestjs/common';
import { AuthMailService } from './services/auth-mail.service';
import { InvitationMailService } from './services/invitation-mail.service';
import { WelcomeMailService } from './services/welcome-mail.service';

/**
 * Global mail module — split into focused services so this folder stays
 * maintainable as new email types are added.
 *
 *   AuthMailService        → OTP, forgot-password, email-change verify/alert
 *   InvitationMailService  → admin invite (activation link)
 *   WelcomeMailService     → welcome email on first real interaction
 */
@Global()
@Module({
  providers: [AuthMailService, InvitationMailService, WelcomeMailService],
  exports: [AuthMailService, InvitationMailService, WelcomeMailService],
})
export class MailModule {}
