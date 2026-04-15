import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DriverEarning, EarningStatus } from '../entities/driver-earning.entity';
import { TripPayment, PaymentStatus } from '../entities/trip-payment.entity';
import { Driver } from '../../driver/entities/driver.entity';

/* ── Bonus / Penalty config (can be moved to DB later) ── */
const BONUS_PER_TRIP           = 2;     // TND per completed trip
const BONUS_RATING_THRESHOLD   = 4.5;   // rating >= 4.5 → extra bonus
const BONUS_RATING_AMOUNT      = 50;    // flat TND if rating threshold met
const BONUS_HIGH_VOLUME        = 100;   // extra if > HIGH_VOLUME_TRIPS
const HIGH_VOLUME_TRIPS        = 100;
const PENALTY_PER_CANCELLATION = 10;    // TND per cancellation

@Injectable()
export class DriverEarningsService {
  private readonly logger = new Logger(DriverEarningsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(DriverEarning)
    private readonly earningRepo: Repository<DriverEarning>,
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
  ) {}

  /**
   * Calculate earnings for ALL drivers for a given month.
   * Called manually by admin or via a scheduled job at month end.
   */
  async calculateMonthlyEarnings(month?: string): Promise<DriverEarning[]> {
    const targetMonth = month ?? this.currentMonth();
    this.logger.log(`Calculating driver earnings for ${targetMonth}…`);

    const drivers = await this.driverRepo.find();
    const results: DriverEarning[] = [];

    for (const driver of drivers) {
      const earning = await this.calculateForDriver(driver, targetMonth);
      if (earning) results.push(earning);
    }

    this.logger.log(`Calculated earnings for ${results.length} drivers (${targetMonth})`);
    return results;
  }

  /**
   * Calculate earnings for a single driver for a month.
   */
  async calculateForDriver(driver: Driver, month: string): Promise<DriverEarning> {
    /* Check if already calculated */
    let earning = await this.earningRepo.findOne({
      where: { driverId: driver.userId, month },
    });

    /* Count completed PAID trips this month for this driver */
    const [startDate, endDate] = this.monthRange(month);
    const { completedTrips, totalPaid } = await this.getDriverMonthStats(
      driver.userId,
      startDate,
      endDate,
    );

    /* Bonus calculation */
    let bonus = completedTrips * BONUS_PER_TRIP;
    if (driver.ratingAverage >= BONUS_RATING_THRESHOLD) {
      bonus += BONUS_RATING_AMOUNT;
    }
    if (completedTrips >= HIGH_VOLUME_TRIPS) {
      bonus += BONUS_HIGH_VOLUME;
    }

    /* Penalty calculation */
    const penalty = driver.cancellationCount * PENALTY_PER_CANCELLATION;

    /* Net earnings */
    const fixedSalary = Number(driver.fixedMonthlySalary) || 0;
    const net = fixedSalary + bonus - penalty;

    if (earning) {
      /* Update existing record */
      earning.fixedSalary = fixedSalary;
      earning.totalBonuses = bonus;
      earning.totalPenalties = penalty;
      earning.netEarnings = net;
      earning.completedTrips = completedTrips;
      earning.avgRating = driver.ratingAverage;
      earning.cancellationCount = driver.cancellationCount;
      earning.earningStatus = EarningStatus.CALCULATED;
      earning.calculatedAt = new Date();
    } else {
      earning = this.earningRepo.create({
        driverId: driver.userId,
        month,
        fixedSalary,
        totalBonuses: bonus,
        totalPenalties: penalty,
        netEarnings: net,
        completedTrips,
        avgRating: driver.ratingAverage,
        cancellationCount: driver.cancellationCount,
        earningStatus: EarningStatus.CALCULATED,
        calculatedAt: new Date(),
      });
    }

    return this.earningRepo.save(earning);
  }

  /* ── Queries ────────────────────────────────────── */

  async getEarnings(filters?: {
    month?: string;
    driverId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: DriverEarning[]; total: number }> {
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    const qb = this.earningRepo
      .createQueryBuilder('de')
      .orderBy('de.month', 'DESC');

    if (filters?.month) {
      qb.andWhere('de.month = :month', { month: filters.month });
    }
    if (filters?.driverId) {
      qb.andWhere('de.driver_id = :did', { did: filters.driverId });
    }

    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /** Company profit for a month: revenue - driver costs */
  async getCompanyProfit(month?: string): Promise<{
    month: string;
    totalRevenue: number;
    totalDriverCosts: number;
    profit: number;
  }> {
    const targetMonth = month ?? this.currentMonth();
    const [startDate, endDate] = this.monthRange(targetMonth);

    /* Total revenue = sum of all PAID trip payments this month */
    const revenueResult = await this.paymentRepo
      .createQueryBuilder('tp')
      .select('COALESCE(SUM(tp.amount), 0)::numeric', 'revenue')
      .where('tp.payment_status = :paid', { paid: PaymentStatus.PAID })
      .andWhere('tp.paid_at >= :start', { start: startDate })
      .andWhere('tp.paid_at < :end', { end: endDate })
      .getRawOne();

    /* Total driver costs = sum of net earnings for this month */
    const costsResult = await this.earningRepo
      .createQueryBuilder('de')
      .select('COALESCE(SUM(de.net_earnings), 0)::numeric', 'costs')
      .where('de.month = :month', { month: targetMonth })
      .getRawOne();

    const totalRevenue = parseFloat(revenueResult.revenue);
    const totalDriverCosts = parseFloat(costsResult.costs);

    return {
      month: targetMonth,
      totalRevenue,
      totalDriverCosts,
      profit: totalRevenue - totalDriverCosts,
    };
  }

  /* ── Helpers ────────────────────────────────────── */

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private monthRange(month: string): [string, string] {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 1).toISOString();
    return [start, end];
  }

  private async getDriverMonthStats(
    driverUserId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ completedTrips: number; totalPaid: number }> {
    const result = await this.paymentRepo
      .createQueryBuilder('tp')
      .select([
        'COUNT(tp.id)::int AS "completedTrips"',
        'COALESCE(SUM(tp.amount), 0)::numeric AS "totalPaid"',
      ])
      .where('tp.driver_id = :did', { did: driverUserId })
      .andWhere('tp.payment_status = :paid', { paid: PaymentStatus.PAID })
      .andWhere('tp.paid_at >= :start', { start: startDate })
      .andWhere('tp.paid_at < :end', { end: endDate })
      .getRawOne();

    return {
      completedTrips: parseInt(result.completedTrips, 10),
      totalPaid: parseFloat(result.totalPaid),
    };
  }
}
