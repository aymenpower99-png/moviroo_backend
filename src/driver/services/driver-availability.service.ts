import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';

@Injectable()
export class DriverAvailabilityService {
  constructor(
    @InjectRepository(Driver)  private driverRepo: Repository<Driver>,
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

  // ─── Internal: SETUP_REQUIRED → OFFLINE (called after vehicle is saved) ───────

  async markOfflineIfReady(driverId: string): Promise<void> {
    const driver = await this.driverRepo.findOne({ where: { id: driverId } });
    if (!driver) return;
    if (driver.availabilityStatus !== DriverAvailabilityStatus.SETUP_REQUIRED) return;

    const vehicle = await this.vehicleRepo.findOne({ where: { driverId: driver.id } });
    if (!vehicle) return;

    await this.driverRepo.update(driver.id, {
      availabilityStatus: DriverAvailabilityStatus.OFFLINE,
    });
  }
}