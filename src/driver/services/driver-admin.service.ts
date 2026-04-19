import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../entities/driver.entity';
import { Vehicle, VehicleStatus } from '../../vehicles/entities/vehicle.entity';
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

  // ─── Create ───────────────────────────────────────────────────────────────────

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
      ...(dto.fixedMonthlySalary !== undefined && {
        fixedMonthlySalary: dto.fixedMonthlySalary,
      }),
    });

    return this.driverRepo.save(driver);
  }

  // ─── List All Drivers ───────────────────────────────────────────────────────��─

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

    const vehicles =
      driverIds.length > 0
        ? await this.vehicleRepo.find({
            where: driverIds.map((id) => ({ driverId: id })),
            select: [
              'id',
              'driverId',
              'make',
              'model',
              'year',
              'licensePlate',
              'classId',
              'status',
            ],
          })
        : [];

    const vehicleByDriverId = new Map(vehicles.map((v) => [v.driverId, v]));

    const users =
      userIds.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.phone'])
            .whereInIds(userIds)
            .getMany()
        : [];

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
              classId: v.classId,
              status: v.status,
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
      this.vehicleRepo.findOne({
        where: { driverId: driver.id },
        relations: ['vehicleClass'],
      }),
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
            classId: vehicle.classId,
            className: vehicle.vehicleClass?.name ?? null,
            status: vehicle.status,
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
      ...(dto.fixedMonthlySalary !== undefined && {
        fixedMonthlySalary: dto.fixedMonthlySalary,
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

      if (vehicle.status !== VehicleStatus.AVAILABLE) {
        const reason =
          vehicle.status === VehicleStatus.MAINTENANCE
            ? 'Vehicle is under Maintenance and cannot be assigned to a driver.'
            : vehicle.status === VehicleStatus.ON_TRIP
              ? 'Vehicle is currently On Trip and cannot be reassigned.'
              : `Vehicle status is "${vehicle.status}". Only Available vehicles can be assigned.`;
        throw new BadRequestException(reason);
      }

      // ✅ NEW: Enforce one-to-one — check this vehicle is not already taken by another driver
      if (vehicle.driverId && vehicle.driverId !== driver.id) {
        throw new BadRequestException(
          `This vehicle is already assigned to another driver. Unassign it first.`,
        );
      }

      // ✅ NEW: Unlink this driver from any previously assigned vehicle
      await this.vehicleRepo.update(
        { driverId: driver.id },
        { driverId: null },
      );

      vehicle.driverId = driver.id;
      await this.vehicleRepo.save(vehicle);
    }
    // ── Auto-promote status based on current state ────────────────────────────
    const vehicle = await this.vehicleRepo.findOne({
      where: { driverId: driver.id },
    });
    const hasVehicle = !!vehicle;
    const hasWorkArea = !!driver.workAreaId;
    const vehicleAvailable = vehicle?.status === VehicleStatus.AVAILABLE;

    // SETUP_REQUIRED → OFFLINE only when: vehicle assigned + AVAILABLE + work area set
    if (
      driver.availabilityStatus === DriverAvailabilityStatus.SETUP_REQUIRED &&
      hasVehicle &&
      hasWorkArea &&
      vehicleAvailable
    ) {
      driver.availabilityStatus = DriverAvailabilityStatus.OFFLINE;
      await this.driverRepo.save(driver);
    }

    // PENDING → SETUP_REQUIRED when a vehicle is first linked (regardless of other conditions)
    if (
      driver.availabilityStatus === DriverAvailabilityStatus.PENDING &&
      hasVehicle
    ) {
      driver.availabilityStatus = DriverAvailabilityStatus.SETUP_REQUIRED;
      await this.driverRepo.save(driver);
    }

    const user = await this.userRepo.findOne({ where: { id: driver.userId } });
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
            classId: vehicle.classId,
            status: vehicle.status,
          }
        : null,
    };
  }

  // ─── Remove ───────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<{ message: string }> {
    const driver = await this.findDriverOrFail(id);
    await this.driverRepo.delete(driver.id);
    return { message: `Driver "${id}" has been permanently deleted.` };
  }

  // ─── Helper ───────────────────────────────────────────────────────────────────

  async findDriverOrFail(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException(`Driver "${id}" not found.`);
    return driver;
  }
}
