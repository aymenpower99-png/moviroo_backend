import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from './entities/driver.entity';
import { Vehicle } from '../vehicles/entities/vehicle.entity';
import { User, UserStatus } from '../users/entites/user.entity';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { CompleteDriverProfileDto } from './dto/complete-driver-profile.dto';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver) private readonly driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle) private readonly vehicleRepo: Repository<Vehicle>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // ─── Driver: Complete Own Profile ────────────────────────────────────────────

  async completeProfile(userId: string, dto: CompleteDriverProfileDto): Promise<Driver> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.status !== UserStatus.ACTIVE)
      throw new ForbiddenException('Account must be active to complete profile.');

    const existing = await this.driverRepo.findOne({ where: { userId } });
    if (existing) throw new BadRequestException('Driver profile already completed.');

    const licenseExists = await this.driverRepo.findOne({
      where: { driverLicenseNumber: dto.driverLicenseNumber },
    });
    if (licenseExists)
      throw new BadRequestException(`License "${dto.driverLicenseNumber}" already registered.`);

    await this.userRepo.update(userId, { phone: dto.phone });

    const driver = this.driverRepo.create({
      userId,
      driverLicenseNumber: dto.driverLicenseNumber,
      driverLicenseExpiry: new Date(dto.driverLicenseExpiry),
      driverLicenseFrontUrl: dto.driverLicenseFrontUrl,
      driverLicenseBackUrl: dto.driverLicenseBackUrl,
      language: dto.language,
    });

    return this.driverRepo.save(driver);
  }

  // ─── Driver: Get Own Profile ──────────────────────────────────────────────────

  async getMyProfile(userId: string) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) return { profileComplete: false };

    const vehicle = await this.vehicleRepo.findOne({ where: { driverId: driver.id } });
    return {
      profileComplete: true,
      ...driver,
      vehicle: vehicle
        ? { id: vehicle.id, make: vehicle.make, model: vehicle.model, year: vehicle.year, licensePlate: vehicle.licensePlate }
        : null,
    };
  }

  // ─── Driver: Set Own Availability ────────────────────────────────────────────

  async setMyAvailability(userId: string, status: DriverAvailabilityStatus): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver)
      throw new NotFoundException('Driver profile not found. Please complete your profile first.');
    driver.availabilityStatus = status;
    return this.driverRepo.save(driver);
  }

  // ─── Admin: Create Driver directly ───────────────────────────────────────────

  async create(dto: CreateDriverDto): Promise<Driver> {
    if (dto.driverLicenseNumber) {
      const licenseExists = await this.driverRepo.findOne({
        where: { driverLicenseNumber: dto.driverLicenseNumber },
      });
      if (licenseExists)
        throw new BadRequestException(`License "${dto.driverLicenseNumber}" already registered.`);
    }

    const userExists = await this.driverRepo.findOne({ where: { userId: dto.userId } });
    if (userExists)
      throw new BadRequestException('A driver profile already exists for this user.');

    if (dto.phone) {
      await this.userRepo.update(dto.userId, { phone: dto.phone });
    }

    const driver = this.driverRepo.create({
      userId: dto.userId,
      driverLicenseNumber: dto.driverLicenseNumber,
      driverLicenseFrontUrl: dto.driverLicenseFrontUrl,
      driverLicenseBackUrl: dto.driverLicenseBackUrl,
      language: dto.language ?? null,
    });

    return this.driverRepo.save(driver);
  }

  // ─── Admin: List All Drivers — NOW JOINS users table for name/email/phone ────

  async findAll(page = 1, limit = 20, availabilityStatus?: DriverAvailabilityStatus) {
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
    const userIds   = drivers.map((d) => d.userId);

    // ── Fetch vehicles ────────────────────────────────────────────────────────
    const vehicles = await this.vehicleRepo
      .createQueryBuilder('v')
      .where('v.driver_id IN (:...ids)', { ids: driverIds })
      .getMany();

    const vehicleByDriverId = new Map(vehicles.map((v) => [v.driverId, v]));

    // ── Fetch users (name, email, phone) ─────────────────────────────────────
    const users = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.firstName', 'u.lastName', 'u.email', 'u.phone'])
      .where('u.id IN (:...ids)', { ids: userIds })
      .getMany();

    const userById = new Map(users.map((u) => [u.id, u]));

    // ── Merge everything ──────────────────────────────────────────────────────
    const data = drivers.map((d) => {
      const user = userById.get(d.userId);
      const v    = vehicleByDriverId.get(d.id);
      return {
        ...d,
        firstName: user?.firstName ?? null,
        lastName:  user?.lastName  ?? null,
        email:     user?.email     ?? null,
        phone:     user?.phone     ?? null,
        vehicle: v
          ? { id: v.id, make: v.make, model: v.model, year: v.year, licensePlate: v.licensePlate }
          : null,
      };
    });

    return { data, total, page, limit };
  }

  // ─── Admin: Find One ──────────────────────────────────────────────────────────

  async findOne(id: string) {
    const driver = await this.findDriverOrFail(id);

    const [user, vehicle] = await Promise.all([
      this.userRepo.findOne({ where: { id: driver.userId } }),
      this.vehicleRepo.findOne({ where: { driverId: driver.id } }),
    ]);

    return {
      ...driver,
      firstName: user?.firstName ?? null,
      lastName:  user?.lastName  ?? null,
      email:     user?.email     ?? null,
      phone:     user?.phone     ?? null,
      vehicle: vehicle
        ? { id: vehicle.id, make: vehicle.make, model: vehicle.model, year: vehicle.year, licensePlate: vehicle.licensePlate }
        : null,
    };
  }

  // ─── Admin: Update ────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateDriverDto): Promise<Driver> {
    const driver = await this.findDriverOrFail(id);

    if (dto.driverLicenseNumber && dto.driverLicenseNumber !== driver.driverLicenseNumber) {
      const dup = await this.driverRepo.findOne({
        where: { driverLicenseNumber: dto.driverLicenseNumber },
      });
      if (dup)
        throw new BadRequestException(`License "${dto.driverLicenseNumber}" already in use.`);
    }

    Object.assign(driver, {
      ...(dto.driverLicenseNumber  !== undefined && { driverLicenseNumber:  dto.driverLicenseNumber }),
      ...(dto.driverLicenseExpiry  !== undefined && { driverLicenseExpiry:  new Date(dto.driverLicenseExpiry) }),
      ...(dto.driverLicenseFrontUrl !== undefined && { driverLicenseFrontUrl: dto.driverLicenseFrontUrl }),
      ...(dto.driverLicenseBackUrl  !== undefined && { driverLicenseBackUrl:  dto.driverLicenseBackUrl }),
      ...(dto.language              !== undefined && { language:              dto.language }),
      ...(dto.availabilityStatus    !== undefined && { availabilityStatus:    dto.availabilityStatus }),
    });

    return this.driverRepo.save(driver);
  }

  // ─── Admin: Remove ────────────────────────────────────────────────────────────

  async remove(id: string): Promise<{ message: string }> {
    await this.findDriverOrFail(id);
    await this.driverRepo.softDelete(id);
    return { message: `Driver "${id}" has been removed.` };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async findDriverOrFail(id: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { id } });
    if (!driver) throw new NotFoundException(`Driver "${id}" not found.`);
    return driver;
  }
}