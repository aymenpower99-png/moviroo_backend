import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Headers,
  HttpCode,
  Logger,
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
import { DriverEarningsService } from './services/driver-earnings.service';
import {
  PaymentFilterDto,
  TransactionFilterDto,
  EarningsFilterDto,
  RefundDto,
} from './dto/billing.dto';

@Controller('billing')
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly paymentService: PaymentService,
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let event: any;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody!,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET ?? '',
      );
    } catch (err) {
      this.logger.error(`Stripe webhook verification failed: ${err}`);
      return { received: false };
    }

    await this.paymentService.handleStripeWebhook(event);
    return { received: true };
  }

  /* ══════════════════════════════════════════════════
     Cash payment confirmation
  ══════════════════════════════════════════════════ */

  @Patch('payments/:id/confirm-cash')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async confirmCash(@Param('id') tripPaymentId: string) {
    return this.paymentService.confirmCashPayment(tripPaymentId);
  }

  /* ══════════════════════════════════════════════════
     Wallet payment
  ══════════════════════════════════════════════════ */

  @Patch('payments/:id/pay-wallet')
  @UseGuards(AuthGuard('jwt'))
  async payWithWallet(@Param('id') tripPaymentId: string) {
    return this.paymentService.processWalletPayment(tripPaymentId);
  }

  /* ══════════════════════════════════════════════════
     Refund
  ══════════════════════════════════════════════════ */

  @Post('payments/:id/refund')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async refund(@Param('id') tripPaymentId: string, @Body() body: RefundDto) {
    return this.paymentService.processRefund(tripPaymentId, body.reason);
  }

  /* ══════════════════════════════════════════════════
     Transactions
  ══════════════════════════════════════════════════ */

  @Get('transactions')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getTransactions(@Query() filters: TransactionFilterDto) {
    return this.paymentService.getTransactions(filters);
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
     Driver Earnings
  ══════════════════════════════════════════════════ */

  @Get('driver-earnings')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getDriverEarnings(@Query() filters: EarningsFilterDto) {
    return this.driverEarningsService.getEarnings(filters);
  }

  @Post('driver-earnings/calculate')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async calculateEarnings(@Query('month') month?: string) {
    return this.driverEarningsService.calculateMonthlyEarnings(month);
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
