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
import { WorkArea } from '../../work-area/entities/work-area.entity';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';
import { CreateDriverDto } from '../dto/create-driver.dto';
import { UpdateDriverDto } from '../dto/update-driver.dto';

@Injectable()
export class DriverAdminService {
  constructor(
    @InjectRepository(Driver) private driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(WorkArea) private workAreaRepo: Repository<WorkArea>,
    @InjectRepository(Ride) private rideRepo: Repository<Ride>,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────────

  async create(dto: CreateDriverDto): Promise<Driver> {
    const userExists = await this.driverRepo.findOne({
      where: { userId: dto.userId },
    });
    if (userExists)
      throw new BadRequestException(
        'A driver profile already exists for this user.',
      );

    // Update user's role to DRIVER and phone if provided
    await this.userRepo.update(dto.userId, {
      role: 'driver' as any,
      ...(dto.phone && { phone: dto.phone }),
    });

    const driver = this.driverRepo.create({
      userId: dto.userId,
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

    const [user, vehicle, totalTrips, cancellationCount] = await Promise.all([
      this.userRepo.findOne({ where: { id: driver.userId } }),
      this.vehicleRepo.findOne({
        where: { driverId: driver.id },
        relations: ['vehicleClass'],
      }),
      this.rideRepo.count({
        where: { driverId: driver.userId, status: RideStatus.COMPLETED },
      }),
      this.rideRepo.count({
        where: { driverId: driver.userId, status: RideStatus.CANCELLED },
      }),
    ]);

    return {
      ...driver,
      totalTrips,
      cancellationCount,
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

    Object.assign(driver, {
      ...(dto.availabilityStatus !== undefined && {
        availabilityStatus: dto.availabilityStatus,
      }),
      ...(dto.fixedMonthlySalary !== undefined && {
        fixedMonthlySalary: dto.fixedMonthlySalary,
      }),
    });

    await this.driverRepo.save(driver);

    // ── Assign or unassign vehicle ────────────────────────────────────────────
    if (dto.vehicleId !== undefined) {
      if (dto.vehicleId === null) {
        // Explicitly unassign current vehicle
        await this.vehicleRepo.update(
          { driverId: driver.id },
          { driverId: null },
        );
      } else {
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

        // Enforce one-to-one
        if (vehicle.driverId && vehicle.driverId !== driver.id) {
          throw new BadRequestException(
            `This vehicle is already assigned to another driver. Unassign it first.`,
          );
        }

        // Unlink this driver from any previously assigned vehicle
        await this.vehicleRepo.update(
          { driverId: driver.id },
          { driverId: null },
        );

        vehicle.driverId = driver.id;
        await this.vehicleRepo.save(vehicle);
      }
    }

    // ── Assign or unassign work area ──────────────────────────────────────────
    if (dto.workAreaId !== undefined) {
      if (dto.workAreaId === null) {
        driver.workAreaId = null;
        // Demote active statuses back to SETUP_REQUIRED
        const activeStatuses: DriverAvailabilityStatus[] = [
          DriverAvailabilityStatus.OFFLINE,
          DriverAvailabilityStatus.ONLINE,
        ];
        if (activeStatuses.includes(driver.availabilityStatus)) {
          driver.availabilityStatus = DriverAvailabilityStatus.SETUP_REQUIRED;
        }
      } else {
        const area = await this.workAreaRepo.findOne({
          where: { id: dto.workAreaId },
        });
        if (!area)
          throw new NotFoundException(`Work area "${dto.workAreaId}" not found.`);
        driver.workAreaId = dto.workAreaId;
      }
      await this.driverRepo.save(driver);
    }

    // ── Auto-promote status based on final state ──────────────────────────────
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

    // PENDING → SETUP_REQUIRED when a vehicle is first linked
    if (
      driver.availabilityStatus === DriverAvailabilityStatus.PENDING &&
      hasVehicle
    ) {
      driver.availabilityStatus = DriverAvailabilityStatus.SETUP_REQUIRED;
      await this.driverRepo.save(driver);
    }

    // If vehicle was removed and driver has no vehicle, demote to PENDING
    if (
      !hasVehicle &&
      (driver.availabilityStatus === DriverAvailabilityStatus.SETUP_REQUIRED ||
        driver.availabilityStatus === DriverAvailabilityStatus.OFFLINE)
    ) {
      driver.availabilityStatus = DriverAvailabilityStatus.PENDING;
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
