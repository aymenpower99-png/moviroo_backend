import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverAvailabilityStatus } from '../entities/driver.entity';
import { Vehicle } from '../../vehicles/entities/vehicle.entity';
import { User, UserStatus } from '../../users/entites/user.entity';
import { WorkArea } from '../../work-area/entities/work-area.entity';
import { CompleteDriverProfileDto } from '../dto/complete-driver-profile.dto';
import { DriverOnlineHistory } from '../../earnings/entities/driver-online-history.entity';
import { CloudinaryService } from '../../common/services/cloudinary.service';
import { ConfigService } from '@nestjs/config';
import { Ride } from '../../rides/domain/entities/ride.entity';
import { RideStatus } from '../../rides/domain/enums/ride-status.enum';
import { Between } from 'typeorm';
import { DriverMetricsService } from './driver-metrics.service';

@Injectable()
export class DriverProfileService {
  private readonly logger = new Logger(DriverProfileService.name);

  constructor(
    @InjectRepository(Driver) private driverRepo: Repository<Driver>,
    @InjectRepository(Vehicle) private vehicleRepo: Repository<Vehicle>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(WorkArea) private workAreaRepo: Repository<WorkArea>,
    @InjectRepository(DriverOnlineHistory)
    private onlineHistoryRepo: Repository<DriverOnlineHistory>,
    @InjectRepository(Ride) private rideRepo: Repository<Ride>,
    private readonly cloudinary: CloudinaryService,
    private readonly config: ConfigService,
    private readonly metricsService: DriverMetricsService,
  ) {}

  async completeProfile(
    userId: string,
    dto: CompleteDriverProfileDto,
  ): Promise<Driver> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    if (user.status !== UserStatus.ACTIVE)
      throw new ForbiddenException(
        'Account must be active to complete profile.',
      );

    const existing = await this.driverRepo.findOne({ where: { userId } });
    if (existing)
      throw new BadRequestException('Driver profile already completed.');

    await this.userRepo.update(userId, { phone: dto.phone });

    const driver = this.driverRepo.create({
      userId,
      availabilityStatus: DriverAvailabilityStatus.SETUP_REQUIRED,
    });

    return this.driverRepo.save(driver);
  }

  /** Persist driver logo after Cloudinary direct upload */
  async saveDriverLogo(
    userId: string,
    body: { url: string; publicId: string },
  ) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver not found');

    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    if (!cloudName)
      throw new BadRequestException('Cloudinary not configured on server');

    // Validate URL and publicId path
    try {
      const u = new URL(body.url);
      const isHostOk = u.host === 'res.cloudinary.com';
      const isPathOk = u.pathname.includes(`/${cloudName}/`);
      if (!isHostOk || !isPathOk) {
        throw new BadRequestException('Invalid Cloudinary URL');
      }
    } catch (_) {
      throw new BadRequestException('Invalid URL');
    }
    if (!body.publicId.startsWith(`Photo_profile/drivers/${userId}/`)) {
      throw new BadRequestException('publicId path mismatch');
    }

    // Validate allowed formats by extension in URL or publicId hint
    const lowerUrl = body.url.toLowerCase();
    const isAllowed =
      lowerUrl.endsWith('.png') ||
      lowerUrl.endsWith('.jpg') ||
      lowerUrl.endsWith('.jpeg') ||
      lowerUrl.endsWith('.webp');
    if (!isAllowed) {
      throw new BadRequestException(
        'Unsupported image format. Allowed: png, jpg, jpeg, webp.',
      );
    }

    // Optional size validation via admin API (best-effort)
    const meta = await this.cloudinary.getResource(body.publicId);
    if (meta && meta.bytes > 5 * 1024 * 1024) {
      throw new BadRequestException(
        'Your profile image is too large. Maximum allowed size is 5MB.',
      );
    }

    // Delete previous if exists
    if (driver.logoPublicId && driver.logoPublicId !== body.publicId) {
      await this.cloudinary.deleteByPublicId(driver.logoPublicId, true);
    }

    await this.driverRepo.update(
      { userId },
      {
        logoUrl: body.url,
        logoPublicId: body.publicId,
      },
    );

    const updated = await this.driverRepo.findOne({ where: { userId } });
    return { logoUrl: updated?.logoUrl, logoPublicId: updated?.logoPublicId };
  }

  /** Delete driver logo and clear fields */
  async deleteDriverLogo(userId: string) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver not found');

    if (driver.logoPublicId) {
      await this.cloudinary.deleteByPublicId(driver.logoPublicId, true);
    }

    await this.driverRepo.update(
      { userId },
      {
        logoUrl: null,
        logoPublicId: null,
      },
    );

    return { logoUrl: null, logoPublicId: null };
  }

  private _currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async getMyProfile(userId: string) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) return { profileComplete: false };

    // Vehicle has eager: true on vehicleClass, so it auto-joins
    const vehicle = await this.vehicleRepo.findOne({
      where: { driverId: driver.id },
    });

    // Join work area if assigned
    const workArea = driver.workAreaId
      ? await this.workAreaRepo.findOne({ where: { id: driver.workAreaId } })
      : null;

    // Get monthly online time from driver_online_history
    const currentMonth = this._currentMonth();
    const history = await this.onlineHistoryRepo.findOne({
      where: { driverId: userId, month: currentMonth },
    });
    const monthlyOnlineMs = history?.onlineTimeMs || 0;

    // ── Compute all stats from rides table (not stored counters) ──
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [totalTrips, monthlyRides] = await Promise.all([
      this.rideRepo.count({
        where: { driverId: userId, status: RideStatus.COMPLETED },
      }),
      this.rideRepo.count({
        where: {
          driverId: userId,
          status: RideStatus.COMPLETED,
          completedAt: Between(monthStart, monthEnd),
        },
      }),
    ]);

    const metrics = await this.metricsService.computeForDriver(userId);

    this.logger.log(
      `📊 Driver ${userId.slice(0, 8)} stats: ` +
        `accepted=${metrics.acceptedOffersCount}, rejected=${metrics.rejectedOffersCount}, expired=${metrics.expiredOffersCount}, ` +
        `rate=${metrics.acceptanceRate}% | assigned=${metrics.assignedRidesCount}, ` +
        `driver_cancels=${metrics.cancellationCount}, cancel_rate=${metrics.cancellationRate}%`,
    );

    return {
      profileComplete: true,
      ...driver,
      totalTrips,
      monthlyRides,
      assignedRidesCount: metrics.assignedRidesCount,
      cancellationCount: metrics.cancellationCount,
      cancellationRate: metrics.cancellationRate,
      acceptedOffersCount: metrics.acceptedOffersCount,
      rejectedOffersCount: metrics.rejectedOffersCount,
      expiredOffersCount: metrics.expiredOffersCount,
      totalOffersCount: metrics.totalOffersCount,
      acceptanceRate: metrics.acceptanceRate,
      monthlyOnlineMs,
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
      pushEnabled: driver.notifPushEnabled ?? true,
      emailEnabled: driver.notifEmailEnabled ?? true,
    };
  }

  async updateNotificationPrefs(
    userId: string,
    prefs: { pushEnabled?: boolean; emailEnabled?: boolean },
  ) {
    const driver = await this.driverRepo.findOne({ where: { userId } });
    if (!driver) throw new NotFoundException('Driver not found');

    // Use a targeted UPDATE so TypeORM only touches the columns we explicitly set.
    // This avoids any risk of null values from unrelated columns causing constraint
    // violations on the other notification column.
    const partial: Partial<{
      notifPushEnabled: boolean;
      notifEmailEnabled: boolean;
    }> = {};
    if (prefs.pushEnabled !== undefined)
      partial.notifPushEnabled = prefs.pushEnabled;
    if (prefs.emailEnabled !== undefined)
      partial.notifEmailEnabled = prefs.emailEnabled;

    if (Object.keys(partial).length > 0) {
      await this.driverRepo.update({ userId }, partial);
    }

    // Reload to return the actual committed values
    const updated = await this.driverRepo.findOne({ where: { userId } });

    // Return explicit booleans - never null or undefined
    const pushEnabled = updated?.notifPushEnabled;
    const emailEnabled = updated?.notifEmailEnabled;

    return {
      pushEnabled:
        pushEnabled === true || pushEnabled === false ? pushEnabled : true,
      emailEnabled:
        emailEnabled === true || emailEnabled === false ? emailEnabled : true,
    };
  }
}
