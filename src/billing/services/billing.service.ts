import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TripPayment, PaymentStatus, PaymentMethod } from '../entities/trip-payment.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
  ) {}

  /**
   * Called automatically when a trip completes.
   * For CASH: immediately marks PAID (driver collected cash at trip end).
   * For CARD: leaves status as-is (should already be PAID from Stripe).
   */
  async createTripPayment(ride: Ride): Promise<TripPayment> {
    const existing = await this.paymentRepo.findOne({ where: { rideId: ride.id } });
    if (existing) {
      existing.driverId = ride.driverId ?? existing.driverId;
      existing.amount = ride.priceFinal ?? ride.priceEstimate ?? existing.amount;
      if (existing.paymentMethod === PaymentMethod.CASH && existing.paymentStatus !== PaymentStatus.PAID) {
        existing.paymentStatus = PaymentStatus.PAID;
        existing.paidAt = new Date();
      }
      return this.paymentRepo.save(existing);
    }

    const amount = ride.priceFinal ?? ride.priceEstimate ?? 0;
    const isCash = ride.paymentMethod?.toUpperCase() === 'CASH';

    const payment = this.paymentRepo.create({
      rideId: ride.id,
      passengerId: ride.passengerId,
      driverId: ride.driverId,
      amount,
      paymentMethod: isCash ? PaymentMethod.CASH : null,
      paymentStatus: isCash ? PaymentStatus.PAID : PaymentStatus.PENDING,
      paidAt: isCash ? new Date() : null,
    });

    const saved = await this.paymentRepo.save(payment);
    this.logger.log(
      `TripPayment ${saved.id} created for ride ${ride.id} — ${amount} TND (${isCash ? 'PAID/CASH' : 'PENDING'})`,
    );
    return saved;
  }

  /* ── Queries ────────────────────────────────────── */

  async findAll(filters?: {
    status?: PaymentStatus;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: TripPayment[]; total: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    const qb = this.paymentRepo
      .createQueryBuilder('tp')
      .leftJoinAndSelect('tp.ride', 'ride')
      .orderBy('tp.createdAt', 'DESC');

    if (filters?.status) {
      qb.andWhere('tp.payment_status = :status', { status: filters.status });
    }
    if (filters?.dateFrom) {
      qb.andWhere('tp.created_at >= :from', { from: filters.dateFrom });
    }
    if (filters?.dateTo) {
      qb.andWhere('tp.created_at <= :to', { to: filters.dateTo });
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }



  async findByRideId(rideId: string): Promise<TripPayment | null> {
    return this.paymentRepo.findOne({
      where: { rideId },
      relations: ['ride'],
    });
  }

  async findById(id: string): Promise<TripPayment | null> {
    return this.paymentRepo.findOne({
      where: { id },
      relations: ['ride'],
    });
  }

  /** KPI: revenue stats (financial view only — excludes PENDING and cancelled cash) */
  async getRevenueStats(): Promise<{
    totalEarnings: number;
    paidRevenue: number;
    refundedAmount: number;
    totalTrips: number;
  }> {
    const result = await this.paymentRepo
      .createQueryBuilder('tp')
      .leftJoin('tp.ride', 'ride')
      .select([
        'COALESCE(SUM(tp.amount), 0) AS "totalEarnings"',
        'COALESCE(SUM(CASE WHEN tp.payment_status = :paid THEN tp.amount ELSE 0 END), 0) AS "paidRevenue"',
        'COALESCE(SUM(CASE WHEN tp.payment_status = :refunded THEN tp.amount ELSE 0 END), 0) AS "refundedAmount"',
        'COUNT(tp.id)::int AS "totalTrips"',
      ])
      .where('tp.payment_status IN (:...statuses)', { statuses: [PaymentStatus.PAID, PaymentStatus.REFUNDED] })
      .andWhere('(tp.payment_method != :cash OR ride.status != :cancelled)', { cash: PaymentMethod.CASH, cancelled: 'CANCELLED' })
      .setParameters({
        paid: PaymentStatus.PAID,
        refunded: PaymentStatus.REFUNDED,
      })
      .getRawOne();

    return {
      totalEarnings: parseFloat(result.totalEarnings),
      paidRevenue: parseFloat(result.paidRevenue),
      refundedAmount: parseFloat(result.refundedAmount),
      totalTrips: parseInt(result.totalTrips, 10),
    };
  }

  /** Daily earnings chart data */
  async getDailyRevenue(days = 7): Promise<{ day: string; earnings: number }[]> {
    const rows = await this.paymentRepo.query(
      `SELECT
         TO_CHAR(tp.paid_at, 'Dy') AS day,
         TO_CHAR(tp.paid_at, 'YYYY-MM-DD') AS date,
         COALESCE(SUM(tp.amount), 0)::numeric AS earnings
       FROM trip_payments tp
       WHERE tp.payment_status = 'PAID'
         AND tp.paid_at >= NOW() - INTERVAL '${days} days'
       GROUP BY date, day
       ORDER BY date`,
    );

    return rows.map((r: any) => ({
      day: r.day,
      earnings: parseFloat(r.earnings),
    }));
  }

  /** Monthly earnings chart data */
  async getMonthlyRevenue(months = 7): Promise<{ month: string; earnings: number }[]> {
    const rows = await this.paymentRepo.query(
      `SELECT
         TO_CHAR(tp.paid_at, 'Mon') AS month,
         TO_CHAR(tp.paid_at, 'YYYY-MM') AS ym,
         COALESCE(SUM(tp.amount), 0)::numeric AS earnings
       FROM trip_payments tp
       WHERE tp.payment_status = 'PAID'
         AND tp.paid_at >= NOW() - INTERVAL '${months} months'
       GROUP BY ym, month
       ORDER BY ym`,
    );

    return rows.map((r: any) => ({
      month: r.month,
      earnings: parseFloat(r.earnings),
    }));
  }

  /** Revenue by vehicle class */
  async getRevenueByClass(): Promise<{ className: string; revenue: number }[]> {
    const rows = await this.paymentRepo.query(
      `SELECT
         vc.name AS "className",
         COALESCE(SUM(tp.amount), 0)::numeric AS revenue
       FROM trip_payments tp
       JOIN rides r ON r.id = tp.ride_id
       JOIN classes vc ON vc.id = r.class_id
       WHERE tp.payment_status = 'PAID'
       GROUP BY vc.name
       ORDER BY revenue DESC`,
    );

    return rows.map((r: any) => ({
      className: r.className,
      revenue: parseFloat(r.revenue),
    }));
  }
}
