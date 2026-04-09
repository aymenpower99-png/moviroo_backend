import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { User } from '../../users/entites/user.entity';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';

@Injectable()
export class DriverAdminService {
  constructor(
    @InjectRepository(Driver) private driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // ─── Create Driver (on invite) ────────────────────────────────────────────────

  async create(dto: CreateDriverDto): Promise<Driver> {
    if (dto.driverLicenseNumber) {
      const dup = await this.driverRepo.findOne({
        where: { driverLicenseNumber: dto.driverLicenseNumber },
      });
      if (dup)
        throw new BadRequestException(
          `License "${dto.driverLicenseNumber}" already registered.`,
        );
    }

    const userExists = await this.driverRepo.findOne({
      where: { userId: dto.userId },
    });
    if (userExists)
      throw new BadRequestException(
        'A driver profile already exists for this user.',
      );

    if (dto.phone) {
      await this.userRepo.update(dto.userId, { phone: dto.phone });
    }

    const driver = this.driverRepo.create({
      userId: dto.userId,
      driverLicenseNumber: dto.driverLicenseNumber,
      driverLicenseFrontUrl: dto.driverLicenseFrontUrl,
      driverLicenseBackUrl: dto.driverLicenseBackUrl,
      availabilityStatus: DriverAvailabilityStatus.PENDING,
    });

    return this.driverRepo.save(driver);
  }

  // ─── List All Drivers ─────────────────────────────────────────────────────────

  async findAll(
    page = 1,
    limit = 20,
    availabilityStatus?: DriverAvailabilityStatus,
  ) {
    const where: Record<string, unknown> = {};
    if (availabilityStatus) where['availabilityStatus'] = availabilityStatus;

    const [drivers, total] = await this.driverRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    if (drivers.length === 0) return { data: [], total, page, limit };

    const driverIds = drivers.map((d) => d.id);
    const userIds = drivers.map((d) => d.userId);

    const vehicles = await this.vehicleRepo
      .createQueryBuilder('v')
      .where('v.driver_id IN (:...ids)', { ids: driverIds })
      .getMany();
    const vehicleByDriverId = new Map(vehicles.map((v) => [v.driverId, v]));

    const users = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.phone'])
      .where('u.id IN (:...ids)', { ids: userIds })
      .getMany();
    const userById = new Map(users.map((u) => [u.id, u]));

    const data = drivers.map((d) => {
      const user = userById.get(d.userId);
      const v = vehicleByDriverId.get(d.id);
      return {
        ...d,
        firstName: user?.firstName ?? null,
        lastName: user?.lastName ?? null,
        email: user?.email ?? null,
        phone: user?.phone ?? null,
        vehicle: v
          ? {
              id: v.id,
              make: v.make,
              model: v.model,
              year: v.year,
              licensePlate: v.licensePlate,
            }
          : null,
      };
    });

    return { data, total, page, limit };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const driver = await this.findDriverOrFail(id);

    const [user, vehicle] = await Promise.all([
      this.userRepo.findOne({ where: { id: driver.userId } }),
      this.vehicleRepo.findOne({ where: { driverId: driver.id } }),
    ]);

    return {
      ...driver,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      email: user?.email ?? null,
      phone: user?.phone ?? null,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            licensePlate: vehicle.licensePlate,
          }
        : null,
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateDriverDto): Promise<any> {
    const driver = await this.findDriverOrFail(id);

    if (
      dto.driverLicenseNumber &&
      dto.driverLicenseNumber !== driver.driverLicenseNumber
    ) {
      const dup = await this.driverRepo.findOne({
        where: { driverLicenseNumber: dto.driverLicenseNumber },
      });
      if (dup)
        throw new BadRequestException(
          `License "${dto.driverLicenseNumber}" already in use.`,
        );
    }

    Object.assign(driver, {
      ...(dto.driverLicenseNumber !== undefined && {
        driverLicenseNumber: dto.driverLicenseNumber,
      }),
      ...(dto.driverLicenseExpiry !== undefined && {
        driverLicenseExpiry: new Date(dto.driverLicenseExpiry),
      }),
      ...(dto.driverLicenseFrontUrl !== undefined && {
        driverLicenseFrontUrl: dto.driverLicenseFrontUrl,
      }),
      ...(dto.driverLicenseBackUrl !== undefined && {
        driverLicenseBackUrl: dto.driverLicenseBackUrl,
      }),
      ...(dto.availabilityStatus !== undefined && {
        availabilityStatus: dto.availabilityStatus,
      }),
    });

    await this.driverRepo.save(driver);

    // ── Assign vehicle if provided ────────────────────────────────────────────
    if (dto.vehicleId) {
      const vehicle = await this.vehicleRepo.findOne({
        where: { id: dto.vehicleId },
      });
      if (!vehicle)
        throw new NotFoundException(`Vehicle "${dto.vehicleId}" not found.`);
      vehicle.driverId = driver.id;
      await this.vehicleRepo.save(vehicle);
    }

    // ── Auto-promote: setup_required → offline when vehicle assigned ──────────
    // A driver moves to offline (ready to work) when:
    //   1. They have a vehicle
    //   2. They have a work area assigned
    const vehicle = await this.vehicleRepo.findOne({
      where: { driverId: driver.id },
    });
    const hasVehicle = !!vehicle;
    const hasWorkArea = !!(driver as any).workAreaId; // adjust if you add workAreaId column

    if (
      driver.availabilityStatus === DriverAvailabilityStatus.SETUP_REQUIRED &&
      hasVehicle &&
      hasWorkArea
    ) {
      driver.availabilityStatus = DriverAvailabilityStatus.OFFLINE;
      await this.driverRepo.save(driver);
    } else if (
      driver.availabilityStatus === DriverAvailabilityStatus.PENDING &&
      hasVehicle
    ) {
      // At minimum, move from pending → setup_required once they have a vehicle
      // (work area still missing)
      driver.availabilityStatus = DriverAvailabilityStatus.SETUP_REQUIRED;
      await this.driverRepo.save(driver);
    }

    // Return enriched response
    const [user] = await Promise.all([
      this.userRepo.findOne({ where: { id: driver.userId } }),
    ]);
    return {
      ...driver,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      email: user?.email ?? null,
      phone: user?.phone ?? null,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            licensePlate: vehicle.licensePlate,
          }
        : null,
    };
  }

  // ─── Remove ───────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<{ message: string }> {
    await this.findDriverOrFail(id);
    await this.driverRepo.softDelete(id);
    return { message: `Driver "${id}" has been removed.` };
  }

  // ─── Helper ───────────────────────────────────────────────────────────────────

  async findDriverOrFail(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException(`Driver "${id}" not found.`);
    return driver;
  }
}
