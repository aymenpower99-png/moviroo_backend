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
        'Update your location first (POST /api/dispatch/locations)',
      );
    }
    loc.isOnline = true;
    loc.lastSeenAt = new Date();
    await this.locRepo.save(loc);
    return { message: 'Driver is now ONLINE', driverId: user.id };
  }

  /* ─── Driver: go offline ────────────────────── */
  @Patch('locations/offline')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.DRIVER)
  async goOffline(@CurrentUser() user: User) {
    await this.locRepo.update(
      { driverId: user.id },
      { isOnline: false },
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
        `Ride is in ${ride.status} status, must be SEARCHING_DRIVER`,
      );
    }

    // Fire-and-forget: dispatch loop runs in the background
    this.fallbackService.runFullDispatch(ride).catch((err) => {
      this.logger.error(`Dispatch failed for ride ${rideId}`, err.stack);
    });

    return {
      message: 'Dispatch started — offers will be sent sequentially (15s each)',
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

  /* ─── Admin: see all offers for a ride ──────── */
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
