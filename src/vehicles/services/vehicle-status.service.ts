import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { Vehicle, VehicleStatus }               from '../entities/vehicle.entity';
import { Driver, DriverAvailabilityStatus }      from '../../driver/entities/driver.entity';
import { VehicleCrudService }                    from './vehicle-crud.service';

@Injectable()
export class VehicleStatusService {
  private readonly logger = new Logger(VehicleStatusService.name);

  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,

    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,

    private readonly crudService: VehicleCrudService,
  ) {}

  // ── Assign Driver ────────────────────────────────────────────────────────────

  async assignDriver(id: string, driverId: string): Promise<Vehicle> {
    const vehicle = await this.crudService.findOne(id);

    if (vehicle.status === VehicleStatus.ON_TRIP) {
      throw new BadRequestException('Cannot reassign driver while vehicle is On Trip.');
    }
    if (vehicle.status === VehicleStatus.MAINTENANCE) {
      throw new BadRequestException(
        'Vehicle is under Maintenance. Complete maintenance before assigning a driver.',
      );
    }
    if (vehicle.status === VehicleStatus.PENDING) {
      throw new BadRequestException(
        'Vehicle is still Pending setup. It must be Available before assigning a driver.',
      );
    }

    // ── One driver ↔ one vehicle ─────────────────────────────────────────────
    const driverAlreadyAssigned = await this.vehicleRepo.findOne({
      where: { driverId },
    });
    if (driverAlreadyAssigned && driverAlreadyAssigned.id !== id) {
      throw new BadRequestException(
        `Driver is already assigned to vehicle "${driverAlreadyAssigned.make} ${driverAlreadyAssigned.model}". Unassign them first.`,
      );
    }

    vehicle.driverId = driverId;
    return this.vehicleRepo.save(vehicle);
  }

  // ── Trip Lifecycle ───────────────────────────────────────────────────────────

  async setOnTrip(id: string): Promise<Vehicle> {
    const vehicle = await this.crudService.findOne(id);
    if (vehicle.status !== VehicleStatus.AVAILABLE) {
      throw new BadRequestException(
        `Vehicle must be Available to start a trip. Current: ${vehicle.status}`,
      );
    }
    vehicle.status = VehicleStatus.ON_TRIP;
    return this.vehicleRepo.save(vehicle);
  }

  async endTrip(id: string): Promise<Vehicle> {
    const vehicle = await this.crudService.findOne(id);
    if (vehicle.status !== VehicleStatus.ON_TRIP) {
      throw new BadRequestException(`Vehicle is not On Trip. Current: ${vehicle.status}`);
    }
    vehicle.status = VehicleStatus.AVAILABLE;
    return this.vehicleRepo.save(vehicle);
  }

  // ── Maintenance ──────────────────────────────────────────────────────────────

  async setMaintenance(id: string): Promise<Vehicle> {
    const vehicle = await this.crudService.findOne(id);

    if (vehicle.status !== VehicleStatus.AVAILABLE) {
      throw new BadRequestException(
        `Only Available vehicles can go to Maintenance. Current: ${vehicle.status}`,
      );
    }

    // Force assigned driver back to SETUP_REQUIRED
    if (vehicle.driverId) {
      const driver = await this.driverRepo.findOne({ where: { id: vehicle.driverId } });
      if (driver) {
        const activeStatuses: DriverAvailabilityStatus[] = [
          DriverAvailabilityStatus.OFFLINE,
          DriverAvailabilityStatus.ONLINE,
          DriverAvailabilityStatus.ON_TRIP,
        ];
        if (activeStatuses.includes(driver.availabilityStatus)) {
          await this.driverRepo.update(driver.id, {
            availabilityStatus: DriverAvailabilityStatus.SETUP_REQUIRED,
          });
          this.logger.log(
            `Driver "${driver.id}" forced to SETUP_REQUIRED — vehicle "${id}" entered MAINTENANCE.`,
          );
        }
      }
    }

    vehicle.status   = VehicleStatus.MAINTENANCE;
    vehicle.driverId = null;
    return this.vehicleRepo.save(vehicle);
  }

  async completeMaintenance(id: string): Promise<Vehicle> {
    const vehicle = await this.crudService.findOne(id);
    if (vehicle.status !== VehicleStatus.MAINTENANCE) {
      throw new BadRequestException(
        `Vehicle is not under Maintenance. Current: ${vehicle.status}`,
      );
    }
    vehicle.status = VehicleStatus.AVAILABLE;
    return this.vehicleRepo.save(vehicle);
  }
}