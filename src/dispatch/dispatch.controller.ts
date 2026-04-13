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
import { Repository } from 'typeorm';

import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entites/user.entity';

import { Ride } from '../rides/domain/entities/ride.entity';
import { RideStatus } from '../rides/domain/enums/ride-status.enum';
import { DriverLocation } from './domain/entities/driver-location.entity';
import { DispatchOffer } from './domain/entities/dispatch-offer.entity';
import { OfferStatus } from './domain/enums/offer-status.enum';
import { Driver, DriverAvailabilityStatus } from '../driver/entities/driver.entity';

import { UpdateLocationDto } from './application/dtos/update-location.dto';
import { RejectOfferDto } from './application/dtos/reject-offer.dto';
import { RespondToOfferUseCase } from './application/use-cases/respond-to-offer.use-case';
import { FallbackDispatchService } from './application/services/fallback-dispatch.service';

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

  /* ─── Driver: heartbeat (lightweight — only updates last_seen_at) ─── */
  @Patch('locations/heartbeat')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async heartbeat(@CurrentUser() user: User) {
    const updated = await this.locRepo.update(
      { driverId: user.id },
      { lastSeenAt: new Date() },
    );
    if (updated.affected === 0) {
      throw new NotFoundException(
        'No location record found. Send GPS first via POST /api/dispatch/locations',
      );
    }
    return { message: 'Heartbeat received', ts: new Date() };
  }

  /* ─── Driver: go online ─────────────────────── */
  @Patch('locations/online')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async goOnline(@CurrentUser() user: User) {
    const loc = await this.locRepo.findOne({
      where: { driverId: user.id },
    });
    if (!loc) {
      throw new NotFoundException(
        'Send your location first via POST /api/dispatch/locations',
      );
    }

    // Update real-time location table
    loc.isOnline = true;
    loc.lastSeenAt = new Date();
    await this.locRepo.save(loc);

    // ✅ Sync driver profile status
    await this.driverRepo.update(
      { userId: user.id },
      { availabilityStatus: DriverAvailabilityStatus.ONLINE },
    );

    return { message: 'Driver is now ONLINE', driverId: user.id };
  }

  /* ─── Driver: go offline ────────────────────── */
  @Patch('locations/offline')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async goOffline(@CurrentUser() user: User) {
    // Update real-time location table
    await this.locRepo.update(
      { driverId: user.id },
      { isOnline: false },
    );

    // ✅ Sync driver profile status
    await this.driverRepo.update(
      { userId: user.id },
      { availabilityStatus: DriverAvailabilityStatus.OFFLINE },
    );

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
  async triggerDispatch(
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ) {
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
  accept(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
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
      relations: ['ride', 'ride.vehicleClass'],
      order: { offeredAt: 'DESC' },
    });
  }

  /* ─── Admin: all offers for a ride ──────────── */
  @Get('offers/ride/:rideId')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async rideOffers(
    @Param('rideId', ParseUUIDPipe) rideId: string,
  ) {
    return this.offerRepo.find({
      where: { rideId },
      relations: ['driver'],
      order: { score: 'DESC' },
    });
  }
}

