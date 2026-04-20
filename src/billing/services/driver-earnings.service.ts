import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';

import { CommissionTier } from '../entities/commission-tier.entity';
import { TripPayment, PaymentStatus } from '../entities/trip-payment.entity';
import { Driver } from '../../driver/entities/driver.entity';
import { User } from '../../users/entites/user.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';

@Injectable()
export class DriverEarningsService {
  private readonly logger = new Logger(DriverEarningsService.name);

  constructor(
    @InjectRepository(CommissionTier)
    private readonly tierRepo: Repository<CommissionTier>,
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
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
     Driver Earnings (pure computation — no stored table)
  ══════════════════════════════════════════════════ */

  async getEarnings(filters?: {
    month?: string;
    driverId?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: any[]; total: number }> {
    const targetMonth = filters?.month ?? this.currentMonth();
    const [startDate, endDate] = this.monthRange(targetMonth);
    const page = filters?.page ?? 1;
    const limit = filters?.limit ?? 20;

    // Get active tiers
    const tiers = await this.getTiers();

    // Get drivers (paginated)
    const qb = this.driverRepo.createQueryBuilder('d')
      .leftJoinAndSelect('d.user', 'u');

    if (filters?.driverId) {
      qb.where('d.user_id = :did', { did: filters.driverId });
    }

    const total = await qb.getCount();
    const drivers = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    const data = await Promise.all(
      drivers.map(async (driver) => {
        const salary = Number(driver.fixedMonthlySalary) || 0;

        // Count completed rides from rides table
        const completedRides = await this.rideRepo.count({
          where: {
            driverId: driver.userId,
            status: RideStatus.COMPLETED,
            completedAt: Between(new Date(startDate), new Date(endDate)),
          },
        });

        // Calculate commission from tiers
        let commission = 0;
        for (const t of tiers) {
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
          driverEmail: driver.user?.email ?? null,
          completedTrips: completedRides,
          fixedSalary: salary,
          totalBonuses: Math.round(commission * 100) / 100,
          netEarnings,
        };
      }),
    );

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

    const revenueResult = await this.paymentRepo
      .createQueryBuilder('tp')
      .select('COALESCE(SUM(tp.amount), 0)::numeric', 'revenue')
      .where('tp.payment_status = :paid', { paid: PaymentStatus.PAID })
      .andWhere('tp.paid_at >= :start', { start: startDate })
      .andWhere('tp.paid_at < :end', { end: endDate })
      .getRawOne();

    const totalRevenue = parseFloat(revenueResult.revenue);

    // Compute total driver costs (all salaries + commissions)
    const drivers = await this.driverRepo.find();
    const tiers = await this.getTiers();
    let totalDriverCosts = 0;

    for (const driver of drivers) {
      const salary = Number(driver.fixedMonthlySalary) || 0;
      const completedRides = await this.rideRepo.count({
        where: {
          driverId: driver.userId,
          status: RideStatus.COMPLETED,
          completedAt: Between(new Date(startDate), new Date(endDate)),
        },
      });
      let commission = 0;
      for (const t of tiers) {
        if (completedRides >= t.requiredRides) commission += Number(t.bonusAmount);
      }
      totalDriverCosts += salary + commission;
    }

    return {
      month: targetMonth,
      totalRevenue,
      totalDriverCosts: Math.round(totalDriverCosts * 100) / 100,
      profit: Math.round((totalRevenue - totalDriverCosts) * 100) / 100,
    };
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
}
