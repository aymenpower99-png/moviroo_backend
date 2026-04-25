import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { VehicleClass } from './entities/class.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { Driver } from '../driver/entities/driver.entity';
import { User } from '../users/entites/user.entity';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(VehicleClass)
    private readonly classRepo: Repository<VehicleClass>,

    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,

    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ── Create ───────────────────────────────────────────────────────────────────

  async create(dto: CreateClassDto): Promise<VehicleClass> {
    const existing = await this.classRepo.findOne({
      where: { name: dto.name, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException(
        `A class named "${dto.name}" already exists.`,
      );
    }
    const newClass = this.classRepo.create(dto);
    return this.classRepo.save(newClass);
  }

  // ── Find All ─────────────────────────────────────────────────────────────────
  // Returns all active classes WITH vehicleCount per class.

  async findAll(): Promise<(VehicleClass & { vehicleCount: number })[]> {
    const result = await this.classRepo
      .createQueryBuilder('cls')
      .leftJoin('cls.vehicles', 'v', 'v.deleted_at IS NULL')
      .addSelect('COUNT(v.id)', 'vehicleCount')
      .where('cls.is_active = true AND cls.deleted_at IS NULL')
      .groupBy('cls.id')
      .orderBy('cls.created_at', 'DESC')
      .getRawAndEntities();

    return result.entities.map((cls, i) => ({
      ...cls,
      vehicleCount: parseInt(result.raw[i]?.vehicleCount ?? '0', 10),
    }));
  }

  // ── Find One (no vehicles — used internally) ─────────────────────────────────

  async findOne(id: string): Promise<VehicleClass> {
    const vehicleClass = await this.classRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!vehicleClass) {
      throw new NotFoundException(`Class with id "${id}" not found.`);
    }
    return vehicleClass;
  }

  // ── Find One With Vehicles ───────────────────────────────────────────────────
  // GET /admin/classes/:id/detail
  // Returns class + features + all vehicles with REAL driver full names.

  async findOneWithVehicles(id: string) {
    const vehicleClass = await this.classRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!vehicleClass) {
      throw new NotFoundException(`Class with id "${id}" not found.`);
    }

    // Load vehicles for this class directly (avoids lazy-relation complexity)
    const vehicles = await this.vehicleRepo.find({
      where: { classId: id },
      order: { createdAt: 'ASC' },
    });

    // ── Resolve driver full names ────────────────────────────────────────────
    const driverIds = [
      ...new Set(vehicles.map((v) => v.driverId).filter(Boolean)),
    ] as string[];

    const driverNameMap = new Map<string, string>();

    if (driverIds.length > 0) {
      // 1) Load drivers to get their userId
      const drivers = await this.driverRepo.find({
        where: { id: In(driverIds) },
        select: ['id', 'userId'],
      });

      // 2) Load corresponding users for first/last name
      const userIds = [...new Set(drivers.map((d) => d.userId))];
      const users =
        userIds.length > 0
          ? await this.userRepo
              .createQueryBuilder('u')
              .select(['u.id', 'u.firstName', 'u.lastName'])
              .whereInIds(userIds)
              .getMany()
          : [];

      const userById = new Map(users.map((u) => [u.id, u]));

      for (const driver of drivers) {
        const user = userById.get(driver.userId);
        if (user) {
          const fullName =
            `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
          driverNameMap.set(driver.id, fullName || 'Unknown');
        }
      }
    }

    // ── Enrich vehicles with driverName ─────────────────────────────────────
    const vehiclesWithDriver = vehicles.map((v) => ({
      id: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      color: v.color,
      licensePlate: v.licensePlate,
      driverId: v.driverId,
      driverName: v.driverId ? (driverNameMap.get(v.driverId) ?? null) : null,
      status: v.status,
      photos: v.photos,
      isActive: v.isActive,
      createdAt: v.createdAt,
    }));

    return {
      id: vehicleClass.id,
      name: vehicleClass.name,
      imageUrl: vehicleClass.imageUrl,
      isActive: vehicleClass.isActive,
      createdAt: vehicleClass.createdAt,
      updatedAt: vehicleClass.updatedAt,
      features: {
        seats: vehicleClass.seats,
        bags: vehicleClass.bags,
        wifi: vehicleClass.wifi,
        ac: vehicleClass.ac,
        water: vehicleClass.water,
        freeWaitingTime: vehicleClass.freeWaitingTime,
        doorToDoor: vehicleClass.doorToDoor,
        meetAndGreet: vehicleClass.meetAndGreet,
        extraFeatures: vehicleClass.extraFeatures,
        extraServices: vehicleClass.extraServices,
      },
      vehicleCount: vehicles.length,
      vehicles: vehiclesWithDriver,
    };
  }

  // ── Update ──────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateClassDto): Promise<VehicleClass> {
    const vehicleClass = await this.findOne(id);
    if (dto.name && dto.name !== vehicleClass.name) {
      const duplicate = await this.classRepo.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });
      if (duplicate) {
        throw new ConflictException(
          `A class named "${dto.name}" already exists.`,
        );
      }
    }
    Object.assign(vehicleClass, dto);
    return this.classRepo.save(vehicleClass);
  }

  // ── Remove ──────────────────────────────────────────────────────────────────

  async remove(id: string): Promise<{ message: string }> {
    const vehicleClass = await this.findOne(id);
    await this.classRepo.delete(vehicleClass.id);
    return { message: `Class "${vehicleClass.name}" deleted successfully.` };
  }

  // ── Features ────────────────────────────────────────────────────────────────

  async getFeatures(id: string) {
    const c = await this.findOne(id);
    return {
      seats: c.seats,
      bags: c.bags,
      wifi: c.wifi,
      ac: c.ac,
      water: c.water,
      freeWaitingTime: c.freeWaitingTime,
      doorToDoor: c.doorToDoor,
      meetAndGreet: c.meetAndGreet,
      extraFeatures: c.extraFeatures,
      extraServices: c.extraServices,
    };
  }

  // ── Get Active Classes with Multipliers (for ML pricing) ─────────────────────

  async getActiveClassesWithMultipliers(): Promise<
    Array<{ id: string; name: string; multiplier: number }>
  > {
    const classes = await this.classRepo.find({
      where: { isActive: true, deletedAt: IsNull() },
      select: ['id', 'name', 'multiplier'],
      order: { name: 'ASC' },
    });

    return classes.map((c) => ({
      id: c.id,
      name: c.name,
      multiplier: parseFloat(c.multiplier.toString()),
    }));
  }
}
