import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Ride } from '../rides/domain/entities/ride.entity';
import { Driver } from '../driver/entities/driver.entity';
import { CommissionTier } from '../billing/entities/commission-tier.entity';
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
  ) {}

  /**
   * Get earnings for a driver (called from GET /earnings/me).
   * Pure computation — no stored earnings tables.
   */
  async getDriverEarnings(userId: string, monthStr?: string) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');

    const { startDate, endDate } = this.parseMonthRange(monthStr);
    const salary = Number(driver.fixedMonthlySalary) || 0;

    // Count completed rides this month
    const completedRides = await this.rideRepo.count({
      where: {
        driverId: userId,
        status: RideStatus.COMPLETED,
        completedAt: Between(startDate, endDate),
      },
    });

    // Get active commission tiers
    const allTiers = await this.tierRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', requiredRides: 'ASC' },
    });

    // Calculate commission from tiers
    let commission = 0;
    const tiers = allTiers.map((t) => {
      const reached = completedRides >= t.requiredRides;
      if (reached) commission += Number(t.bonusAmount);
      return {
        tierId: t.id,
        tierName: t.name,
        requiredRides: t.requiredRides,
        bonusAmount: Number(t.bonusAmount),
        reached,
      };
    });

    // Next tier
    const unreachedTier = allTiers.find((t) => completedRides < t.requiredRides);
    const nextTier = unreachedTier
      ? { name: unreachedTier.name, ridesNeeded: unreachedTier.requiredRides - completedRides }
      : null;

    // Net earnings = salary + commission
    const netEarnings = Math.round((salary + commission) * 100) / 100;

    // Daily rides breakdown for chart
    const dailyRides = await this.getDailyRides(userId, startDate, endDate);

    return {
      salary,
      commission: Math.round(commission * 100) / 100,
      netEarnings,
      ridesCompleted: completedRides,
      tiers,
      nextTier,
      dailyRides,
    };
  }

  /**
   * Get earnings for ALL drivers (admin view).
   */
  async getAllDriversEarnings(monthStr?: string, page = 1, limit = 20) {
    const { startDate, endDate } = this.parseMonthRange(monthStr);
    const allTiers = await this.tierRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', requiredRides: 'ASC' },
    });

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

        let commission = 0;
        for (const t of allTiers) {
          if (completedRides >= t.requiredRides) {
            commission += Number(t.bonusAmount);
          }
        }

        const netEarnings = Math.round((salary + commission) * 100) / 100;
        const userName = driver.user
          ? `${driver.user.firstName ?? ''} ${driver.user.lastName ?? ''}`.trim()
          : 'Unknown';

        return {
          driverProfileId: driver.id,
          driverId: driver.userId,
          driverName: userName,
          ridesCompleted: completedRides,
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

  private parseMonthRange(monthStr?: string): { startDate: Date; endDate: Date } {
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
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    return { startDate, endDate };
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

