import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../entities/driver.entity';
import { Vehicle, VehicleStatus } from '../../vehicles/entities/vehicle.entity';

@Injectable()
export class DriverAvailabilityService {
  constructor(
    @InjectRepository(Driver)  private driverRepo:  Repository<Driver>,
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
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
    return this.driverRepo.save(driver);
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
}