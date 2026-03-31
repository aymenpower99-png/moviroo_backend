import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle, VehicleStatus } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

interface NhtsaMake {
  Make_ID:   number;
  Make_Name: string;
}

interface NhtsaModel {
  Model_ID:   number;
  Model_Name: string;
  Make_ID:    number;
  Make_Name:  string;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  // ─── NHTSA: All Makes ─────────────────────────────────────────────────────

  async getAllMakes(): Promise<{ id: number; name: string }[]> {
    try {
      const url  = 'https://vpic.nhtsa.dot.gov/api/vehicles/getallmakes?format=json';
      const res  = await fetch(url);
      const json = (await res.json()) as { Results: NhtsaMake[] };
      return json.Results
        .map((m) => ({ id: m.Make_ID, name: m.Make_Name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this.logger.error('Failed to fetch car makes from NHTSA', err);
      throw new InternalServerErrorException('Could not fetch car makes. Try again later.');
    }
  }

  // ─── NHTSA: Models by Make ID ─────────────────────────────────────────────

  async getModelsByMakeId(makeId: number): Promise<{ id: number; name: string }[]> {
    try {
      const url  = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeId/${makeId}?format=json`;
      const res  = await fetch(url);
      const json = (await res.json()) as { Results: NhtsaModel[] };
      return json.Results
        .map((m) => ({ id: m.Model_ID, name: m.Model_Name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this.logger.error(`Failed to fetch models for makeId=${makeId}`, err);
      throw new InternalServerErrorException('Could not fetch car models. Try again later.');
    }
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    const existing = await this.vehicleRepo.findOne({
      where: { licensePlate: dto.licensePlate },
    });
    if (existing) {
      throw new BadRequestException(`License plate "${dto.licensePlate}" is already registered.`);
    }

    const vehicle = this.vehicleRepo.create({
      driverId:                dto.driverId,
      agencyId:                dto.agencyId,
      make:                    dto.make,
      model:                   dto.model,
      year:                    dto.year,
      color:                   dto.color,
      licensePlate:            dto.licensePlate,
      vin:                     dto.vin ?? null,
      vehicleType:             dto.vehicleType,
      seats:                   dto.seats ?? 4,
      registrationDocumentUrl: dto.registrationDocumentUrl,
      insuranceDocumentUrl:    dto.insuranceDocumentUrl,
      insuranceExpiry:         new Date(dto.insuranceExpiry),
      technicalControlUrl:     dto.technicalControlUrl ?? null,
      technicalControlExpiry:  dto.technicalControlExpiry
        ? new Date(dto.technicalControlExpiry)
        : null,
      photos:                  dto.photos ?? null,
      status:                  VehicleStatus.PENDING,
    });

    return this.vehicleRepo.save(vehicle);
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  async findAll(
    page      = 1,
    limit     = 20,
    agencyId?: string,
    driverId?: string,
    status?:   VehicleStatus,
  ) {
    const where: Record<string, unknown> = {};
    if (agencyId) where['agencyId'] = agencyId;
    if (driverId) where['driverId'] = driverId;
    if (status)   where['status']   = status;

    const [data, total] = await this.vehicleRepo.findAndCount({
      where,
      skip:  (page - 1) * limit,
      take:  limit,
      order: { createdAt: 'DESC' },
    });

    return { data, total, page, limit };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException(`Vehicle "${id}" not found.`);
    return vehicle;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

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

    Object.assign(vehicle, {
      ...(dto.driverId                 !== undefined && { driverId:                dto.driverId }),
      ...(dto.agencyId                 !== undefined && { agencyId:                dto.agencyId }),
      ...(dto.make                     !== undefined && { make:                    dto.make }),
      ...(dto.model                    !== undefined && { model:                   dto.model }),
      ...(dto.year                     !== undefined && { year:                    dto.year }),
      ...(dto.color                    !== undefined && { color:                   dto.color }),
      ...(dto.licensePlate             !== undefined && { licensePlate:            dto.licensePlate }),
      ...(dto.vin                      !== undefined && { vin:                     dto.vin }),
      ...(dto.vehicleType              !== undefined && { vehicleType:             dto.vehicleType }),
      ...(dto.seats                    !== undefined && { seats:                   dto.seats }),
      ...(dto.registrationDocumentUrl  !== undefined && { registrationDocumentUrl: dto.registrationDocumentUrl }),
      ...(dto.insuranceDocumentUrl     !== undefined && { insuranceDocumentUrl:    dto.insuranceDocumentUrl }),
      ...(dto.insuranceExpiry          !== undefined && { insuranceExpiry:         new Date(dto.insuranceExpiry) }),
      ...(dto.technicalControlUrl      !== undefined && { technicalControlUrl:     dto.technicalControlUrl }),
      ...(dto.technicalControlExpiry   !== undefined && { technicalControlExpiry:  new Date(dto.technicalControlExpiry) }),
      ...(dto.photos                   !== undefined && { photos:                  dto.photos }),
      ...(dto.status                   !== undefined && { status:                  dto.status }),
      ...(dto.isActive                 !== undefined && { isActive:                dto.isActive }),
    });

    return this.vehicleRepo.save(vehicle);
  }

  // ─── Verify ───────────────────────────────────────────────────────────────

  async verify(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    if (vehicle.status === VehicleStatus.APPROVED) {
      throw new BadRequestException('Vehicle is already approved.');
    }
    vehicle.status     = VehicleStatus.APPROVED;
    vehicle.verifiedAt = new Date();
    return this.vehicleRepo.save(vehicle);
  }

  // ─── Soft Remove (deactivate isActive = false) ────────────────────────────

  async remove(id: string): Promise<{ message: string }> {
    const vehicle = await this.findOne(id);
    vehicle.isActive = false;
    await this.vehicleRepo.save(vehicle);
    return { message: `Vehicle "${id}" has been deactivated.` };
  }

  // ─── Hard Delete (TypeORM soft-delete via deletedAt) ─────────────────────

  async hardDelete(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.vehicleRepo.softDelete(id);
    return { message: `Vehicle "${id}" has been deleted.` };
  }
}