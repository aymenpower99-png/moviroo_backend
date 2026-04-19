import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DriverEarning, EarningStatus } from '../entities/driver-earning.entity';
import { CommissionTier } from '../entities/commission-tier.entity';
import { TripPayment, PaymentStatus } from '../entities/trip-payment.entity';
import { Driver } from '../../driver/entities/driver.entity';
import { User } from '../../users/entites/user.entity';

/** Fixed monthly working days — hard rule */
const WORK_DAYS_PER_MONTH = 22;

/** Penalty per cancellation (TND) */
const PENALTY_PER_CANCELLATION = 10;

@Injectable()
export class DriverEarningsService {
  private readonly logger = new Logger(DriverEarningsService.name);

  constructor(
    @InjectRepository(DriverEarning)
    private readonly earningRepo: Repository<DriverEarning>,
    @InjectRepository(CommissionTier)
    private readonly tierRepo: Repository<CommissionTier>,
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /* ══════════════════════════════════════════════════
     Commission Tiers CRUD
  ══════════════════════════════════════════════════ */

  async getTiers(): Promise<CommissionTier[]> {
    return this.tierRepo.find({ where: { isActive: true }, order: { sortOrder: 'ASC' } });
  }

  async getAllTiers(): Promise<CommissionTier[]> {
    return this.tierRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async createTier(dto: { name: string; requiredRides: number; bonusAmount: number; sortOrder?: number }): Promise<CommissionTier> {
    const tier = this.tierRepo.create({
      name: dto.name,
      requiredRides: dto.requiredRides,
      bonusAmount: dto.bonusAmount,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.tierRepo.save(tier);
  }

  async updateTier(id: string, dto: Partial<{ name: string; requiredRides: number; bonusAmount: number; sortOrder: number; isActive: boolean }>): Promise<CommissionTier> {
    await this.tierRepo.update(id, dto);
    return this.tierRepo.findOneOrFail({ where: { id } });
  }

  async deleteTier(id: string): Promise<{ message: string }> {
    await this.tierRepo.delete(id);
    return { message: 'Tier deleted' };
  }

  /* ══════════════════════════════════════════════════
     Real-time earnings calculation
  ══════════════════════════════════════════════════ */

  /**
   * Recalculate earnings for ALL drivers for the current month.
   * Called automatically on every GET request (real-time).
   */
  async recalculateCurrentMonth(): Promise<void> {
    const month = this.currentMonth();
    const drivers = await this.driverRepo.find();
    for (const driver of drivers) {
      await this.recalculateForDriver(driver, month);
    }
  }

  /**
   * Recalculate earnings for a single driver for a specific month.
   * This is the core calculation engine.
   */
  async recalculateForDriver(driver: Driver, month: string): Promise<DriverEarning> {
    let earning = await this.earningRepo.findOne({
      where: { driverId: driver.userId, month },
    });

    // Don't recalculate locked/paid months
    if (earning && (earning.earningStatus === EarningStatus.LOCKED || earning.earningStatus === EarningStatus.PAID)) {
      return earning;
    }

    const [startDate, endDate] = this.monthRange(month);

    // Get trip stats
    const { completedTrips, totalPaid } = await this.getDriverMonthStats(driver.userId, startDate, endDate);

    // Get cancellation count for this month specifically
    const cancellationCount = await this.getMonthCancellations(driver.userId, startDate, endDate);

    // Get active commission tiers
    const tiers = await this.getTiers();

    // Calculate commission bonuses from tiers
    const commissionBreakdown = tiers.map(t => ({
      tierId: t.id,
      tierName: t.name,
      requiredRides: t.requiredRides,
      bonusAmount: t.bonusAmount,
      reached: completedTrips >= t.requiredRides,
    }));
    const totalBonuses = commissionBreakdown
      .filter(t => t.reached)
      .reduce((sum, t) => sum + t.bonusAmount, 0);

    // Penalties
    const totalPenalties = cancellationCount * PENALTY_PER_CANCELLATION;

    // Salary & attendance
    const fixedSalary = Number(driver.fixedMonthlySalary) || 0;
    const attendanceDaysStr = earning?.attendanceDays || '';
    const attendanceDaysArr = attendanceDaysStr ? attendanceDaysStr.split(',').filter(Boolean) : [];
    const attendance = attendanceDaysArr.length;
    const missedDays = Math.max(0, WORK_DAYS_PER_MONTH - attendance);
    const dailyRate = WORK_DAYS_PER_MONTH > 0 ? fixedSalary / WORK_DAYS_PER_MONTH : 0;
    const deductionAmount = Math.round(missedDays * dailyRate * 100) / 100;

    // Net earnings = salary - deductions + bonuses - penalties
    const netEarnings = Math.round((fixedSalary - deductionAmount + totalBonuses - totalPenalties) * 100) / 100;

    if (earning) {
      earning.fixedSalary = fixedSalary;
      earning.totalBonuses = totalBonuses;
      earning.totalPenalties = totalPenalties;
      earning.netEarnings = netEarnings;
      earning.completedTrips = completedTrips;
      earning.avgRating = Number(driver.ratingAverage) || 0;
      earning.cancellationCount = cancellationCount;
      earning.attendance = attendance;
      earning.missedDays = missedDays;
      earning.deductionAmount = deductionAmount;
      earning.commissionBreakdown = commissionBreakdown;
      earning.earningStatus = EarningStatus.CALCULATED;
      earning.calculatedAt = new Date();
    } else {
      earning = this.earningRepo.create({
        driverId: driver.userId,
        month,
        fixedSalary,
        totalBonuses,
        totalPenalties,
        netEarnings,
        completedTrips,
        avgRating: Number(driver.ratingAverage) || 0,
        cancellationCount,
        attendance,
        missedDays,
        deductionAmount,
        attendanceDays: attendanceDaysStr,
        commissionBreakdown,
        earningStatus: EarningStatus.CALCULATED,
        calculatedAt: new Date(),
      });
    }

    return this.earningRepo.save(earning);
  }

  /* ══════════════════════════════════════════════════
     Queries (with auto-recalculate for current month)
  ══════════════════════════════════════════════════ */

  async getEarnings(filters?: {
    month?: string;
    driverId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number }> {
    const targetMonth = filters?.month ?? this.currentMonth();
    const isCurrentMonth = targetMonth === this.currentMonth();

    // Auto-recalculate current month before returning
    if (isCurrentMonth) {
      if (filters?.driverId) {
        const driver = await this.driverRepo.findOne({ where: { userId: filters.driverId } });
        if (driver) await this.recalculateForDriver(driver, targetMonth);
      } else {
        await this.recalculateCurrentMonth();
      }
    }

    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    const qb = this.earningRepo
      .createQueryBuilder('de')
      .where('de.month = :month', { month: targetMonth })
      .orderBy('de.net_earnings', 'DESC');

    if (filters?.driverId) {
      qb.andWhere('de.driver_id = :did', { did: filters.driverId });
    }

    qb.skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();

    // Enrich with driver name + driver profile id
    const enriched = await Promise.all(
      data.map(async (de) => {
        const [user, driverProfile] = await Promise.all([
          this.userRepo.findOne({
            where: { id: de.driverId },
            select: ['id', 'firstName', 'lastName', 'email'],
          }),
          this.driverRepo.findOne({
            where: { userId: de.driverId },
            select: ['id'],
          }),
        ]);
        return {
          ...de,
          driverProfileId: driverProfile?.id ?? null,
          driverName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : 'Unknown',
          driverEmail: user?.email ?? null,
        };
      }),
    );

    return { data: enriched, total };
  }

  /** Lock all earnings for a past month (prevents recalculation) */
  async lockMonth(month: string): Promise<{ locked: number }> {
    const result = await this.earningRepo.update(
      { month, earningStatus: EarningStatus.CALCULATED },
      { earningStatus: EarningStatus.LOCKED },
    );
    return { locked: result.affected ?? 0 };
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

    const revenueResult = await this.paymentRepo
      .createQueryBuilder('tp')
      .select('COALESCE(SUM(tp.amount), 0)::numeric', 'revenue')
      .where('tp.payment_status = :paid', { paid: PaymentStatus.PAID })
      .andWhere('tp.paid_at >= :start', { start: startDate })
      .andWhere('tp.paid_at < :end', { end: endDate })
      .getRawOne();

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

  /** Track driver attendance (called when driver goes online) */
  async trackAttendance(driverUserId: string): Promise<void> {
    const month = this.currentMonth();
    const today = new Date().toISOString().substring(0, 10);

    let earning = await this.earningRepo.findOne({
      where: { driverId: driverUserId, month },
    });

    if (!earning) {
      const driver = await this.driverRepo.findOne({ where: { userId: driverUserId } });
      const fixedSalary = driver ? Number(driver.fixedMonthlySalary) || 0 : 0;
      earning = this.earningRepo.create({
        driverId: driverUserId,
        month,
        fixedSalary,
        attendanceDays: today,
        attendance: 1,
        missedDays: WORK_DAYS_PER_MONTH - 1,
      });
      await this.earningRepo.save(earning);
      return;
    }

    const days = earning.attendanceDays ? earning.attendanceDays.split(',').filter(Boolean) : [];
    if (!days.includes(today)) {
      days.push(today);
      earning.attendanceDays = days.join(',');
      earning.attendance = days.length;
      earning.missedDays = Math.max(0, WORK_DAYS_PER_MONTH - days.length);
      await this.earningRepo.save(earning);
    }
  }

  /* ══════════════════════════════════════════════════
     Helpers
  ══════════════════════════════════════════════════ */

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

  private async getMonthCancellations(
    driverUserId: string,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    // Count rides cancelled by this driver in this month
    try {
      const result = await this.paymentRepo.manager.query(
        `SELECT COUNT(*)::int AS cnt FROM rides
         WHERE driver_id = $1
         AND status = 'cancelled'
         AND cancelled_at >= $2
         AND cancelled_at < $3`,
        [driverUserId, startDate, endDate],
      );
      return result[0]?.cnt ?? 0;
    } catch {
      return 0;
    }
  }
}

