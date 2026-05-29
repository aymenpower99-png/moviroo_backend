import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMailService } from './base-mail.service';
import { Ride } from '../../rides/domain/entities/ride.entity';

/**
 * Sends ride-related emails to passengers (cancellation, refund notices, etc.).
 */
@Injectable()
export class RideMailService extends BaseMailService {
  private readonly logger = new Logger(RideMailService.name);

  constructor(config: ConfigService) {
    super(config);
  }

  /**
   * Notify a passenger that their ride was cancelled and that the
   * refund / reimbursement process has started.
   */
  async sendRideCancelledRefundEmail(
    to: string,
    passengerName: string,
    ride: Ride,
    cancelledBy: string,
    reason?: string | null,
  ): Promise<void> {
    const dateStr = new Date().toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const cancelledByLabel =
      cancelledBy === 'PASSENGER'
        ? 'You'
        : cancelledBy === 'DRIVER'
          ? 'Your driver'
          : cancelledBy === 'ADMIN'
            ? 'An admin'
            : 'The system';

    const html = this.loadTemplate('ride-cancelled-refund.html', {
      PASSENGER_NAME: passengerName,
      CANCELLED_BY: cancelledByLabel,
      REASON: reason?.trim() || 'No reason provided.',
      PICKUP: ride.pickupAddress,
      DROPOFF: ride.dropoffAddress,
      DATE: dateStr,
      YEAR: new Date().getFullYear().toString(),
    });

    await this.send(to, 'Moviroo — Your ride has been cancelled', html);
    this.logger.log(`Ride cancellation email sent to ${to} for ride ${ride.id}`);
  }
}
