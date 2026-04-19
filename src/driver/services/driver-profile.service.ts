import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { User, UserStatus } from '../../users/entites/user.entity';
import { WorkArea } from '../../work-area/entities/work-area.entity';
import { CompleteDriverProfileDto } from '../dto/complete-driver-profile.dto';

@Injectable()
export class DriverProfileService {
  constructor(
    @InjectRepository(Driver)   private driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle)  private vehicleRepo: Repository<Vehicle>,
    @InjectRepository(User)     private userRepo: Repository<User>,
    @InjectRepository(WorkArea) private workAreaRepo: Repository<WorkArea>,
  ) {}

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
      driverLicenseNumber:   dto.driverLicenseNumber,
      driverLicenseExpiry:   new Date(dto.driverLicenseExpiry),
      driverLicenseFrontUrl: dto.driverLicenseFrontUrl,
      driverLicenseBackUrl:  dto.driverLicenseBackUrl,
      availabilityStatus:    DriverAvailabilityStatus.SETUP_REQUIRED,
      // language removed
    });

    return this.driverRepo.save(driver);
  }

  async getMyProfile(userId: string) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) return { profileComplete: false };

    // Vehicle has eager: true on vehicleClass, so it auto-joins
    const vehicle = await this.vehicleRepo.findOne({ where: { driverId: driver.id } });

    // Join work area if assigned
    const workArea = driver.workAreaId
      ? await this.workAreaRepo.findOne({ where: { id: driver.workAreaId } })
      : null;

    return {
      profileComplete: true,
      ...driver,
      vehicle: vehicle
        ? {
            id: vehicle.id,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            color: vehicle.color,
            licensePlate: vehicle.licensePlate,
            vehicleClass: vehicle.vehicleClass
              ? { id: vehicle.vehicleClass.id, name: vehicle.vehicleClass.name }
              : null,
          }
        : null,
      workArea: workArea
        ? { id: workArea.id, country: workArea.country, ville: workArea.ville }
        : null,
    };
  }

  async getNotificationPrefs(userId: string) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver not found');
    return {
      pushEnabled:  driver.notifPushEnabled  ?? true,
      emailEnabled: driver.notifEmailEnabled ?? true,
    };
  }

  async updateNotificationPrefs(
    userId: string,
    prefs: { pushEnabled?: boolean; emailEnabled?: boolean },
  ) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver not found');
    if (prefs.pushEnabled  !== undefined) driver.notifPushEnabled  = prefs.pushEnabled;
    if (prefs.emailEnabled !== undefined) driver.notifEmailEnabled = prefs.emailEnabled;
    await this.driverRepo.save(driver);
    return { pushEnabled: driver.notifPushEnabled, emailEnabled: driver.notifEmailEnabled };
  }
}