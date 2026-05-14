import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { SavedCardsService } from './saved-cards.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { TripPayment, PaymentStatus, PaymentMethod } from '../entities/trip-payment.entity';
import { InvoiceService } from './invoice.service';
import { PassengerEntity } from '../../passenger/entities/passengers.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';
import { FallbackDispatchService } from '../../dispatch/application/services/fallback-dispatch.service';

/** Rides within this window (ms) are dispatched immediately after payment */
const IMMEDIATE_THRESHOLD_MS = 60 * 60_000; // 60 minutes

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly stripe: InstanceType<typeof Stripe>;

  constructor(
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @Inject(forwardRef(() => FallbackDispatchService))
    private readonly fallbackService: FallbackDispatchService,
    private readonly savedCardsService: SavedCardsService,
    private readonly invoiceService: InvoiceService,
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

    /* Create PaymentIntent in EUR (Stripe does not support TND).
       Convert: TND ÷ 3.3 ≈ EUR, then × 100 for cents.
       The app always displays TND; EUR is Stripe-internal only. */
    const TND_TO_EUR_RATE = 3.3;
    const amountInCents = Math.round((payment.amount / TND_TO_EUR_RATE) * 100);
    const intent = await this.stripe.paymentIntents.create({
      amount: amountInCents,
      currency: 'eur',
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

  /**
   * Passenger-facing shortcut: create a Stripe PaymentIntent by rideId.
   * Also returns the Stripe customerId + a fresh ephemeral key so the
   * Flutter PaymentSheet can list / save cards for this customer.
   */
  async createStripePaymentIntentForRide(
    rideId: string,
    passengerId: string,
  ): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    customerId: string;
    ephemeralKey: string;
  }> {
    const payment = await this.paymentRepo.findOne({ where: { rideId } });
    if (!payment) throw new NotFoundException('TripPayment not found for this ride');
    if (payment.passengerId !== passengerId) throw new ForbiddenException('Not authorized to pay for this ride');

    const intentData = await this.createStripePaymentIntent(payment.id);

    const passenger = await this.passengerRepo.findOne({ where: { userId: passengerId } });
    const stripeCustomerId = passenger?.stripeCustomerId;
    if (!stripeCustomerId) {
      return { ...intentData, customerId: '', ephemeralKey: '' };
    }

    const ephemeralKey = await this.savedCardsService.createEphemeralKey(stripeCustomerId);
    return { ...intentData, customerId: stripeCustomerId, ephemeralKey };
  }

  /* ══════════════════════════════════════════════════
     Stripe Webhook — confirm payment + schedule/dispatch ride
  ══════════════════════════════════════════════════ */

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleStripeWebhook(event: any): Promise<void> {
    if (event.type === 'payment_intent.succeeded') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const intent = event.data.object as any;
      const tripPaymentId = intent.metadata.tripPaymentId;
      if (!tripPaymentId) return;

      const payment = await this.markAsPaid(tripPaymentId, PaymentMethod.CARD);
      await this._transitionRideAfterPayment(payment.rideId);
    }
  }

  /**
   * After Stripe confirms payment, transition the ride from PENDING to either:
   * - SEARCHING_DRIVER  → ride time is within 60 min (dispatch immediately)
   * - SCHEDULED         → ride is in the future (scheduler dispatches 30 min before)
   */
  private async _transitionRideAfterPayment(rideId: string): Promise<void> {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['vehicleClass'],
    });

    if (!ride) {
      this.logger.error(`[WEBHOOK] Ride ${rideId} not found after payment`);
      return;
    }

    if (ride.status !== RideStatus.PENDING) {
      this.logger.warn(
        `[WEBHOOK] Ride ${rideId} status=${ride.status}, skipping transition (expected PENDING)`,
      );
      return;
    }

    const now = Date.now();
    const rideTime = ride.scheduledAt ? new Date(ride.scheduledAt).getTime() : now;
    const isImmediate = rideTime - now <= IMMEDIATE_THRESHOLD_MS;

    if (isImmediate) {
      await this.rideRepo.update(rideId, { status: RideStatus.SEARCHING_DRIVER });
      ride.status = RideStatus.SEARCHING_DRIVER;

      this.logger.log(
        `⚡ [WEBHOOK] Ride ${rideId} paid → immediate, transitioning to SEARCHING_DRIVER + dispatching`,
      );

      this.fallbackService.runFullDispatch(ride).catch((err) =>
        this.logger.error(`[WEBHOOK] Dispatch failed for ride ${rideId}`, err?.stack),
      );
    } else {
      await this.rideRepo.update(rideId, { status: RideStatus.SCHEDULED });

      this.logger.log(
        `🕐 [WEBHOOK] Ride ${rideId} paid → SCHEDULED for ${ride.scheduledAt?.toISOString()}, scheduler will dispatch 30min before`,
      );
    }
  }

  /* ══════════════════════════════════════════════════
     Cash — Admin/Driver confirms cash received
  ══════════════════════════════════════════════════ */

  async confirmCashPayment(tripPaymentId: string): Promise<TripPayment> {
    return this.markAsPaid(tripPaymentId, PaymentMethod.CASH);
  }

  /* ══════════════════════════════════════════════════
     Refund — issue Stripe refund for a card payment
  ══════════════════════════════════════════════════ */

  /**
   * Issue a full Stripe refund for the TripPayment linked to the given rideId.
   * Only runs if: paymentMethod = CARD, paymentStatus = PAID, stripePaymentIntentId set.
   * Safe to call for cash rides (no-op).
   */
  async issueRefundByRideId(rideId: string): Promise<void> {
    const payment = await this.paymentRepo.findOne({ where: { rideId } });
    if (!payment) return;

    if (payment.paymentMethod !== PaymentMethod.CARD) {
      this.logger.log(`[REFUND] Ride ${rideId} is CASH — no refund needed`);
      return;
    }

    if (payment.paymentStatus !== PaymentStatus.PAID) {
      this.logger.log(
        `[REFUND] TripPayment ${payment.id} status=${payment.paymentStatus} — nothing to refund`,
      );
      return;
    }

    if (!payment.stripePaymentIntentId) {
      this.logger.error(
        `[REFUND] TripPayment ${payment.id} has no stripePaymentIntentId — cannot refund`,
      );
      return;
    }

    if (payment.stripeRefundId) {
      this.logger.warn(`[REFUND] TripPayment ${payment.id} already refunded (${payment.stripeRefundId})`);
      return;
    }

    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
      });

      payment.paymentStatus = PaymentStatus.REFUNDED;
      payment.stripeRefundId = refund.id;
      await this.paymentRepo.save(payment);

      this.logger.log(
        `💸 [REFUND] Refund ${refund.id} issued for TripPayment ${payment.id} (ride ${rideId})`,
      );
    } catch (err) {
      this.logger.error(`[REFUND] Stripe refund failed for ride ${rideId}: ${err}`);
    }
  }

  /* ══════════════════════════════════════════════════
     Card — Confirm client-side Stripe PaymentSheet success
  ══════════════════════════════════════════════════ */

  /**
   * Called by the Flutter app after Stripe PaymentSheet succeeds.
   * Idempotent — safe to call multiple times.
   * Marks payment PAID, transitions ride status, and starts dispatch if immediate.
   */
  async confirmCardPaymentSuccess(
    rideId: string,
    passengerId: string,
  ): Promise<TripPayment> {
    const payment = await this.paymentRepo.findOne({
      where: { rideId },
      relations: ['ride'],
    });

    if (!payment) {
      throw new NotFoundException('TripPayment not found for this ride');
    }

    if (payment.passengerId !== passengerId) {
      throw new ForbiddenException('Not authorized to confirm this payment');
    }

    // Idempotent: already paid → return immediately
    if (payment.paymentStatus === PaymentStatus.PAID) {
      this.logger.log(`TripPayment ${payment.id} already PAID — returning`);
      return payment;
    }

    // Mark as paid
    const updated = await this.markAsPaid(payment.id, PaymentMethod.CARD);

    // Transition ride status based on booking time
    const ride = payment.ride;
    if (ride && ride.status === RideStatus.PENDING) {
      const now = Date.now();
      const rideTime = ride.scheduledAt
        ? new Date(ride.scheduledAt).getTime()
        : now;
      const isImmediate = rideTime - now <= IMMEDIATE_THRESHOLD_MS;

      if (isImmediate) {
        await this.rideRepo.update(rideId, { status: RideStatus.SEARCHING_DRIVER });
        ride.status = RideStatus.SEARCHING_DRIVER;
        this.logger.log(
          `⚡ [CONFIRM] Ride ${rideId} paid → immediate, transitioning to SEARCHING_DRIVER + dispatching`,
        );
        this.fallbackService.runFullDispatch(ride).catch((err) =>
          this.logger.error(`[CONFIRM] Dispatch failed for ride ${rideId}`, err?.stack),
        );
      } else {
        await this.rideRepo.update(rideId, { status: RideStatus.SCHEDULED });
        this.logger.log(
          `🕐 [CONFIRM] Ride ${rideId} paid → SCHEDULED for ${ride.scheduledAt?.toISOString()}, scheduler will dispatch 30min before`,
        );
      }
    }

    return updated;
  }

  /* ══════════════════════════════════════════════════
     Internal — mark payment as paid
  ══════════════════════════════════════════════════ */

  private async markAsPaid(
    tripPaymentId: string,
    method: PaymentMethod,
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

    // Generate invoice + email in background (never block payment flow)
    this.invoiceService.generateInvoiceIfNeeded(payment.id).catch(() => {});

    return payment;
  }
}
