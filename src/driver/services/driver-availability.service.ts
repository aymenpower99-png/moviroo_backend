import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../entities/driver.entity';
import { Vehicle, VehicleStatus } from '../../vehicles/entities/vehicle.entity';
import { EarningsService } from '../../earnings/earnings.service';

@Injectable()
export class DriverAvailabilityService {
  constructor(
    @InjectRepository(Driver)  private driverRepo:  Repository<Driver>,
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
    private readonly earningsService: EarningsService,
  ) {}

  // ─── Driver: Toggle online / offline ─────────────────────────────────────────

  async setMyAvailability(
    userId: string,
    status: DriverAvailabilityStatus.ONLINE | DriverAvailabilityStatus.OFFLINE,
  ): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver)
      throw new NotFoundException('Driver profile not found. Please complete your profile first.');

    if (driver.availabilityStatus === DriverAvailabilityStatus.PENDING)
      throw new ForbiddenException('You must activate your account before changing availability.');

    if (driver.availabilityStatus === DriverAvailabilityStatus.SETUP_REQUIRED)
      throw new ForbiddenException('You must add a vehicle and work area before going online.');

    if (driver.availabilityStatus === DriverAvailabilityStatus.ON_TRIP)
      throw new ForbiddenException('You cannot change availability while on a trip.');

    // If going ONLINE, verify vehicle is still AVAILABLE
    if (status === DriverAvailabilityStatus.ONLINE) {
      const vehicle = await this.vehicleRepo.findOne({ where: { driverId: driver.id } });
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

    driver.availabilityStatus = status;

    // Build a targeted partial update — only touch the columns we intend to change.
    // This avoids a full save() which would include ALL driver columns (including
    // legacy null values for notif_push_enabled / notif_email_enabled) and cause
    // NOT NULL constraint failures on unrelated fields.
    const updateData: Partial<Driver> = {
      availabilityStatus: status,
    };

    if (status === DriverAvailabilityStatus.ONLINE) {
      const currentMonth = this._currentMonth();
      // Reset counter when a new month starts
      if (driver.onlineTimeMonth !== currentMonth) {
        updateData.monthlyOnlineMs = 0;
        updateData.onlineTimeMonth = currentMonth;
      }
      updateData.onlineSince = new Date();
    } else {
      // Going OFFLINE — commit session time to the monthly accumulator
      if (driver.onlineSince) {
        const deltaMs = Date.now() - new Date(driver.onlineSince).getTime();
        const currentMonth = this._currentMonth();
        if (driver.onlineTimeMonth !== currentMonth) {
          // Month boundary mid-session — start fresh for the new month
          updateData.monthlyOnlineMs = deltaMs;
          updateData.onlineTimeMonth  = currentMonth;
        } else {
          updateData.monthlyOnlineMs = (Number(driver.monthlyOnlineMs) || 0) + deltaMs;
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
    if (driver.availabilityStatus !== DriverAvailabilityStatus.SETUP_REQUIRED) return;

    // Both conditions must be met: vehicle assigned AND it is AVAILABLE AND work area set
    const vehicle = await this.vehicleRepo.findOne({ where: { driverId: driver.id } });
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
      DriverAvailabilityStatus.ON_TRIP,
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
  async seedMonthlyOnlineTime(userId: string, monthlyOnlineMs: number, month: string): Promise<void> {
    if (!monthlyOnlineMs || monthlyOnlineMs <= 0) return;
    const currentMonth = this._currentMonth();
    if (month !== currentMonth) return; // only migrate current-month data

    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) return;

    // Idempotent: only seed if backend has 0 for this month
    const alreadyHasData =
      driver.onlineTimeMonth === currentMonth && (Number(driver.monthlyOnlineMs) || 0) > 0;
    if (alreadyHasData) return;

    driver.monthlyOnlineMs = monthlyOnlineMs;
    driver.onlineTimeMonth = currentMonth;
    await this.driverRepo.update({ userId }, {
      monthlyOnlineMs,
      onlineTimeMonth: currentMonth,
    });
  }
}