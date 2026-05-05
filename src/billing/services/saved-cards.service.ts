import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';

import { PassengerEntity } from '../../passenger/entities/passengers.entity';

export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

@Injectable()
export class SavedCardsService {
  private readonly logger = new Logger(SavedCardsService.name);
  private readonly stripe: InstanceType<typeof Stripe>;

  constructor(
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
  ) {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
      apiVersion: '2025-03-31.basil' as any,
    });
  }

  /* ─── Customer helpers ─────────────────────────────────────────────── */

  /** Get or create a Stripe customer for this passenger. Returns the customerId. */
  async getOrCreateCustomer(passengerId: string): Promise<string | null> {
    const passenger = await this.passengerRepo.findOne({ where: { userId: passengerId } });
    if (!passenger) return null;

    if (passenger.stripeCustomerId) return passenger.stripeCustomerId;

    const customer = await this.stripe.customers.create({
      metadata: { passengerId },
    });
    await this.passengerRepo.update({ userId: passengerId }, { stripeCustomerId: customer.id });
    this.logger.log(`Stripe customer ${customer.id} created for passenger ${passengerId}`);
    return customer.id;
  }

  /** Create a short-lived ephemeral key for the PaymentSheet. */
  async createEphemeralKey(customerId: string): Promise<string> {
    const ek = await this.stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: '2025-03-31' } as any,
    );
    return ek.secret!;
  }

  /* ─── SetupIntent (add card without charging) ──────────────────────── */

  async createSetupIntent(passengerId: string): Promise<{
    setupIntentClientSecret: string;
    customerId: string;
    ephemeralKey: string;
  }> {
    const customerId = await this.getOrCreateCustomer(passengerId);
    if (!customerId) throw new NotFoundException('Passenger profile not found');

    const [setupIntent, ephemeralKey] = await Promise.all([
      this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
      }),
      this.createEphemeralKey(customerId),
    ]);

    return {
      setupIntentClientSecret: setupIntent.client_secret!,
      customerId,
      ephemeralKey,
    };
  }

  /* ─── List saved cards ─────────────────────────────────────────────── */

  async getSavedCards(passengerId: string): Promise<SavedCard[]> {
    const passenger = await this.passengerRepo.findOne({ where: { userId: passengerId } });
    if (!passenger?.stripeCustomerId) return [];

    const customer = await this.stripe.customers.retrieve(passenger.stripeCustomerId);
    if (customer.deleted) return [];

    const defaultPmId =
      typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : null;

    const pms = await this.stripe.paymentMethods.list({
      customer: passenger.stripeCustomerId,
      type: 'card',
    });

    return pms.data.map((pm) => ({
      id: pm.id,
      brand: pm.card!.brand,
      last4: pm.card!.last4,
      expMonth: pm.card!.exp_month,
      expYear: pm.card!.exp_year,
      isDefault: pm.id === defaultPmId,
    }));
  }

  /* ─── Delete saved card ────────────────────────────────────────────── */

  async deleteSavedCard(passengerId: string, paymentMethodId: string): Promise<void> {
    const passenger = await this.passengerRepo.findOne({ where: { userId: passengerId } });
    if (!passenger?.stripeCustomerId) throw new NotFoundException('No payment profile found');

    const pm = await this.stripe.paymentMethods.retrieve(paymentMethodId);
    if (pm.customer !== passenger.stripeCustomerId) {
      throw new ForbiddenException('Card not found for this account');
    }

    await this.stripe.paymentMethods.detach(paymentMethodId);
    this.logger.log(`Card ${paymentMethodId} removed for passenger ${passengerId}`);
  }

  /* ─── Set default card ─────────────────────────────────────────────── */

  async setDefaultCard(passengerId: string, paymentMethodId: string): Promise<void> {
    const passenger = await this.passengerRepo.findOne({ where: { userId: passengerId } });
    if (!passenger?.stripeCustomerId) throw new NotFoundException('No payment profile found');

    await this.stripe.customers.update(passenger.stripeCustomerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    this.logger.log(`Default card → ${paymentMethodId} for passenger ${passengerId}`);
  }
}
