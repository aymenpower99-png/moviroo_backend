import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMailService } from './base-mail.service';
import { UserRole } from '../../users/entites/user.entity';

/**
 * Welcome emails sent ONLY on the first real interaction:
 *   - Driver: after activating account (password set from admin invite)
 *   - Passenger (email/password): after email verification
 *   - Passenger (admin-invited): after activating account
 *   - Passenger (social login): first time the account is created
 *
 * NEVER sent when:
 *   - Admin just creates the account (invite is sent instead)
 *   - User logs in again
 */
@Injectable()
export class WelcomeMailService extends BaseMailService {
  private readonly logger = new Logger(WelcomeMailService.name);

  constructor(config: ConfigService) {
    super(config);
  }

  /** Fire-and-forget wrapper: never blocks the caller; errors are logged. */
  sendWelcome(
    role: UserRole,
    email: string,
    firstName: string,
  ): void {
    const task =
      role === UserRole.DRIVER
        ? this.sendWelcomeDriver(email, firstName)
        : this.sendWelcomePassenger(email, firstName);

    task.catch((err) =>
      this.logger.warn(
        `Welcome email skipped for ${email}: ${(err as Error).message}`,
      ),
    );
  }

  async sendWelcomeDriver(email: string, firstName: string): Promise<void> {
    const html = this.loadTemplate('welcome-driver.html', {
      FIRST_NAME: firstName,
      YEAR: new Date().getFullYear().toString(),
    });
    await this.send(email, 'Welcome to Moviroo – Your driver account is live', html);
    this.logger.log(`Welcome (driver) email sent to ${email}`);
  }

  async sendWelcomePassenger(email: string, firstName: string): Promise<void> {
    const html = this.loadTemplate('welcome-passenger.html', {
      FIRST_NAME: firstName,
      YEAR: new Date().getFullYear().toString(),
    });
    await this.send(email, 'Welcome to Moviroo – Let the journey begin', html);
    this.logger.log(`Welcome (passenger) email sent to ${email}`);
  }
}
