import { Module, Global } from '@nestjs/common';
import { AuthMailService } from './services/auth-mail.service';
import { InvitationMailService } from './services/invitation-mail.service';
import { WelcomeMailService } from './services/welcome-mail.service';
import { InvoiceMailService } from './services/invoice-mail.service';
import { RideMailService } from './services/ride-mail.service';
import { BaseMailService } from './services/base-mail.service';
import { MailController } from './mail.controller';

/**
 * Global mail module — split into focused services so this folder stays
 * maintainable as new email types are added.
 *
 *   AuthMailService        → OTP, forgot-password, email-change verify/alert
 *   InvitationMailService  → admin invite (activation link)
 *   WelcomeMailService     → welcome email on first real interaction
 *   InvoiceMailService     → ride receipt / invoice emails
 *   RideMailService        → ride cancellation / refund notices
 */
@Global()
@Module({
  providers: [
    BaseMailService,
    AuthMailService,
    InvitationMailService,
    WelcomeMailService,
    InvoiceMailService,
    RideMailService,
  ],
  controllers: [MailController],
  exports: [
    BaseMailService,
    AuthMailService,
    InvitationMailService,
    WelcomeMailService,
    InvoiceMailService,
    RideMailService,
  ],
})
export class MailModule {}
