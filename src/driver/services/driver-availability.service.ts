import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../entities/driver.entity';
import { Vehicle, VehicleStatus } from '../../vehicles/entities/vehicle.entity';
import { EarningsService } from '../../earnings/earnings.service';
import { DriverOnlineHistory } from '../../earnings/entities/driver-online-history.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';

@Injectable()
export class DriverAvailabilityService {
  private readonly logger = new Logger(DriverAvailabilityService.name);

  constructor(
    @InjectRepository(Driver) private driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
    @InjectRepository(DriverOnlineHistory)
    private onlineHistoryRepo: Repository<DriverOnlineHistory>,
    @InjectRepository(Ride) private rideRepo: Repository<Ride>,
    private readonly earningsService: EarningsService,
  ) {}

  // ─── Driver: Toggle online / offline ─────────────────────────────────────────

  async setMyAvailability(
    userId: string,
    status: DriverAvailabilityStatus.ONLINE | DriverAvailabilityStatus.OFFLINE,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver)
      throw new NotFoundException(
        'Driver profile not found. Please complete your profile first.',
      );

    if (driver.availabilityStatus === DriverAvailabilityStatus.PENDING)
      throw new ForbiddenException(
        'You must activate your account before changing availability.',
      );

    if (driver.availabilityStatus === DriverAvailabilityStatus.SETUP_REQUIRED)
      throw new ForbiddenException(
        'You must add a vehicle and work area before going online.',
      );

    // If going ONLINE, verify vehicle is still AVAILABLE
    if (status === DriverAvailabilityStatus.ONLINE) {
      const vehicle = await this.vehicleRepo.findOne({
        where: { driverId: driver.id },
      });
      if (!vehicle || vehicle.status !== VehicleStatus.AVAILABLE) {
        throw new ForbiddenException(
          'Your vehicle is not available. Please contact your administrator.',
        );
      }
      if (!driver.workAreaId) {
        throw new ForbiddenException(
          'No work area assigned. Please contact your administrator.',
        );
      }
    }

    // If going OFFLINE, check for active rides first
    if (status === DriverAvailabilityStatus.OFFLINE) {
      const activeRide = await this.rideRepo.findOne({
        where: {
          driverId: driver.id, // Use driver.id (User UUID) not userId
          status: In([
            RideStatus.ASSIGNED,
            RideStatus.EN_ROUTE_TO_PICKUP,
            RideStatus.ARRIVED,
            RideStatus.IN_TRIP,
          ]),
        },
      });
      if (activeRide) {
        this.logger.error(
          `[DRIVER_AVAILABILITY] Driver ${userId} cannot go offline - has active ride ${activeRide.id} with status ${activeRide.status}`,
        );
        throw new ForbiddenException(
          'You are currently in a trip and cannot go offline.',
        );
      } else {
        this.logger.log(
          `[DRIVER_AVAILABILITY] Driver ${userId} has no active rides - allowing offline`,
        );
      }
    }

    const currentMonth = this._currentMonth();

    if (status === DriverAvailabilityStatus.ONLINE) {
      // Going ONLINE — set onlineSince to now.
      // Use atomic conditional update so we don't reset onlineSince if the driver
      // is already online (which would lose accumulated session time).
      await this.driverRepo
        .createQueryBuilder()
        .update(Driver)
        .set({
          availabilityStatus: DriverAvailabilityStatus.ONLINE,
          onlineSince: () => 'COALESCE(online_since, NOW())',
        })
        .where('user_id = :userId', { userId })
        .execute();
    } else {
      // Going OFFLINE — use a transaction with row-level lock to atomically
      // read the current onlineSince, clear it, and accumulate the delta.
      // Pessimistic_write lock ensures concurrent callers block until we commit,
      // and by then onlineSince is already null so they skip accumulation.
      await this.driverRepo.manager.transaction(async (tx) => {
        const locked = await tx
          .createQueryBuilder(Driver, 'd')
          .setLock('pessimistic_write')
          .where('d.user_id = :userId', { userId })
          .getOne();

        if (!locked) return;

        if (!locked.onlineSince) {
          // Already offline (race lost, or was never online) — just ensure status flag.
          await tx.update(
            Driver,
            { userId },
            { availabilityStatus: DriverAvailabilityStatus.OFFLINE },
          );
          return;
        }

        const prevOnlineSince = locked.onlineSince;

        // Clear onlineSince and set status to OFFLINE atomically within the lock.
        await tx.update(
          Driver,
          { userId },
          {
            availabilityStatus: DriverAvailabilityStatus.OFFLINE,
            onlineSince: null,
          },
        );

        const deltaMs = Date.now() - new Date(prevOnlineSince).getTime();

        if (deltaMs < 0 || deltaMs > 24 * 60 * 60 * 1000) {
          this.logger.warn(
            `[DRIVER_AVAILABILITY] Suspicious deltaMs for driver ${userId}: ${deltaMs}ms. Skipping accumulation.`,
          );
          return;
        }

        // Accumulate inside the same transaction so it rolls back on error.
        await this._accumulateSessionTimeTx(
          tx.getRepository(DriverOnlineHistory),
          userId,
          currentMonth,
          deltaMs,
        );
      });
    }

    const saved = await this.driverRepo.findOne({ where: { userId } });

    if (status === DriverAvailabilityStatus.ONLINE) {
      await this.earningsService.trackAttendance(userId);
    }

    return saved!;
  }

  // ─── Internal: PENDING → SETUP_REQUIRED (called on account activation) ────────

  async markSetupRequired(userId: string): Promise<void> {
    await this.driverRepo.update(
      { userId, availabilityStatus: DriverAvailabilityStatus.PENDING },
      { availabilityStatus: DriverAvailabilityStatus.SETUP_REQUIRED },
    );
  }

  // ─── Internal: SETUP_REQUIRED → OFFLINE (called after vehicle/workArea saved) ─

  async markOfflineIfReady(driverId: string): Promise<void> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) return;
    if (driver.availabilityStatus !== DriverAvailabilityStatus.SETUP_REQUIRED)
      return;

    // Both conditions must be met: vehicle assigned AND it is AVAILABLE AND work area set
    const vehicle = await this.vehicleRepo.findOne({
      where: { driverId: driver.id },
    });
    if (!vehicle) return;
    if (vehicle.status !== VehicleStatus.AVAILABLE) return;
    if (!driver.workAreaId) return;

    await this.driverRepo.update(driver.id, {
      availabilityStatus: DriverAvailabilityStatus.OFFLINE,
    });
  }

  // ─── Internal: Force driver → SETUP_REQUIRED (called when vehicle → MAINTENANCE) ─

  async forceSetupRequired(driverId: string): Promise<void> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) return;

    // Only act if driver was in an active/ready state — not already PENDING or SETUP_REQUIRED
    const activeStatuses: DriverAvailabilityStatus[] = [
      DriverAvailabilityStatus.OFFLINE,
      DriverAvailabilityStatus.ONLINE,
    ];

    if (!activeStatuses.includes(driver.availabilityStatus)) return;

    await this.driverRepo.update(driver.id, {
      availabilityStatus: DriverAvailabilityStatus.SETUP_REQUIRED,
    });
  }

  // ─── Helper ────────────────────────────────────────────────────────────────

  private _currentMonth(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Accumulate a validated session delta into driver_online_history for the given month.
   * Accepts a repository so it can participate in an outer transaction.
   * Uses an atomic UPDATE with a SQL-side cap check so concurrent calls cannot
   * inflate the total beyond MAX_MONTHLY_MS (~31 days). Falls back to insert if
   * no row exists for the (driverId, month) pair.
   */
  private async _accumulateSessionTimeTx(
    repo: Repository<DriverOnlineHistory>,
    userId: string,
    month: string,
    deltaMs: number,
  ): Promise<void> {
    const MAX_MONTHLY_MS = 31 * 24 * 60 * 60 * 1000; // ~2.68 billion ms

    // Atomic conditional UPDATE: only add deltaMs if total would not exceed cap.
    const updateResult = await repo
      .createQueryBuilder()
      .update(DriverOnlineHistory)
      .set({
        onlineTimeMs: () => `"onlineTimeMs" + ${deltaMs}`,
        updatedAt: new Date(),
      })
      .where(
        '"driverId" = :driverId AND month = :month AND ("onlineTimeMs" + :deltaMs) <= :max',
        { driverId: userId, month, deltaMs, max: MAX_MONTHLY_MS },
      )
      .execute();

    if (updateResult.affected && updateResult.affected > 0) {
      return;
    }

    const existing = await repo.findOne({
      where: { driverId: userId, month },
    });

    if (existing) {
      this.logger.error(
        `[DRIVER_AVAILABILITY] Driver ${userId} accumulated time would exceed monthly max ${MAX_MONTHLY_MS}ms ` +
          `(current=${existing.onlineTimeMs}ms, delta=${deltaMs}ms) — skipping accumulation.`,
      );
      return;
    }

    if (deltaMs > MAX_MONTHLY_MS) {
      this.logger.error(
        `[DRIVER_AVAILABILITY] Driver ${userId} initial deltaMs ${deltaMs}ms exceeds monthly max — skipping insert.`,
      );
      return;
    }
    try {
      await repo.save({
        driverId: userId,
        month,
        onlineTimeMs: deltaMs,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (err) {
      // Race: another concurrent insert won — retry the conditional update once.
      await repo
        .createQueryBuilder()
        .update(DriverOnlineHistory)
        .set({
          onlineTimeMs: () => `"onlineTimeMs" + ${deltaMs}`,
          updatedAt: new Date(),
        })
        .where(
          '"driverId" = :driverId AND month = :month AND ("onlineTimeMs" + :deltaMs) <= :max',
          { driverId: userId, month, deltaMs, max: MAX_MONTHLY_MS },
        )
        .execute();
    }
  }

  /**
   * Non-transactional wrapper for external callers (e.g., HeartbeatService sweep).
   */
  async accumulateSessionTime(
    userId: string,
    month: string,
    deltaMs: number,
  ): Promise<void> {
    await this._accumulateSessionTimeTx(
      this.onlineHistoryRepo,
      userId,
      month,
      deltaMs,
    );
  }

  /**
   * One-time migration: seed monthlyOnlineMs from legacy client-side SharedPreferences.
   * Only writes if the driver's monthly counter is currently 0 for this month (idempotent).
   */
  async seedMonthlyOnlineTime(
    userId: string,
    monthlyOnlineMs: number,
    month: string,
  ): Promise<void> {
    if (!monthlyOnlineMs || monthlyOnlineMs <= 0) return;

    // Validate: reject unreasonable values (max 31 days in milliseconds)
    const MAX_MONTHLY_MS = 31 * 24 * 60 * 60 * 1000; // ~2.68 billion ms
    if (monthlyOnlineMs > MAX_MONTHLY_MS) {
      throw new ForbiddenException(
        `Invalid monthly online time value: ${monthlyOnlineMs}ms exceeds maximum allowed (${MAX_MONTHLY_MS}ms ≈ 31 days)`,
      );
    }

    const currentMonth = this._currentMonth();
    if (month !== currentMonth) return; // only migrate current-month data

    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) return;

    // Idempotent: only seed if driver_online_history has 0 for this month
    const existing = await this.onlineHistoryRepo.findOne({
      where: { driverId: userId, month: currentMonth },
    });
    if (existing && existing.onlineTimeMs > 0) return;

    // Insert or update driver_online_history
    if (existing) {
      existing.onlineTimeMs = monthlyOnlineMs;
      existing.updatedAt = new Date();
      await this.onlineHistoryRepo.save(existing);
    } else {
      await this.onlineHistoryRepo.save({
        driverId: userId,
        month: currentMonth,
        onlineTimeMs: monthlyOnlineMs,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
}
