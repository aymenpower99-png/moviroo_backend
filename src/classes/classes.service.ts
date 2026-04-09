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

  async findAll(): Promise<VehicleClass[]> {
    return this.classRepo.find({
      where: { isActive: true, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<VehicleClass> {
    const vehicleClass = await this.classRepo.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!vehicleClass) {
      throw new NotFoundException(`Class with id "${id}" not found.`);
    }
    return vehicleClass;
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
    const vehicleClass = await this.findOne(id);
    return {
      seats:           vehicleClass.seats,
      bags:            vehicleClass.bags,
      wifi:            vehicleClass.wifi,
      ac:              vehicleClass.ac,
      water:           vehicleClass.water,
      freeWaitingTime: vehicleClass.freeWaitingTime,
      doorToDoor:      vehicleClass.doorToDoor,
      meetAndGreet:    vehicleClass.meetAndGreet,
    };
  }
}