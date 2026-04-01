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

interface NhtsaModel {
  Model_ID:   number;
  Model_Name: string;
  Make_ID:    number;
  Make_Name:  string;
}

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  // ─── Curated makes list ───────────────────────────────────────────────────
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
    { id: 483,  name: 'Mercedes-Benz Vans' },
    { id: 558,  name: 'Volkswagen Commercial' },
    { id: 5463, name: 'Citroën Vans' },
  ];

  constructor(
    @InjectRepository(Vehicle)
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Determines the initial status when creating a vehicle.
   * Rules:
   *  - Available  → photos provided AND driverId provided
   *  - Pending    → photo OR driver is missing
   */
  private resolveInitialStatus(
    photos: string[] | null | undefined,
    driverId: string | null | undefined,
  ): VehicleStatus {
    const hasPhotos = Array.isArray(photos) && photos.length > 0;
    const hasDriver = !!driverId;
    return hasPhotos && hasDriver ? VehicleStatus.AVAILABLE : VehicleStatus.PENDING;
  }

  // ─── Makes: full list ─────────────────────────────────────────────────────

  getAllMakes(): { id: number; name: string }[] {
    return [...this.POPULAR_MAKES].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ─── Makes: search ────────────────────────────────────────────────────────

  searchMakes(q: string): { id: number; name: string }[] {
    const lower = q.toLowerCase();
    return this.POPULAR_MAKES
      .filter((m) => m.name.toLowerCase().includes(lower))
      .sort((a, b) => a.name.localeCompare(b.name));
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
  /**
   * Step 1: Add Vehicle
   * Required: make, model, year
   * Optional: color, seats, photos, driverId
   * Auto-status:
   *   → Available  if photos + driverId are both provided
   *   → Pending    otherwise
   */
  async create(dto: CreateVehicleDto): Promise<Vehicle> {
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

    const status = this.resolveInitialStatus(dto.photos, dto.driverId);

    const vehicle = this.vehicleRepo.create({
      driverId:                dto.driverId                ?? null,
      agencyId:                dto.agencyId                ?? null,
      make:                    dto.make,
      model:                   dto.model,
      year:                    dto.year,
      color:                   dto.color                   ?? null,
      licensePlate:            dto.licensePlate             ?? null,
      vin:                     dto.vin                     ?? null,
      vehicleType:             dto.vehicleType,
      seats:                   dto.seats                   ?? null,
      registrationDocumentUrl: dto.registrationDocumentUrl ?? null,
      insuranceDocumentUrl:    dto.insuranceDocumentUrl    ?? null,
      insuranceExpiry:         dto.insuranceExpiry
        ? new Date(dto.insuranceExpiry)
        : null,
      technicalControlUrl:     dto.technicalControlUrl     ?? null,
      technicalControlExpiry:  dto.technicalControlExpiry
        ? new Date(dto.technicalControlExpiry)
        : null,
      photos:                  dto.photos                  ?? null,
      status,
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

  // ─── Update (general fields) ──────────────────────────────────────────────

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
      ...(dto.isActive                 !== undefined && { isActive:                dto.isActive }),
    });

    return this.vehicleRepo.save(vehicle);
  }

  // ─── Assign Driver (Admin only) ───────────────────────────────────────────
  /**
   * Manually assign a driver to a vehicle.
   * If the vehicle has photos and was Pending, it becomes Available.
   */
  async assignDriver(id: string, driverId: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    if (vehicle.status === VehicleStatus.ON_TRIP) {
      throw new BadRequestException('Cannot reassign driver while vehicle is On Trip.');
    }
    if (vehicle.status === VehicleStatus.MAINTENANCE) {
      throw new BadRequestException(
        'Vehicle is under Maintenance. Use completeMaintenance to mark it ready first.',
      );
    }

    vehicle.driverId = driverId;

    // Auto-promote Pending → Available if photos are now present
    if (
      vehicle.status === VehicleStatus.PENDING &&
      Array.isArray(vehicle.photos) &&
      vehicle.photos.length > 0
    ) {
      vehicle.status = VehicleStatus.AVAILABLE;
    }

    return this.vehicleRepo.save(vehicle);
  }

  // ─── Set On Trip ──────────────────────────────────────────────────────────
  /**
   * Step 3: Available → On_Trip
   * Called when a ride starts using this vehicle.
   */
  async setOnTrip(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    if (vehicle.status !== VehicleStatus.AVAILABLE) {
      throw new BadRequestException(
        `Vehicle must be Available to start a trip. Current status: ${vehicle.status}`,
      );
    }

    vehicle.status = VehicleStatus.ON_TRIP;
    return this.vehicleRepo.save(vehicle);
  }

  // ─── End Trip ─────────────────────────────────────────────────────────────
  /**
   * Step 4: On_Trip → Available
   * Called when ride ends. Vehicle is ready for the next trip.
   */
  async endTrip(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    if (vehicle.status !== VehicleStatus.ON_TRIP) {
      throw new BadRequestException(
        `Vehicle is not currently On Trip. Current status: ${vehicle.status}`,
      );
    }

    vehicle.status = VehicleStatus.AVAILABLE;
    return this.vehicleRepo.save(vehicle);
  }

  // ─── Set Maintenance ──────────────────────────────────────────────────────
  /**
   * Step 5: Any → Maintenance
   * Auto-unassigns the driver. Driver becomes free (idle).
   */
  async setMaintenance(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    if (vehicle.status === VehicleStatus.MAINTENANCE) {
      throw new BadRequestException('Vehicle is already under Maintenance.');
    }

    vehicle.status   = VehicleStatus.MAINTENANCE;
    vehicle.driverId = null;  // ← Auto-unassign driver; driver becomes idle

    return this.vehicleRepo.save(vehicle);
  }

  // ─── Complete Maintenance ─────────────────────────────────────────────────
  /**
   * Step 6: Maintenance → Available
   * Admin manually decides maintenance is done.
   * Driver must be reassigned separately via assignDriver.
   */
  async completeMaintenance(id: string): Promise<Vehicle> {
    const vehicle = await this.findOne(id);

    if (vehicle.status !== VehicleStatus.MAINTENANCE) {
      throw new BadRequestException(
        `Vehicle is not under Maintenance. Current status: ${vehicle.status}`,
      );
    }

    vehicle.status = VehicleStatus.AVAILABLE;
    return this.vehicleRepo.save(vehicle);
  }

  // ─── Soft Remove ──────────────────────────────────────────────────────────

  async remove(id: string): Promise<{ message: string }> {
    const vehicle = await this.findOne(id);
    vehicle.isActive = false;
    await this.vehicleRepo.save(vehicle);
    return { message: `Vehicle "${id}" has been deactivated.` };
  }

  // ─── Hard Delete ──────────────────────────────────────────────────────────

  async hardDelete(id: string): Promise<{ message: string }> {
    await this.findOne(id);
    await this.vehicleRepo.softDelete(id);
    return { message: `Vehicle "${id}" has been deleted.` };
  }
}