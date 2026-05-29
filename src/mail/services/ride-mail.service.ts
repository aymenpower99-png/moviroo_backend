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
    paymentMethod?: string | null,
    reason?: string | null,
  ): Promise<void> {
    const dateStr = new Date().toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const timeStr = new Date().toLocaleString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Build refund section HTML based on payment method
    let refundSection = '';
    if (paymentMethod === 'CARD') {
      refundSection = `
        <div style="background: linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(91,33,182,0.06) 100%); border-radius: 12px; padding: 24px; border: 1px solid rgba(124,58,237,0.15); margin-bottom: 24px;">
          <h2 style="font-size: 16px; font-weight: 700; color: #7c3aed; margin: 0 0 12px; text-align: center;">Refund process started</h2>
          <p style="font-size: 14px; color: #374151; line-height: 1.6; margin: 0 0 12px;">
            Your refund has been automatically initiated for this cancelled ride.
          </p>
          <p style="font-size: 13px; color: #6b7280; line-height: 1.6; margin: 0;">
            The refund will appear in your account within 5–10 business days, depending on your bank.
          </p>
        </div>
      `;
    }
    // For CASH, refundSection remains empty (no section shown)

    const html = this.loadTemplate('ride-cancelled-refund.html', {
      PASSENGER_NAME: passengerName,
      CANCELLED_BY: cancelledBy,
      REASON: reason?.trim() || 'No reason provided.',
      PICKUP: ride.pickupAddress,
      DROPOFF: ride.dropoffAddress,
      DATE: dateStr,
      TIME: timeStr,
      YEAR: new Date().getFullYear().toString(),
      REFUND_SECTION: refundSection,
    });

    await this.send(to, 'Moviroo — Your ride has been cancelled', html);
    this.logger.log(
      `Ride cancellation email sent to ${to} for ride ${ride.id}`,
    );
  }
}
