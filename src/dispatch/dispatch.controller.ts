import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entites/user.entity';

import { Ride } from '../rides/domain/entities/ride.entity';
import { RideStatus } from '../rides/domain/enums/ride-status.enum';
import { DriverLocation } from './domain/entities/driver-location.entity';
import { DispatchOffer } from './domain/entities/dispatch-offer.entity';
import { OfferStatus } from './domain/enums/offer-status.enum';
import {
  Driver,
  DriverAvailabilityStatus,
} from '../driver/entities/driver.entity';

import { UpdateLocationDto } from './application/dtos/update-location.dto';
import { RejectOfferDto } from './application/dtos/reject-offer.dto';
import { RespondToOfferUseCase } from './application/use-cases/respond-to-offer.use-case';
import { FallbackDispatchService } from './application/services/fallback-dispatch.service';
import { FcmService } from '../notifications/services/fcm.service';
import { DriverAvailabilityService } from '../driver/services/driver-availability.service';

@Controller('dispatch')
export class DispatchController {
  private readonly logger = new Logger(DispatchController.name);

  constructor(
    @InjectRepository(DriverLocation)
    private readonly locRepo: Repository<DriverLocation>,
    @InjectRepository(DispatchOffer)
    private readonly offerRepo: Repository<DispatchOffer>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    private readonly respondUC: RespondToOfferUseCase,
    private readonly fallbackService: FallbackDispatchService,
    private readonly fcmService: FcmService,
    private readonly availabilityService: DriverAvailabilityService,
  ) {}

  /* ─── Driver: update GPS location ───────────── */
  @Post('locations')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async updateLocation(
    @CurrentUser() user: User,
    @Body() dto: UpdateLocationDto,
  ) {
    await this.locRepo.upsert(
      {
        driverId: user.id,
        latitude: dto.latitude,
        longitude: dto.longitude,
        heading: dto.heading ?? 0,
        speedKmh: dto.speed_kmh ?? 0,
        lastSeenAt: new Date(),
      },
      { conflictPaths: ['driverId'] },
    );
    return { message: 'Location updated', driverId: user.id };
  }

  /* ─── Driver: heartbeat (updates last_seen_at + optional GPS coords) ─── */
  @Patch('locations/heartbeat')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async heartbeat(@CurrentUser() user: User, @Body() body: any) {
    const now = new Date();

    // Check if driver was force-offlined by HeartbeatService sweep.
    // If so, heartbeat must NOT re-enable online status — only explicit goOnline can.
    const existingLoc = await this.locRepo.findOne({
      where: { driverId: user.id },
    });
    const isForcedOffline = existingLoc?.forcedOfflineAt != null;

    const patch: Record<string, any> = { lastSeenAt: now };

    // Only re-assert online if driver wasn't forced offline by sweep
    if (!isForcedOffline) {
      patch.isOnline = true;
    }

    // Accept lat/lng from body if provided
    const lat = body?.lat ?? body?.latitude;
    const lng = body?.lng ?? body?.longitude;
    if (
      lat != null &&
      lng != null &&
      typeof lat === 'number' &&
      typeof lng === 'number'
    ) {
      patch.latitude = lat;
      patch.longitude = lng;
    }

    const updated = await this.locRepo.update({ driverId: user.id }, patch);
    if (updated.affected === 0) {
      // No row yet — upsert a new one
      await this.locRepo.upsert(
        {
          driverId: user.id,
          latitude: lat ?? 0,
          longitude: lng ?? 0,
          lastSeenAt: now,
          isOnline: true,
        },
        { conflictPaths: ['driverId'] },
      );
    }

    // Only re-sync driver profile status if not forced offline
    if (!isForcedOffline) {
      await this.driverRepo.update(
        { userId: user.id },
        { availabilityStatus: DriverAvailabilityStatus.ONLINE },
      );
    }

    return { message: 'Heartbeat received', ts: now };
  }

  /* ─── Driver: go online ─────────────────────── */
  @Patch('locations/online')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async goOnline(@CurrentUser() user: User, @Body() body: any) {
    // Accept lat/lng from body
    const lat = body?.lat ?? body?.latitude;
    const lng = body?.lng ?? body?.longitude;

    // Recovery guard: if the driver is stuck from an abandoned ride
    // (is_on_trip=true or availabilityStatus=ON_TRIP with no active trip),
    // reset them so goOnline succeeds and dispatch can find them.
    const loc = await this.locRepo.findOne({ where: { driverId: user.id } });
    if (loc?.isOnTrip) {
      // Check if they actually have an active ride assigned
      const activeRide = await this.rideRepo.findOne({
        where: {
          driverId: user.id,
          status: In([
            RideStatus.ASSIGNED,
            RideStatus.EN_ROUTE_TO_PICKUP,
            RideStatus.ARRIVED,
            RideStatus.IN_TRIP,
          ]),
        },
      });
      if (!activeRide) {
        this.logger.warn(
          `⚠️ Driver ${user.id.slice(0, 8)} has is_on_trip=true but no active ride — resetting (stuck state recovery)`,
        );
        await this.locRepo.update({ driverId: user.id }, { isOnTrip: false });
      }
    }
    const driver = await this.driverRepo.findOne({ where: { userId: user.id } });
    if (driver?.availabilityStatus === DriverAvailabilityStatus.ON_TRIP) {
      const activeRide = await this.rideRepo.findOne({
        where: {
          driverId: user.id,
          status: In([
            RideStatus.ASSIGNED,
            RideStatus.EN_ROUTE_TO_PICKUP,
            RideStatus.ARRIVED,
            RideStatus.IN_TRIP,
          ]),
        },
      });
      if (!activeRide) {
        this.logger.warn(
          `⚠️ Driver ${user.id.slice(0, 8)} has availabilityStatus=ON_TRIP but no active ride — resetting`,
        );
        await this.driverRepo.update(
          { userId: user.id },
          { availabilityStatus: DriverAvailabilityStatus.OFFLINE },
        );
      }
    }

    // Use the availability service to properly set online status + onlineSince
    await this.availabilityService.setMyAvailability(
      user.id,
      DriverAvailabilityStatus.ONLINE,
    );

    // Upsert: create or update the location record (no NotFoundException)
    // Clear forcedOfflineAt so the driver is truly back online
    await this.locRepo.upsert(
      {
        driverId: user.id,
        isOnline: true,
        lastSeenAt: new Date(),
        forcedOfflineAt: null as any,
        ...(lat != null &&
        lng != null &&
        typeof lat === 'number' &&
        typeof lng === 'number'
          ? { latitude: lat, longitude: lng }
          : {}),
      },
      { conflictPaths: ['driverId'] },
    );

    return { message: 'Driver is now ONLINE', driverId: user.id };
  }

  /* ─── Driver: go offline ────────────────────── */
  @Patch('locations/offline')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async goOffline(@CurrentUser() user: User) {
    // Use the availability service to properly commit session time + clear onlineSince
    await this.availabilityService.setMyAvailability(
      user.id,
      DriverAvailabilityStatus.OFFLINE,
    );

    // Update real-time location table
    await this.locRepo.update({ driverId: user.id }, { isOnline: false });

    return { message: 'Driver is now OFFLINE', driverId: user.id };
  }

  /* ─── Admin: list online drivers ────────────── */
  @Get('drivers/online')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async onlineDrivers() {
    return this.locRepo.find({
      where: { isOnline: true },
      relations: ['driver'],
      order: { lastSeenAt: 'DESC' },
    });
  }

  /* ─── Admin: trigger dispatch for a ride ────── */
  @Post('ride/:rideId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async triggerDispatch(@Param('rideId', ParseUUIDPipe) rideId: string) {
    const ride = await this.rideRepo.findOne({
      where: { id: rideId },
      relations: ['vehicleClass'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    if (ride.status !== RideStatus.SEARCHING_DRIVER) {
      throw new ConflictException(
        `Ride is in status "${ride.status}", must be SEARCHING_DRIVER to dispatch`,
      );
    }

    // Fire-and-forget: dispatch loop runs in background
    this.fallbackService.runFullDispatch(ride).catch((err) => {
      this.logger.error(`Dispatch failed for ride ${rideId}`, err.stack);
    });

    return {
      message: 'Dispatch started — offers sent sequentially (15s per driver)',
      rideId,
      status: ride.status,
    };
  }

  /* ─── Driver: accept an offer ───────────────── */
  @Post('offers/:id/accept')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  accept(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.respondUC.accept(user, id);
  }

  /* ─── Driver: reject an offer ───────────────── */
  @Post('offers/:id/reject')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  reject(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOfferDto,
  ) {
    return this.respondUC.reject(user, id, dto.reason);
  }

  /* ─── Driver: see my pending offers ─────────── */
  @Get('offers/pending')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async myPendingOffers(@CurrentUser() user: User) {
    return this.offerRepo.find({
      where: { driverId: user.id, status: OfferStatus.PENDING },
      relations: ['ride', 'ride.vehicleClass', 'ride.passenger'],
      order: { offeredAt: 'DESC' },
    });
  }

  /* ─── Admin: all offers for a ride ──────────── */
  @Get('offers/ride/:rideId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async rideOffers(@Param('rideId', ParseUUIDPipe) rideId: string) {
    return this.offerRepo.find({
      where: { rideId },
      relations: ['driver'],
      order: { score: 'DESC' },
    });
  }

  /* ─── Driver: register FCM token ────────────── */
  @Post('fcm-token')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async registerFcmToken(
    @CurrentUser() user: User,
    @Body() body: { token: string },
  ) {
    if (!body.token) {
      return { message: 'Token is required' };
    }
    await this.fcmService.registerToken(user.id, body.token);
    return { message: 'FCM token registered' };
  }
}
