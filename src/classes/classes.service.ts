import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { VehicleClass } from './entities/class.entity';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(VehicleClass)
    private readonly classRepo: Repository<VehicleClass>,
  ) {}

  async create(dto: CreateClassDto): Promise<VehicleClass> {
    const existing = await this.classRepo.findOne({
      where: { name: dto.name, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException(`A class named "${dto.name}" already exists.`);
    }
    const newClass = this.classRepo.create(dto);
    return this.classRepo.save(newClass);
  }

  /**
   * GET /admin/classes
   * Returns all active classes WITH vehicleCount per class.
   * Used by the classes list page and sidebar badges.
   */
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

  /**
   * GET /admin/classes/:id
   * Returns class info only — no vehicles list.
   * Also used internally to validate class existence.
   */
  async findOne(id: string): Promise<VehicleClass> {
    const vehicleClass = await this.classRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!vehicleClass) {
      throw new NotFoundException(`Class with id "${id}" not found.`);
    }
    return vehicleClass;
  }

  /**
   * GET /admin/classes/:id/detail
   * Returns class info + features + ALL vehicles assigned to it.
   * This is the class detail / hub page endpoint.
   */
  async findOneWithVehicles(id: string) {
    const vehicleClass = await this.classRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: ['vehicles'],
    });
    if (!vehicleClass) {
      throw new NotFoundException(`Class with id "${id}" not found.`);
    }

    const vehicles = await vehicleClass.vehicles;

    return {
      id:        vehicleClass.id,
      name:      vehicleClass.name,
      imageUrl:  vehicleClass.imageUrl,
      isActive:  vehicleClass.isActive,
      createdAt: vehicleClass.createdAt,
      updatedAt: vehicleClass.updatedAt,
      features: {
        seats:           vehicleClass.seats,
        bags:            vehicleClass.bags,
        wifi:            vehicleClass.wifi,
        ac:              vehicleClass.ac,
        water:           vehicleClass.water,
        freeWaitingTime: vehicleClass.freeWaitingTime,
        doorToDoor:      vehicleClass.doorToDoor,
        meetAndGreet:    vehicleClass.meetAndGreet,
      },
      vehicleCount: vehicles.length,
      vehicles,
    };
  }

  async update(id: string, dto: UpdateClassDto): Promise<VehicleClass> {
    const vehicleClass = await this.findOne(id);
    if (dto.name && dto.name !== vehicleClass.name) {
      const duplicate = await this.classRepo.findOne({
        where: { name: dto.name, deletedAt: IsNull() },
      });
      if (duplicate) {
        throw new ConflictException(`A class named "${dto.name}" already exists.`);
      }
    }
    Object.assign(vehicleClass, dto);
    return this.classRepo.save(vehicleClass);
  }

  async remove(id: string): Promise<{ message: string }> {
    const vehicleClass = await this.findOne(id);
    await this.classRepo.softRemove(vehicleClass);
    return { message: `Class "${vehicleClass.name}" deleted successfully.` };
  }

  async getFeatures(id: string) {
    const c = await this.findOne(id);
    return {
      seats:           c.seats,
      bags:            c.bags,
      wifi:            c.wifi,
      ac:              c.ac,
      water:           c.water,
      freeWaitingTime: c.freeWaitingTime,
      doorToDoor:      c.doorToDoor,
      meetAndGreet:    c.meetAndGreet,
    };
  }
}