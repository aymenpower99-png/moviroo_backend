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
      }
    }

    driver.availabilityStatus = status;

    // Build a targeted partial update — only touch the columns we intend to change.
    // This avoids a full save() which would include ALL driver columns (including
    // legacy null values for notif_push_enabled / notif_email_enabled) and cause
    // NOT NULL constraint failures on unrelated fields.
    const updateData: Partial<Driver> = {
      availabilityStatus: status,
    };

    const currentMonth = this._currentMonth();

    if (status === DriverAvailabilityStatus.ONLINE) {
      updateData.onlineSince = new Date();
    } else {
      // Going OFFLINE — commit session time to driver_online_history
      if (driver.onlineSince) {
        const deltaMs = Date.now() - new Date(driver.onlineSince).getTime();

        // Validate deltaMs to prevent corrupted session times
        if (deltaMs < 0 || deltaMs > 24 * 60 * 60 * 1000) {
          // Negative or >24 hours is suspicious - skip accumulation
          console.warn(
            `Suspicious deltaMs for driver ${driver.userId}: ${deltaMs}ms. Skipping accumulation.`,
          );
        } else {
          // Update or insert into driver_online_history
          let history = await this.onlineHistoryRepo.findOne({
            where: { driverId: driver.userId, month: currentMonth },
          });

          if (history) {
            // Validate accumulated total doesn't exceed reasonable monthly max
            const MAX_MONTHLY_MS = 31 * 24 * 60 * 60 * 1000; // ~2.68 billion ms
            const newTotal = history.onlineTimeMs + deltaMs;
            if (newTotal > MAX_MONTHLY_MS) {
              this.logger.error(
                `[DRIVER_AVAILABILITY] Driver ${driver.userId} accumulated time ${newTotal}ms exceeds monthly max ${MAX_MONTHLY_MS}ms - skipping accumulation. Current: ${history.onlineTimeMs}ms, delta: ${deltaMs}ms`,
              );
            } else {
              history.onlineTimeMs += deltaMs;
              history.updatedAt = new Date();
              await this.onlineHistoryRepo.save(history);
            }
          } else {
            await this.onlineHistoryRepo.save({
              driverId: driver.userId,
              month: currentMonth,
              onlineTimeMs: deltaMs,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        }

        updateData.onlineSince = null;
      }
    }

    await this.driverRepo.update({ userId }, updateData);
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
