import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseMailService } from './base-mail.service';
import * as fs from 'fs';

import { Ride } from '../../rides/domain/entities/ride.entity';
import { TripPayment } from '../../billing/entities/trip-payment.entity';

/**
 * Sends branded invoice/receipt emails to passengers.
 */
@Injectable()
export class InvoiceMailService extends BaseMailService {
  private readonly logger = new Logger(InvoiceMailService.name);

  constructor(config: ConfigService) {
    super(config);
  }

  async sendInvoiceEmail(
    to: string,
    ride: Ride,
    payment: TripPayment,
    ref: string,
    pdfPath: string,
  ): Promise<void> {
    this.logger.log(`Preparing invoice email for ${to}, ref: ${ref}`);

    const paidAmount = payment.amount;
    const discountPercent = ride.discountPercent ?? 0;
    const originalPrice = ride.priceEstimate ?? paidAmount;
    const discount = discountPercent > 0
      ? originalPrice - paidAmount
      : 0;
    const total = paidAmount;

    const dateStr = payment.paidAt
      ? new Date(payment.paidAt).toLocaleString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '-';

    const methodLabel = payment.paymentMethod === 'CARD' ? 'Card' : 'Cash';

    const html = this.loadTemplate('invoice-email.html', {
      REF: ref,
      PICKUP: ride.pickupAddress,
      DROPOFF: ride.dropoffAddress,
      VEHICLE: ride.vehicleClass?.name ?? 'Standard',
      DISTANCE: `${ride.distanceKmReal ?? ride.distanceKm ?? '-'} km`,
      DURATION: `${ride.durationMinReal ?? ride.durationMin ?? '-'} min`,
      SUBTOTAL: `${originalPrice.toFixed(2)} TND`,
      DISCOUNT: discount > 0 ? `-${discount.toFixed(2)} TND` : '-',
      TOTAL: `${total.toFixed(2)} TND`,
      METHOD: methodLabel,
      DATE: dateStr,
      YEAR: new Date().getFullYear().toString(),
    });

    this.logger.log(`Invoice email HTML loaded, PDF path: ${pdfPath}`);

    try {
      await this.send(to, `Moviroo — Your ride receipt (${ref})`, html, [
        { filename: `${ref}.pdf`, path: pdfPath },
      ]);
      this.logger.log(`Invoice email sent successfully to ${to} for ${ref}`);
    } catch (err) {
      this.logger.error(`Failed to send invoice email to ${to}: ${err}`);
      throw err;
    }
  }

  /**
   * Override send() to support attachments.
   */
  public async send(
    to: string,
    subject: string,
    html: string,
    attachments?: { filename: string; path: string }[],
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to,
      subject,
      html,
      attachments,
    });
  }
}
