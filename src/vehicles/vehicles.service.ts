import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vehicle, VehicleStatus } from './entities/vehicle.entity';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { ClassesService } from '../classes/classes.service';
import { Driver, DriverAvailabilityStatus } from '../driver/entities/driver.entity';

interface NhtsaModel {
  Model_ID: number;
  Model_Name: string;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  private readonly POPULAR_MAKES = [
    { id: 474,  name: 'Toyota' },
    { id: 448,  name: 'Honda' },
    { id: 440,  name: 'Ford' },
    { id: 460,  name: 'Hyundai' },
    { id: 461,  name: 'Kia' },
    { id: 441,  name: 'Chevrolet' },
    { id: 452,  name: 'Nissan' },
    { id: 482,  name: 'Volkswagen' },
    { id: 467,  name: 'Mercedes-Benz' },
    { id: 449,  name: 'BMW' },
    { id: 447,  name: 'Audi' },
    { id: 476,  name: 'Renault' },
    { id: 492,  name: 'Peugeot' },
    { id: 451,  name: 'Citroën' },
    { id: 491,  name: 'Opel' },
    { id: 466,  name: 'Mazda' },
    { id: 478,  name: 'Subaru' },
    { id: 475,  name: 'Suzuki' },
    { id: 445,  name: 'Mitsubishi' },
    { id: 444,  name: 'Lexus' },
    { id: 463,  name: 'Infiniti' },
    { id: 462,  name: 'Jeep' },
    { id: 450,  name: 'Dodge' },
    { id: 469,  name: 'Chrysler' },
    { id: 480,  name: 'Volvo' },
    { id: 473,  name: 'Skoda' },
    { id: 477,  name: 'SEAT' },
    { id: 464,  name: 'Fiat' },
    { id: 453,  name: 'Alfa Romeo' },
    { id: 456,  name: 'Porsche' },
    { id: 479,  name: 'Tesla' },
    { id: 471,  name: 'Land Rover' },
    { id: 465,  name: 'Jaguar' },
    { id: 468,  name: 'Mini' },
    { id: 484,  name: 'Dacia' },
    { id: 459,  name: 'Isuzu' },
    { id: 470,  name: 'Iveco' },
  ];

  private readonly FALLBACK_MODELS: Record<number, string[]> = {
    441: ['Blazer','Camaro','Colorado','Corvette','Equinox','Impala','Malibu','Silverado','Spark','Suburban','Tahoe','Trailblazer','Traverse','Trax'],
    484: ['Duster','Jogger','Logan','Lodgy','Sandero','Spring','Stepway'],
    447: ['A1','A3','A4','A5','A6','A7','A8','Q3','Q5','Q7','Q8','R8','RS6','S3','S4','S5','TT'],
    463: ['FX35','G37','Q50','Q60','Q70','QX50','QX60','QX70','QX80'],
  };

  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    private readonly classesService: ClassesService,
  ) {}

  // ─── Makes & Models ───────────────────────────────────────────────────────────

  getAllMakes(): { id: number; name: string }[] {
    return [...this.POPULAR_MAKES].sort((a, b) => a.name.localeCompare(b.name));
  }

  searchMakes(q: string): { id: number; name: string }[] {
    const lower = q.toLowerCase();
    return this.POPULAR_MAKES
      .filter(m => m.name.toLowerCase().includes(lower))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getModelsByMakeId(makeId: number): Promise<{ id: number; name: string }[]> {
    try {
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeId/${makeId}?format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !contentType.includes('application/json')) {
        return this.getFallbackModels(makeId);
      }
      const json = (await res.json()) as { Results: NhtsaModel[] };
      if (!Array.isArray(json?.Results) || json.Results.length === 0) {
        return this.getFallbackModels(makeId);
      }
      return json.Results
        .map(m => ({ id: m.Model_ID, name: m.Model_Name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      this.logger.error(`Failed to fetch models for makeId=${makeId}`, err);
      return this.getFallbackModels(makeId);
    }
  }

  private getFallbackModels(makeId: number): { id: number; name: string }[] {
    const names = this.FALLBACK_MODELS[makeId];
    if (!names) return [];
    return names
      .map((name, i) => ({ id: makeId * 1000 + i, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────────

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

    return this.vehicleRepo.save(vehicle);
  }

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

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOne({
      where: { id },
      relations: ['vehicleClass'],
    });
    if (!vehicle) throw new NotFoundException(`Vehicle "${id}" not found.`);
    return vehicle;
  }

  async findByClass(classId: string): Promise<Vehicle[]> {
    await this.classesService.findOne(classId);
    return this.vehicleRepo.find({
      where: { classId },
      relations: ['vehicleClass'],
      order: { createdAt: 'DESC' },
    });
  }

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

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    if (dto.classId && dto.classId !== vehicle.classId) {
      await this.classesService.findOne(dto.classId);
    }

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

    // Auto-upgrade PENDING → AVAILABLE when ready
    if (
      vehicle.status === VehicleStatus.PENDING &&
      Array.isArray(vehicle.photos) && vehicle.photos.length > 0 &&
      vehicle.driverId
    ) {
      vehicle.status = VehicleStatus.AVAILABLE;
    }

    return this.vehicleRepo.save(vehicle);
  }

  async assignDriver(id: string, driverId: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    // ✅ CRITICAL: Only AVAILABLE vehicles can be assigned to a driver
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
    // At this point status must be AVAILABLE

    vehicle.driverId = driverId;
    return this.vehicleRepo.save(vehicle);
  }

  async setOnTrip(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    if (vehicle.status !== VehicleStatus.AVAILABLE)
      throw new BadRequestException(
        `Vehicle must be Available to start a trip. Current: ${vehicle.status}`,
      );
    vehicle.status = VehicleStatus.ON_TRIP;
    return this.vehicleRepo.save(vehicle);
  }

  async endTrip(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    if (vehicle.status !== VehicleStatus.ON_TRIP)
      throw new BadRequestException(`Vehicle is not On Trip. Current: ${vehicle.status}`);
    vehicle.status = VehicleStatus.AVAILABLE;
    return this.vehicleRepo.save(vehicle);
  }

  async setMaintenance(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    // Only Available vehicles can be sent to Maintenance
    if (vehicle.status !== VehicleStatus.AVAILABLE) {
      throw new BadRequestException(
        `Only Available vehicles can go to Maintenance. Current: ${vehicle.status}`,
      );
    }

    // ✅ CRITICAL: Force the assigned driver back to SETUP_REQUIRED before clearing driverId
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
    const vehicle = await this.findOne(id);
    if (vehicle.status !== VehicleStatus.MAINTENANCE)
      throw new BadRequestException(
        `Vehicle is not under Maintenance. Current: ${vehicle.status}`,
      );
    vehicle.status = VehicleStatus.AVAILABLE;
    return this.vehicleRepo.save(vehicle);
  }

  async remove(id: string): Promise<{ message: string }> {
    const vehicle = await this.findOne(id);
    await this.vehicleRepo.delete(vehicle.id);
    return { message: `Vehicle "${id}" deleted.` };
  }

  async hardDelete(id: string): Promise<{ message: string }> {
    const vehicle = await this.findOne(id);
    await this.vehicleRepo.delete(vehicle.id);
    return { message: `Vehicle "${id}" permanently deleted.` };
  }
}