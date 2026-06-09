import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Ride } from '../rides/domain/entities/ride.entity';
import { Driver } from '../driver/entities/driver.entity';
import { CommissionTier } from '../billing/entities/commission-tier.entity';
import { CommissionLedger } from '../billing/entities/commission-ledger.entity';
import { DriverOnlineHistory } from './entities/driver-online-history.entity';
import { RideStatus } from '../rides/domain/enums/ride-status.enum';

@Injectable()
export class EarningsService {
  constructor(
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(CommissionTier)
    private readonly tierRepo: Repository<CommissionTier>,
    @InjectRepository(CommissionLedger)
    private readonly ledgerRepo: Repository<CommissionLedger>,
    @InjectRepository(DriverOnlineHistory)
    private readonly onlineHistoryRepo: Repository<DriverOnlineHistory>,
  ) {}

  /**
   * Get earnings for a driver (called from GET /earnings/me).
   * Net = Salary + Σ(unlocked tier bonuses) for the selected month.
   */
  async getDriverEarnings(userId: string, monthStr?: string) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const { startDate, endDate, month } = this.parseMonthRange(monthStr);
    const salary = Number(driver.fixedMonthlySalary) || 0;

    // Count completed rides this month
    const completedRides = await this.rideRepo.count({
      where: {
        driverId: userId,
        status: RideStatus.COMPLETED,
        completedAt: Between(startDate, endDate),
      },
    });

    // Sum unlocked tier bonuses from commission_ledger for this month
    const bonusResult = await this.ledgerRepo
      .createQueryBuilder('cl')
      .select('COALESCE(SUM(cl.amount), 0)', 'bonus')
      .where('cl.driver_id = :uid', { uid: userId })
      .andWhere('cl.period_key = :m', { m: month })
      .getRawOne();
    const commission = Number(bonusResult?.bonus) || 0; // keep key name for response compatibility

    // Get active commission tiers
    const allTiers = await this.tierRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', requiredRides: 'ASC' },
    });

    // Determine current tier reached
    const currentTier = allTiers.reduce(
      (highest, tier) => {
        if (completedRides >= tier.requiredRides) return tier;
        return highest;
      },
      null as CommissionTier | null,
    );

    // Build tier progress list
    const tiers = allTiers.map((t) => ({
      tierId: t.id,
      tierName: t.name,
      requiredRides: t.requiredRides,
      commissionRate: Number(t.commissionRate),
      reached: completedRides >= t.requiredRides,
    }));

    // Next tier
    const unreachedTier = allTiers.find(
      (t) => completedRides < t.requiredRides,
    );
    const nextTier = unreachedTier
      ? {
          name: unreachedTier.name,
          ridesNeeded: unreachedTier.requiredRides - completedRides,
        }
      : null;

    // Net earnings = salary + sum of unlocked bonuses (no ride fares/fees included)
    const netEarnings = Math.round((salary + commission) * 100) / 100;

    // Daily rides breakdown for chart
    const dailyRides = await this.getDailyRides(userId, startDate, endDate);

    // Get online time for the month from driver_online_history
    const onlineHistory = await this.onlineHistoryRepo.findOne({
      where: { driverId: userId, month },
    });
    const onlineTimeMs = onlineHistory?.onlineTimeMs || 0;

    const totalTrips = await this.rideRepo.count({
      where: { driverId: userId, status: RideStatus.COMPLETED },
    });

    return {
      salary,
      commission: Math.round(commission * 100) / 100,
      netEarnings,
      ridesCompleted: completedRides,
      totalTrips,
      currentTier: currentTier
        ? {
            tierId: currentTier.id,
            tierName: currentTier.name,
            commissionRate: Number(currentTier.commissionRate),
          }
        : null,
      tiers,
      nextTier,
      dailyRides,
      onlineTimeMs,
    };
  }

  /**
   * Get earnings for ALL drivers (admin view).
   */
  async getAllDriversEarnings(monthStr?: string, page = 1, limit = 20) {
    const { startDate, endDate } = this.parseMonthRange(monthStr);

    const [drivers, total] = await this.driverRepo.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      relations: ['user'],
    });

    const data = await Promise.all(
      drivers.map(async (driver) => {
        const salary = Number(driver.fixedMonthlySalary) || 0;

        const completedRides = await this.rideRepo.count({
          where: {
            driverId: driver.userId,
            status: RideStatus.COMPLETED,
            completedAt: Between(startDate, endDate),
          },
        });

        const commissionResult = await this.rideRepo
          .createQueryBuilder('r')
          .select('COALESCE(SUM(r.driver_earnings), 0)', 'commission')
          .where('r.driver_id = :uid', { uid: driver.userId })
          .andWhere('r.status = :status', { status: RideStatus.COMPLETED })
          .andWhere('r.completed_at >= :start', { start: startDate })
          .andWhere('r.completed_at <= :end', { end: endDate })
          .getRawOne();
        const commission = Number(commissionResult?.commission) || 0;

        const totalTrips = await this.rideRepo.count({
          where: { driverId: driver.userId, status: RideStatus.COMPLETED },
        });

        const netEarnings = Math.round((salary + commission) * 100) / 100;
        const userName = driver.user
          ? `${driver.user.firstName ?? ''} ${driver.user.lastName ?? ''}`.trim()
          : 'Unknown';

        return {
          driverProfileId: driver.id,
          driverId: driver.userId,
          driverName: userName,
          ridesCompleted: completedRides,
          totalTrips,
          salary,
          commission: Math.round(commission * 100) / 100,
          netEarnings,
        };
      }),
    );

    return { data, total };
  }

  /**
   * No-op trackAttendance (kept for backward compatibility with DriverAvailabilityService).
   * We no longer track attendance — earnings are purely salary + commission.
   */
  async trackAttendance(_userId: string): Promise<void> {
    // No-op: attendance tracking removed
  }

  /* ── Helpers ── */

  private parseMonthRange(monthStr?: string): {
    startDate: Date;
    endDate: Date;
    month: string;
  } {
    let year: number, month: number;
    if (monthStr) {
      const [y, m] = monthStr.split('-').map(Number);
      if (y && m) {
        year = y;
        month = m;
      } else {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth() + 1;
      }
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    // Use UTC boundaries so the comparison is consistent with
    // PostgreSQL `completed_at` (timestamptz) regardless of the
    // server's local timezone.
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const monthStrFormatted = `${year}-${month.toString().padStart(2, '0')}`;
    return { startDate, endDate, month: monthStrFormatted };
  }

  private async getDailyRides(userId: string, startDate: Date, endDate: Date) {
    const rides = await this.rideRepo
      .createQueryBuilder('r')
      .select("TO_CHAR(r.completed_at, 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)::int', 'rides')
      .where('r.driver_id = :uid', { uid: userId })
      .andWhere('r.status = :status', { status: RideStatus.COMPLETED })
      .andWhere('r.completed_at >= :start', { start: startDate })
      .andWhere('r.completed_at <= :end', { end: endDate })
      .groupBy("TO_CHAR(r.completed_at, 'YYYY-MM-DD')")
      .orderBy('day', 'ASC')
      .getRawMany();

    return rides.map((r) => ({ day: r.day, rides: r.rides }));
  }
}
