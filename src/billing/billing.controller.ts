import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Res,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import Stripe from 'stripe';

import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entites/user.entity';

import { BillingService } from './services/billing.service';
import { PaymentService } from './services/payment.service';
import { InvoiceService } from './services/invoice.service';
import { SavedCardsService } from './services/saved-cards.service';
import { DriverEarningsService } from './services/driver-earnings.service';
import {
  PaymentFilterDto,
  EarningsFilterDto,
} from './dto/billing.dto';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly paymentService: PaymentService,
    private readonly invoiceService: InvoiceService,
    private readonly savedCardsService: SavedCardsService,
    private readonly driverEarningsService: DriverEarningsService,
  ) {}

  /* ══════════════════════════════════════════════════
     Trip Payments
  ══════════════════════════════════════════════════ */

  @Get('payments')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getPayments(@Query() filters: PaymentFilterDto) {
    return this.billingService.findAll(filters);
  }

  @Get('payments/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getPaymentById(@Param('id') id: string) {
    return this.billingService.findById(id);
  }

  /* ══════════════════════════════════════════════════
     Stripe — Create PaymentIntent
  ══════════════════════════════════════════════════ */

  @Post('payments/:id/stripe-intent')
  @UseGuards(AuthGuard('jwt'))
  async createStripeIntent(@Param('id') tripPaymentId: string) {
    return this.paymentService.createStripePaymentIntent(tripPaymentId);
  }

  /**
   * Passenger-facing: get/create Stripe PaymentIntent using the rideId.
   * Called by the Flutter app after confirmRide(CARD) to present PaymentSheet.
   * Returns clientSecret + customerId + ephemeralKey for saved-card support.
   */
  @Post('payments/ride/:rideId/stripe-intent')
  @UseGuards(AuthGuard('jwt'))
  async createStripeIntentByRide(
    @Param('rideId') rideId: string,
    @Req() req: any,
  ) {
    return this.paymentService.createStripePaymentIntentForRide(
      rideId,
      req.user.id,
    );
  }

  /* ══════════════════════════════════════════════════
     Saved Cards — SetupIntent + management
  ══════════════════════════════════════════════════ */

  /** Create a SetupIntent so the passenger can add a card without charging. */
  @Post('setup-intent')
  @UseGuards(AuthGuard('jwt'))
  async createSetupIntent(@Req() req: any) {
    return this.savedCardsService.createSetupIntent(req.user.id);
  }

  /** List all saved cards for the authenticated passenger. */
  @Get('saved-cards')
  @UseGuards(AuthGuard('jwt'))
  async getSavedCards(@Req() req: any) {
    return this.savedCardsService.getSavedCards(req.user.id);
  }

  /** Remove a saved card from the passenger's Stripe account. */
  @Delete('saved-cards/:pmId')
  @UseGuards(AuthGuard('jwt'))
  async deleteSavedCard(@Param('pmId') pmId: string, @Req() req: any) {
    return this.savedCardsService.deleteSavedCard(req.user.id, pmId);
  }

  /** Set a card as the passenger's default payment method. */
  @Patch('saved-cards/:pmId/default')
  @UseGuards(AuthGuard('jwt'))
  async setDefaultCard(@Param('pmId') pmId: string, @Req() req: any) {
    return this.savedCardsService.setDefaultCard(req.user.id, pmId);
  }

  /* ══════════════════════════════════════════════════
     Stripe Webhook (no auth guard — Stripe calls this)
  ══════════════════════════════════════════════════ */

  @Post('webhook/stripe')
  @HttpCode(200)
  async stripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-03-31.basil' as any,
    });

    const rawBody = req.rawBody;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: any;
    if (webhookSecret) {
      // Production / Stripe CLI mode — verify signature
      try {
        event = stripe.webhooks.constructEvent(rawBody!, signature, webhookSecret);
      } catch (err) {
        this.logger.error(`Stripe webhook verification failed: ${err}`);
        return { received: false };
      }
    } else {
      // Dev mode — no secret configured, skip verification and parse body directly
      this.logger.warn('[DEV] STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
      try {
        event = JSON.parse(rawBody!.toString());
      } catch {
        this.logger.error('Stripe webhook: failed to parse body');
        return { received: false };
      }
    }

    await this.paymentService.handleStripeWebhook(event);
    return { received: true };
  }

  /* ══════════════════════════════════════════════════
     Card — Confirm client-side Stripe PaymentSheet success
  ══════════════════════════════════════════════════ */

  @Post('payments/ride/:rideId/confirm-card-success')
  @UseGuards(AuthGuard('jwt'))
  async confirmCardSuccess(
    @Param('rideId') rideId: string,
    @Req() req: any,
  ) {
    return this.paymentService.confirmCardPaymentSuccess(rideId, req.user.id);
  }



  /* ══════════════════════════════════════════════════
     Invoice / Receipt — download PDF
  ══════════════════════════════════════════════════ */

  @Get('invoices/:rideId')
  @UseGuards(AuthGuard('jwt'))
  async downloadInvoice(
    @Param('rideId') rideId: string,
    @Req() req: any,
    @Res() res: any,
  ) {
    const payment = await this.billingService.findByRideId(rideId);
    if (!payment || !payment.receiptUrl) {
      throw new NotFoundException('Invoice not found for this ride');
    }

    // Authorize: passenger must own the ride
    if (payment.passengerId !== req.user.id && req.user.role !== UserRole.SUPER_ADMIN) {
      throw new NotFoundException('Invoice not found');
    }

    const filePath = payment.receiptUrl.startsWith('/')
      ? payment.receiptUrl.slice(1)
      : payment.receiptUrl;
    const absolutePath = `${process.cwd()}/${filePath}`;

    if (!require('fs').existsSync(absolutePath)) {
      throw new NotFoundException('Invoice file missing');
    }

    const ref = `TR-${rideId.substring(0, 8).toUpperCase()}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="moviroo-receipt-${ref}.pdf"`);
    require('fs').createReadStream(absolutePath).pipe(res);
  }

  /* ══════════════════════════════════════════════════
     Revenue Stats (KPI cards + charts)
  ══════════════════════════════════════════════════ */

  @Get('revenue/stats')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getRevenueStats() {
    return this.billingService.getRevenueStats();
  }

  @Get('revenue/daily')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getDailyRevenue(@Query('days') days?: number) {
    return this.billingService.getDailyRevenue(days ?? 7);
  }

  @Get('revenue/monthly')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getMonthlyRevenue(@Query('months') months?: number) {
    return this.billingService.getMonthlyRevenue(months ?? 7);
  }

  @Get('revenue/by-class')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getRevenueByClass() {
    return this.billingService.getRevenueByClass();
  }

  /* ══════════════════════════════════════════════════
     Commission Tiers CRUD
  ══════════════════════════════════════════════════ */

  @Get('commission-tiers')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getTiers() {
    return this.driverEarningsService.getAllTiers();
  }

  @Post('commission-tiers')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async createTier(@Body() body: { name: string; requiredRides: number; bonusAmount: number; sortOrder?: number }) {
    return this.driverEarningsService.createTier(body);
  }

  @Patch('commission-tiers/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async updateTier(
    @Param('id') id: string,
    @Body() body: Partial<{ name: string; requiredRides: number; bonusAmount: number; sortOrder: number; isActive: boolean }>,
  ) {
    return this.driverEarningsService.updateTier(id, body);
  }

  @Delete('commission-tiers/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async deleteTier(@Param('id') id: string) {
    return this.driverEarningsService.deleteTier(id);
  }

  /* ══════════════════════════════════════════════════
     Driver Earnings (computed on-the-fly)
  ══════════════════════════════════════════════════ */

  @Get('driver-earnings')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getDriverEarnings(@Query() filters: EarningsFilterDto) {
    return this.driverEarningsService.getEarnings(filters);
  }

  /* ══════════════════════════════════════════════════
     Company Profit
  ══════════════════════════════════════════════════ */

  @Get('company-profit')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getCompanyProfit(@Query('month') month?: string) {
    return this.driverEarningsService.getCompanyProfit(month);
  }
}
