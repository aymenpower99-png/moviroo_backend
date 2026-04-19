import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { MonthlyEarnings } from './entities/monthly-earnings.entity';
import { EarningsConfig } from './entities/earnings-config.entity';
import { Ride } from '../rides/domain/entities/ride.entity';
import { Driver } from '../driver/entities/driver.entity';
import { CommissionTier } from '../billing/entities/commission-tier.entity';
import { RideStatus } from '../rides/domain/enums/ride-status.enum';

@Injectable()
export class EarningsService {
  constructor(
    @InjectRepository(MonthlyEarnings)
    private readonly earningsRepo: Repository<MonthlyEarnings>,
    @InjectRepository(EarningsConfig)
    private readonly configRepo: Repository<EarningsConfig>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(CommissionTier)
    private readonly tierRepo: Repository<CommissionTier>,
  ) {}

  // ── Get active config ──
  async getConfig(): Promise<EarningsConfig> {
    const config = await this.configRepo.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
    if (!config) {
      return this.configRepo.save(
        this.configRepo.create({
          baseSalary: 3000,
          expectedWorkDays: 22,
          ridesThreshold: 100,
          commissionPerRide: 2,
        }),
      );
    }
    return config;
  }

  // ── Update config (admin) ──
  async updateConfig(dto: Partial<EarningsConfig>): Promise<EarningsConfig> {
    const config = await this.getConfig();
    Object.assign(config, dto);
    return this.configRepo.save(config);
  }

  // ── Get or create monthly earnings for a driver ──
  async getOrCreateMonthly(driverId: string, year: number, month: number): Promise<MonthlyEarnings> {
    let record = await this.earningsRepo.findOne({ where: { driverId, year, month } });
    if (!record) {
      const config = await this.getConfig();
      const driver = await this.driverRepo.findOne({ where: { id: driverId } });
      const baseSalary =
        driver?.fixedMonthlySalary && Number(driver.fixedMonthlySalary) > 0
          ? Number(driver.fixedMonthlySalary)
          : Number(config.baseSalary);

      record = this.earningsRepo.create({
        driverId,
        year,
        month,
        baseSalary,
        expectedWorkDays: config.expectedWorkDays,
        ridesThreshold: config.ridesThreshold,
        commissionPerRide: config.commissionPerRide,
      });
      record = await this.earningsRepo.save(record);
    }
    return record;
  }

  // ── Get all active commission tiers ──
  private async getActiveTiers(): Promise<CommissionTier[]> {
    return this.tierRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', requiredRides: 'ASC' },
    });
  }

  // ── Calculate tier-based commission ──
  private calculateTierCommission(
    completedRides: number,
    tiers: CommissionTier[],
  ): {
    commission: number;
    breakdown: { tierId: string; tierName: string; requiredRides: number; bonusAmount: number; reached: boolean }[];
    nextTier: { name: string; requiredRides: number; ridesNeeded: number } | null;
  } {
    let commission = 0;
    const breakdown = tiers.map((t) => {
      const reached = completedRides >= t.requiredRides;
      if (reached) commission += Number(t.bonusAmount);
      return { tierId: t.id, tierName: t.name, requiredRides: t.requiredRides, bonusAmount: Number(t.bonusAmount), reached };
    });

    const unreached = tiers.find((t) => completedRides < t.requiredRides);
    const nextTier = unreached
      ? { name: unreached.name, requiredRides: unreached.requiredRides, ridesNeeded: unreached.requiredRides - completedRides }
      : null;

    return { commission: Math.round(commission * 100) / 100, breakdown, nextTier };
  }

  // ── Recalculate earnings for a driver's month ──
  async recalculate(driverId: string, year: number, month: number): Promise<MonthlyEarnings> {
    const record = await this.getOrCreateMonthly(driverId, year, month);

    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver not found');

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const completedRides = await this.rideRepo.count({
      where: { driverId: driver.userId, status: RideStatus.COMPLETED, completedAt: Between(startDate, endDate) },
    });

    const cancelledRides = await this.rideRepo.count({
      where: { driverId: driver.userId, status: RideStatus.CANCELLED, cancelledAt: Between(startDate, endDate) },
    });

    const acceptedRides = completedRides + cancelledRides;

    const attendance = (record.attendanceDays ?? []).length;
    const missedDays = Math.max(0, record.expectedWorkDays - attendance);
    const dailyRate = Number(record.baseSalary) / record.expectedWorkDays;
    const deductionAmount = Math.round(missedDays * dailyRate * 100) / 100;

    // Tier-based commission (preferred) with fallback to threshold model
    const allTiers = await this.getActiveTiers();
    let commission: number;
    if (allTiers.length > 0) {
      const result = this.calculateTierCommission(completedRides, allTiers);
      commission = result.commission;
    } else {
      // Fallback: single threshold model
      commission = 0;
      if (completedRides > record.ridesThreshold) {
        const extra = completedRides - record.ridesThreshold;
        commission = Math.round(extra * Number(record.commissionPerRide) * 100) / 100;
      }
    }

    const totalEarnings = Math.round((Number(record.baseSalary) - deductionAmount + commission) * 100) / 100;

    const weeklyBreakdown = await this.calculateWeeklyBreakdown(year, month, Number(record.baseSalary), driver.userId);

    record.ridesCompleted = completedRides;
    record.ridesAccepted = acceptedRides;
    record.ridesCancelled = cancelledRides;
    record.attendance = attendance;
    record.missedDays = missedDays;
    record.deductionAmount = deductionAmount;
    record.commission = commission;
    record.totalEarnings = totalEarnings;
    record.weeklyBreakdown = weeklyBreakdown;

    return this.earningsRepo.save(record);
  }

  private async calculateWeeklyBreakdown(
    year: number,
    month: number,
    baseSalary: number,
    userId: string,
  ): Promise<{ week: number; salary: number; commission: number; rides: number }[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const weeks: { start: Date; end: Date; num: number }[] = [];
    let weekStart = new Date(startDate);
    let weekNum = 1;

    while (weekStart <= endDate) {
      const weekEnd = new Date(weekStart);
      const daysToSunday = 7 - weekStart.getDay();
      weekEnd.setDate(weekStart.getDate() + (daysToSunday === 7 ? 6 : daysToSunday));
      if (weekEnd > endDate) weekEnd.setTime(endDate.getTime());
      weekEnd.setHours(23, 59, 59, 999);

      weeks.push({ start: new Date(weekStart), end: new Date(weekEnd), num: weekNum });
      weekNum++;
      weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() + 1);
      weekStart.setHours(0, 0, 0, 0);
    }

    const salaryPerWeek = Math.round((baseSalary / weeks.length) * 100) / 100;
    const result: { week: number; salary: number; commission: number; rides: number }[] = [];

    for (const w of weeks) {
      const rides = await this.rideRepo.count({
        where: { driverId: userId, status: RideStatus.COMPLETED, completedAt: Between(w.start, w.end) },
      });
      result.push({ week: w.num, salary: salaryPerWeek, commission: 0, rides });
    }

    return result;
  }

  // ── Track attendance when driver goes online ──
  async trackAttendance(userId: string): Promise<void> {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const today = now.toISOString().substring(0, 10);

    const record = await this.getOrCreateMonthly(driver.id, year, month);
    const days = record.attendanceDays ?? [];
    if (!days.includes(today)) {
      record.attendanceDays = [...days, today];
      await this.earningsRepo.save(record);
    }
  }

  // ── Get driver's earnings by userId ──
  async getDriverEarningsByUserId(userId: string, year: number, month: number) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver profile not found');
    return this.getDriverEarnings(driver.id, year, month);
  }

  // ── Get driver's earnings for a specific month ──
  async getDriverEarnings(driverId: string, year: number, month: number) {
    const record = await this.recalculate(driverId, year, month);

    // Build tier breakdown for response
    const allTiers = await this.getActiveTiers();
    const { breakdown: tiers, nextTier } = this.calculateTierCommission(record.ridesCompleted, allTiers);

    const ridesLeftForCommission = nextTier?.ridesNeeded ?? 0;

    return {
      baseSalary: Number(record.baseSalary),
      commission: Number(record.commission),
      deductions: {
        missedDays: record.missedDays,
        amount: Number(record.deductionAmount),
      },
      total: Number(record.totalEarnings),
      stats: {
        expectedWorkDays: record.expectedWorkDays,
        attendance: record.attendance,
        ridesCompleted: record.ridesCompleted,
        ridesAccepted: record.ridesAccepted,
        ridesCancelled: record.ridesCancelled,
        ridesThreshold: record.ridesThreshold,
        ridesLeftForCommission,
      },
      tiers,
      nextTier,
      weekly: record.weeklyBreakdown,
    };
  }

  // ── Admin: get any driver's earnings ──
  async adminGetDriverEarnings(driverId: string, year: number, month: number) {
    return this.getDriverEarnings(driverId, year, month);
  }

  // ── Admin: list all driver earnings for a month ──
  async adminListMonthly(year: number, month: number) {
    return this.earningsRepo.find({
      where: { year, month },
      order: { totalEarnings: 'DESC' },
    });
  }
}

