import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository }       from 'typeorm';
import { Vehicle, VehicleStatus } from '../entities/vehicle.entity';
import { Driver, DriverAvailabilityStatus } from '../../driver/entities/driver.entity';
import { CreateVehicleDto } from '../dto/create-vehicle.dto';
import { UpdateVehicleDto } from '../dto/update-vehicle.dto';
import { ClassesService }   from '../../classes/classes.service';

@Injectable()
export class VehicleCrudService {
  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,

    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,

    private readonly classesService: ClassesService,
  ) {}

  // ── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    await this.classesService.findOne(dto.classId);

    if (dto.licensePlate) {
      const existing = await this.vehicleRepo.findOne({
        where: { licensePlate: dto.licensePlate },
      });
      if (existing) {
        throw new BadRequestException(
          `License plate "${dto.licensePlate}" is already registered.`,
        );
      }
    }

    // One driver ↔ one vehicle on create
    if (dto.driverId) {
      const driverAlreadyAssigned = await this.vehicleRepo.findOne({
        where: { driverId: dto.driverId },
      });
      if (driverAlreadyAssigned) {
        throw new BadRequestException(
          `Driver is already assigned to vehicle "${driverAlreadyAssigned.make} ${driverAlreadyAssigned.model}". Unassign them first.`,
        );
      }
    }

    const hasPhotos = Array.isArray(dto.photos) && dto.photos.length > 0;
    const hasDriver = !!dto.driverId;
    const status    = hasPhotos && hasDriver ? VehicleStatus.AVAILABLE : VehicleStatus.PENDING;

    const vehicle = this.vehicleRepo.create({
      classId:                 dto.classId,
      driverId:                dto.driverId                ?? null,
      agencyId:                dto.agencyId                ?? null,
      make:                    dto.make,
      model:                   dto.model,
      year:                    dto.year,
      color:                   dto.color                   ?? null,
      licensePlate:            dto.licensePlate             ?? null,
      vin:                     dto.vin                     ?? null,
      registrationDocumentUrl: dto.registrationDocumentUrl ?? null,
      registrationExpiry:      dto.registrationExpiry      ? new Date(dto.registrationExpiry) : null,
      insuranceDocumentUrl:    dto.insuranceDocumentUrl    ?? null,
      insuranceExpiry:         dto.insuranceExpiry         ? new Date(dto.insuranceExpiry)    : null,
      technicalControlUrl:     dto.technicalControlUrl     ?? null,
      technicalControlExpiry:  dto.technicalControlExpiry  ? new Date(dto.technicalControlExpiry) : null,
      photos: dto.photos ?? null,
      status,
    });

    const saved = await this.vehicleRepo.save(vehicle);

    // ✅ Always return with relations populated
    return this.vehicleRepo.findOne({
      where: { id: saved.id },
      relations: ['vehicleClass'],
    }) as Promise<Vehicle>;
  }

  // ── Find All ─────────────────────────────────────────────────────────────────

  async findAll(
    page      = 1,
    limit     = 20,
    classId?:  string,
    agencyId?: string,
    driverId?: string,
    status?:   VehicleStatus,
  ) {
    const where: Record<string, unknown> = {};
    if (classId)  where['classId']  = classId;
    if (agencyId) where['agencyId'] = agencyId;
    if (driverId) where['driverId'] = driverId;
    if (status)   where['status']   = status;

    const [data, total] = await this.vehicleRepo.findAndCount({
      where,
      relations: ['vehicleClass'],
      skip:  (page - 1) * limit,
      take:  limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  // ── Find One ─────────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id },
      relations: ['vehicleClass'],
    });
    if (!vehicle) throw new NotFoundException(`Vehicle "${id}" not found.`);
    return vehicle;
  }

  // ── Find By Class ────────────────────────────────────────────────────────────

  async findByClass(classId: string): Promise<Vehicle[]> {
    await this.classesService.findOne(classId);
    return this.vehicleRepo.find({
      where: { classId },
      relations: ['vehicleClass'],
      order: { createdAt: 'DESC' },
    });
  }

  // ── Find Available In Class ──────────────────────────────────────────────────

  async findAvailableInClass(classId: string): Promise<Vehicle> {
    await this.classesService.findOne(classId);
    const vehicle = await this.vehicleRepo.findOne({
      where: { classId, status: VehicleStatus.AVAILABLE, isActive: true },
      relations: ['vehicleClass'],
      order: { createdAt: 'ASC' },
    });
    if (!vehicle) {
      throw new NotFoundException(
        `No available vehicle found in this class. All vehicles may be busy or pending.`,
      );
    }
    return vehicle;
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    // Validate new class if changing
    if (dto.classId && dto.classId !== vehicle.classId) {
      await this.classesService.findOne(dto.classId);
    }

    // Unique license plate check
    if (dto.licensePlate && dto.licensePlate !== vehicle.licensePlate) {
      const dup = await this.vehicleRepo.findOne({
        where: { licensePlate: dto.licensePlate },
      });
      if (dup) {
        throw new BadRequestException(
          `License plate "${dto.licensePlate}" is already in use.`,
        );
      }
    }

    // One driver ↔ one vehicle on update
    if (dto.driverId && dto.driverId !== vehicle.driverId) {
      const driverAlreadyAssigned = await this.vehicleRepo.findOne({
        where: { driverId: dto.driverId },
      });
      if (driverAlreadyAssigned && driverAlreadyAssigned.id !== id) {
        throw new BadRequestException(
          `Driver is already assigned to vehicle "${driverAlreadyAssigned.make} ${driverAlreadyAssigned.model}". Unassign them first.`,
        );
      }
    }

    Object.assign(vehicle, {
      ...(dto.classId                  !== undefined && { classId:                 dto.classId }),
      ...(dto.driverId                 !== undefined && { driverId:                dto.driverId }),
      ...(dto.agencyId                 !== undefined && { agencyId:                dto.agencyId }),
      ...(dto.make                     !== undefined && { make:                    dto.make }),
      ...(dto.model                    !== undefined && { model:                   dto.model }),
      ...(dto.year                     !== undefined && { year:                    dto.year }),
      ...(dto.color                    !== undefined && { color:                   dto.color }),
      ...(dto.licensePlate             !== undefined && { licensePlate:            dto.licensePlate }),
      ...(dto.vin                      !== undefined && { vin:                     dto.vin }),
      ...(dto.registrationDocumentUrl  !== undefined && { registrationDocumentUrl: dto.registrationDocumentUrl }),
      ...(dto.registrationExpiry       !== undefined && { registrationExpiry:      new Date(dto.registrationExpiry) }),
      ...(dto.insuranceDocumentUrl     !== undefined && { insuranceDocumentUrl:    dto.insuranceDocumentUrl }),
      ...(dto.insuranceExpiry          !== undefined && { insuranceExpiry:         new Date(dto.insuranceExpiry) }),
      ...(dto.technicalControlUrl      !== undefined && { technicalControlUrl:     dto.technicalControlUrl }),
      ...(dto.technicalControlExpiry   !== undefined && { technicalControlExpiry:  new Date(dto.technicalControlExpiry) }),
      ...(dto.photos                   !== undefined && { photos:                  dto.photos }),
      ...(dto.isActive                 !== undefined && { isActive:                dto.isActive }),
    });

    // ✅ FIX: If the class is changing, explicitly clear the stale vehicleClass
    //    relation object from the in-memory entity. Without this, TypeORM may
    //    keep the old relation object in memory even after classId is updated,
    //    and the re-fetch can return the old class name in some cache scenarios.
    if (dto.classId !== undefined) {
      (vehicle as any).vehicleClass = undefined;
    }

    // Auto-upgrade PENDING → AVAILABLE when fully ready
    if (
      vehicle.status === VehicleStatus.PENDING &&
      Array.isArray(vehicle.photos) && vehicle.photos.length > 0 &&
      vehicle.driverId
    ) {
      vehicle.status = VehicleStatus.AVAILABLE;
    }

    await this.vehicleRepo.save(vehicle);

    // When a driver is (re-)assigned via the vehicle edit form, promote them
    // from SETUP_REQUIRED → OFFLINE if the vehicle is Available and they have a work area.
    if (dto.driverId && vehicle.status === VehicleStatus.AVAILABLE) {
      const driver = await this.driverRepo.findOne({ where: { id: dto.driverId } });
      if (
        driver &&
        driver.availabilityStatus === DriverAvailabilityStatus.SETUP_REQUIRED &&
        driver.workAreaId
      ) {
        await this.driverRepo.update(driver.id, {
          availabilityStatus: DriverAvailabilityStatus.OFFLINE,
        });
      }
    }

    // ✅ Re-fetch with vehicleClass relation so the response always contains
    //    the full updated class object (name, seats, bags…).
    //    The explicit vehicleClass = undefined above ensures TypeORM loads
    //    the NEW class — not the cached old one — on this re-fetch.
    return this.vehicleRepo.findOne({
      where: { id },
      relations: ['vehicleClass'],
    }) as Promise<Vehicle>;
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<{ message: string }> {
    const vehicle = await this.findOne(id);
    if (vehicle.status === VehicleStatus.ON_TRIP) {
      throw new BadRequestException(
        'Cannot delete a vehicle while it is On Trip. End the trip first.',
      );
    }
    await this.vehicleRepo.delete(vehicle.id);
    return { message: `Vehicle "${id}" deleted.` };
  }

  async hardDelete(id: string): Promise<{ message: string }> {
    const vehicle = await this.findOne(id);
    if (vehicle.status === VehicleStatus.ON_TRIP) {
      throw new BadRequestException(
        'Cannot permanently delete a vehicle while it is On Trip.',
      );
    }
    await this.vehicleRepo.delete(vehicle.id);
    return { message: `Vehicle "${id}" permanently deleted.` };
  }

  // ── Remove From Class ────────────────────────────────────────────────────────

  async removeFromClass(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    if (vehicle.status === VehicleStatus.ON_TRIP) {
      throw new BadRequestException(
        'Cannot remove vehicle from class while it is On Trip.',
      );
    }
    if (vehicle.driverId) {
      const driver = await this.driverRepo.findOne({ where: { id: vehicle.driverId } });
      if (driver) {
        await this.driverRepo.update(driver.id, {
          availabilityStatus: DriverAvailabilityStatus.SETUP_REQUIRED,
        });
      }
    }
    vehicle.status   = VehicleStatus.PENDING;
    vehicle.driverId = null;
    await this.vehicleRepo.save(vehicle);

    return this.vehicleRepo.findOne({
      where: { id },
      relations: ['vehicleClass'],
    }) as Promise<Vehicle>;
  }
}