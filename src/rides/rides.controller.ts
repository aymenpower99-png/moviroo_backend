import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  ParseFloatPipe,
  NotFoundException,
  ForbiddenException,
  HttpCode,
  Query,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entites/user.entity';

import { Ride } from './domain/entities/ride.entity';
import { RideStatus } from './domain/enums/ride-status.enum';
import { CreateRideDto } from './application/dtos/create-ride.dto';
import { CancelRideDto } from './application/dtos/cancel-ride.dto';
import {
  GetVehiclePricesDto,
  GetVehiclePricesResponse,
} from './application/dtos/get-vehicle-prices.dto';
import { CreateRideUseCase } from './application/use-cases/create-ride.use-case';
import { ConfirmRideUseCase } from './application/use-cases/confirm-ride.use-case';
import { CancelRideUseCase } from './application/use-cases/cancel-ride.use-case';
import { GetVehiclePricesUseCase } from './application/use-cases/get-vehicle-prices.use-case';
import { DispatchOffer } from '../dispatch/domain/entities/dispatch-offer.entity';
import { TripPayment } from '../billing/entities/trip-payment.entity';
import { DriverLocation } from '../dispatch/domain/entities/driver-location.entity';
import { GeocodingService } from './infrastructure/services/geocoding.service';
import { RoutingService } from './infrastructure/services/routing.service';

@Controller('rides')
export class RidesController {
  private readonly logger = new Logger(RidesController.name);

  constructor(
    private readonly createRideUC: CreateRideUseCase,
    private readonly confirmRideUC: ConfirmRideUseCase,
    private readonly cancelRideUC: CancelRideUseCase,
    private readonly getVehiclePricesUC: GetVehiclePricesUseCase,
    private readonly geocodingService: GeocodingService,
    private readonly routingService: RoutingService,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DispatchOffer)
    private readonly offerRepo: Repository<DispatchOffer>,
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(DriverLocation)
    private readonly driverLocationRepo: Repository<DriverLocation>,
  ) {}

  /* ─── Get vehicle class prices by coordinates ───────────────────── */
  @Get('pricing')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 30, ttl: 60 } }) // 30 requests per minute
  async getVehiclePrices(
    @Query() dto: GetVehiclePricesDto,
  ): Promise<GetVehiclePricesResponse> {
    return this.getVehiclePricesUC.execute(dto);
  }

  /* ─── Get pricing for ALL active car classes (passenger flow) ──────── */
  @Get('pricing/all')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 30, ttl: 60 } }) // 30 requests per minute
  async getAllVehiclePrices(
    @Query('pickupLat', ParseFloatPipe) pickupLat: number,
    @Query('pickupLon', ParseFloatPipe) pickupLon: number,
    @Query('dropoffLat', ParseFloatPipe) dropoffLat: number,
    @Query('dropoffLon', ParseFloatPipe) dropoffLon: number,
    @Query('bookingDt') bookingDt?: string,
  ) {
    return this.getVehiclePricesUC.executeAll(
      pickupLat,
      pickupLon,
      dropoffLat,
      dropoffLon,
      bookingDt,
    );
  }

  /* ─── Reverse geocoding: lat/lon → address ───────────────────────── */
  @Get('geocode/reverse')
  @Throttle({ default: { limit: 100, ttl: 60 } }) // 100 requests per minute
  async reverseGeocode(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lon', ParseFloatPipe) lon: number,
  ) {
    return this.geocodingService.reverse(lat, lon);
  }

  /* ─── Autocomplete search: query → merged results ───────────────────── */
  @Get('geocode/autocomplete')
  @Throttle({ default: { limit: 50, ttl: 60 } }) // 50 requests per minute
  async autocomplete(@Query('q') query: string) {
    return this.geocodingService.autocomplete(query);
  }

  /* ─── Parallel search: query → Mapbox + Nominatim merged results ───── */
  @Get('geocode/search')
  @Throttle({ default: { limit: 50, ttl: 60 } }) // 50 requests per minute
  async search(@Query('q') query: string) {
    return this.geocodingService.autocompleteParallel(query);
  }

  /* ─── Create a new ride ───────────────────── */
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.SUPER_ADMIN)
  create(@CurrentUser() user: User, @Body() dto: CreateRideDto) {
    return this.createRideUC.execute(user, dto);
  }

  /* ─── Confirm (lock price → SEARCHING_DRIVER) */
  @Patch(':id/confirm')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.SUPER_ADMIN)
  confirm(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.confirmRideUC.execute(user, id);
  }

  /* ─── Cancel a ride ───────────────────────── */
  @Patch(':id/cancel')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.SUPER_ADMIN)
  cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRideDto,
  ) {
    return this.cancelRideUC.execute(user, id, dto);
  }

  /* ─── Get single ride ────────────────────── */
  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ride = await this.rideRepo.findOne({
      where: { id },
      relations: ['passenger', 'vehicleClass', 'driver', 'vehicle'],
    });
    if (!ride) throw new NotFoundException('Ride not found');

    if (user.role !== UserRole.SUPER_ADMIN && ride.passengerId !== user.id) {
      throw new ForbiddenException('Not your ride');
    }

    /* Get driver location if assigned and compute ETA dynamically */
    let driverLocation: {
      latitude: number;
      longitude: number;
      last_updated_at: Date;
    } | null = null;
    let progress: number | null = null;
    let etaMins: number | null = null;
    let remainingDistanceMeters: number | null = null;

    if (ride.driverId) {
      const loc = await this.driverLocationRepo.findOne({
        where: { driverId: ride.driverId },
      });
      if (loc) {
        driverLocation = {
          latitude: loc.latitude,
          longitude: loc.longitude,
          last_updated_at: loc.lastSeenAt,
        };
        progress = loc.progress ?? null;

        /* Compute ETA dynamically using RoutingService (same logic as WebSocket) */
        const targetLat =
          ride.status === RideStatus.IN_TRIP ? ride.dropoffLat : ride.pickupLat;
        const targetLon =
          ride.status === RideStatus.IN_TRIP ? ride.dropoffLon : ride.pickupLon;
        const totalDistanceMeters = ride.distanceKm
          ? ride.distanceKm * 1000
          : 0;

        if (totalDistanceMeters > 0) {
          try {
            const progressData =
              await this.routingService.calculateProgressForRide(
                loc.latitude,
                loc.longitude,
                targetLat,
                targetLon,
                totalDistanceMeters,
                loc.speedKmh ?? 0,
              );

            /* Override with FRESH computed values (not stale DB snapshot) */
            if (progressData) {
              progress = progressData.progress;
              etaMins = progressData.etaMins;
              remainingDistanceMeters = progressData.remainingDistanceMeters;
            }
          } catch (err) {
            this.logger.error(
              `Failed to calculate progress for ride ${id}: ${err}`,
            );
          }
        }
      }
    }

    return {
      ...ride,
      driver_location: driverLocation,
      progress: progress,
      etaMins: etaMins,
      remainingDistanceMeters: remainingDistanceMeters,
    };
  }

  /* ─── Get ride progress (real-time ETA and progress) ───────────────── */
  @Get(':id/progress')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { limit: 20, ttl: 60 } }) // 20 requests per minute
  async getProgress(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const ride = await this.rideRepo.findOne({ where: { id } });
    if (!ride) throw new NotFoundException('Ride not found');

    // Authorization: passenger or driver of the ride
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      ride.passengerId !== user.id &&
      ride.driverId !== user.id
    ) {
      throw new ForbiddenException('Not your ride');
    }

    // Get driver's current location
    const driverLocation = await this.driverLocationRepo.findOne({
      where: { driverId: ride.driverId || '' },
    });

    if (!driverLocation) {
      return {
        progress: 0,
        remainingDistanceMeters: ride.distanceKm ? ride.distanceKm * 1000 : 0,
        remainingDurationSeconds: ride.durationMin ? ride.durationMin * 60 : 0,
        totalDistanceMeters: ride.distanceKm ? ride.distanceKm * 1000 : 0,
        etaMins: ride.durationMin || 0,
      };
    }

    // Determine target based on ride status
    const targetLat =
      ride.status === RideStatus.IN_TRIP ? ride.dropoffLat : ride.pickupLat;
    const targetLon =
      ride.status === RideStatus.IN_TRIP ? ride.dropoffLon : ride.pickupLon;
    const totalDistanceMeters = ride.distanceKm ? ride.distanceKm * 1000 : 0;

    // Calculate progress using RoutingService
    const progressResult = await this.routingService.calculateProgressForRide(
      driverLocation.latitude,
      driverLocation.longitude,
      targetLat,
      targetLon,
      totalDistanceMeters,
      driverLocation.speedKmh,
    );

    return (
      progressResult || {
        progress: 0,
        remainingDistanceMeters: totalDistanceMeters,
        remainingDurationSeconds: ride.durationMin ? ride.durationMin * 60 : 0,
        totalDistanceMeters,
        etaMins: ride.durationMin || 0,
      }
    );
  }

  /* ─── List rides ──────────────────────────── */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  findAll(@CurrentUser() user: User) {
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.rideRepo.find({
        relations: ['passenger', 'vehicleClass', 'driver', 'vehicle'],
        order: { createdAt: 'DESC' },
        take: 200,
      });
    }

    // Driver sees rides assigned to them
    if (user.role === UserRole.DRIVER) {
      return this.rideRepo.find({
        where: { driverId: user.id },
        relations: ['passenger', 'vehicleClass', 'vehicle'],
        order: { createdAt: 'DESC' },
      });
    }

    // Passenger sees their own rides
    return this.rideRepo.find({
      where: { passengerId: user.id },
      relations: ['vehicleClass', 'driver', 'vehicle'],
      order: { createdAt: 'DESC' },
    });
  }

  /* ─── Hard delete ride (admin only) ──────── */
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(204)
  async hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    const ride = await this.rideRepo.findOne({ where: { id } });
    if (!ride) throw new NotFoundException('Ride not found');

    // 1. Delete trip_payments (trip_payments → rides)
    await this.paymentRepo.delete({ rideId: id });

    // 2. Delete dispatch offers (dispatch_offers → rides)
    await this.offerRepo.delete({ rideId: id });

    // 4. Finally delete the ride
    await this.rideRepo.delete(id);
  }
}
