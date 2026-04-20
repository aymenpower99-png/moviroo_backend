import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { TripPayment, PaymentStatus, PaymentMethod } from '../entities/trip-payment.entity';
import { PassengerEntity } from '../../passenger/entities/passengers.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly stripe: InstanceType<typeof Stripe>;

  constructor(
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
      apiVersion: '2025-03-31.basil' as any,
    });
  }

  /* ══════════════════════════════════════════════════
     Stripe — Create PaymentIntent
  ══════════════════════════════════════════════════ */

  async createStripePaymentIntent(tripPaymentId: string): Promise<{
    clientSecret: string;
    paymentIntentId: string;
  }> {
    const payment = await this.paymentRepo.findOne({ where: { id: tripPaymentId } });
    if (!payment) throw new NotFoundException('TripPayment not found');

    if (payment.paymentStatus !== PaymentStatus.PENDING) {
      throw new ConflictException(`Payment is already ${payment.paymentStatus}`);
    }

    if (payment.stripePaymentIntentId) {
      return {
        clientSecret: payment.stripeClientSecret!,
        paymentIntentId: payment.stripePaymentIntentId,
      };
    }

    /* Get or create Stripe customer */
    const passenger = await this.passengerRepo.findOne({
      where: { userId: payment.passengerId },
    });

    let stripeCustomerId = passenger?.stripeCustomerId ?? undefined;

    if (!stripeCustomerId && passenger) {
      const customer = await this.stripe.customers.create({
        metadata: { passengerId: payment.passengerId },
      });
      stripeCustomerId = customer.id;
      await this.passengerRepo.update(
        { userId: payment.passengerId },
        { stripeCustomerId },
      );
    }

    /* Create PaymentIntent — amount in millimes (TND minor unit = millimes, 1 TND = 1000 millimes) */
    const amountInMillimes = Math.round(payment.amount * 1000);
    const intent = await this.stripe.paymentIntents.create({
      amount: amountInMillimes,
      currency: 'tnd',
      customer: stripeCustomerId,
      metadata: {
        tripPaymentId: payment.id,
        rideId: payment.rideId,
      },
    });

    payment.stripePaymentIntentId = intent.id;
    payment.stripeClientSecret = intent.client_secret!;
    payment.paymentMethod = PaymentMethod.CARD;
    await this.paymentRepo.save(payment);

    this.logger.log(`Stripe PaymentIntent ${intent.id} created for TripPayment ${payment.id}`);

    return {
      clientSecret: intent.client_secret!,
      paymentIntentId: intent.id,
    };
  }

  /* ══════════════════════════════════════════════════
     Stripe Webhook — confirm payment
  ══════════════════════════════════════════════════ */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleStripeWebhook(event: any): Promise<void> {
    if (event.type === 'payment_intent.succeeded') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const intent = event.data.object as any;
      const tripPaymentId = intent.metadata.tripPaymentId;
      if (!tripPaymentId) return;

      await this.markAsPaid(tripPaymentId, PaymentMethod.CARD, intent.id);
    }
  }

  /* ══════════════════════════════════════════════════
     Cash — Admin/Driver confirms cash received
  ══════════════════════════════════════════════════ */

  async confirmCashPayment(tripPaymentId: string): Promise<TripPayment> {
    return this.markAsPaid(tripPaymentId, PaymentMethod.CASH);
  }

  /* ══════════════════════════════════════════════════
     Internal — mark payment as paid
  ══════════════════════════════════════════════════ */

  private async markAsPaid(
    tripPaymentId: string,
    method: PaymentMethod,
    _stripeChargeId?: string,
  ): Promise<TripPayment> {
    const payment = await this.paymentRepo.findOne({ where: { id: tripPaymentId } });
    if (!payment) throw new NotFoundException('TripPayment not found');

    if (payment.paymentStatus === PaymentStatus.PAID) {
      this.logger.warn(`TripPayment ${tripPaymentId} is already PAID`);
      return payment;
    }

    payment.paymentStatus = PaymentStatus.PAID;
    payment.paymentMethod = method;
    payment.paidAt = new Date();
    await this.paymentRepo.save(payment);

    this.logger.log(`TripPayment ${payment.id} → PAID (${method})`);
    return payment;
  }
}
