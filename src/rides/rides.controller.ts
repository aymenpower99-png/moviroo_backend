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
import { Repository, In } from 'typeorm';

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
import { RideMailService } from '../mail/services/ride-mail.service';
import { DispatchOffer } from '../dispatch/domain/entities/dispatch-offer.entity';
import { TripPayment, PaymentStatus } from '../billing/entities/trip-payment.entity';
import { DriverLocation } from '../dispatch/domain/entities/driver-location.entity';
import { Driver } from '../driver/entities/driver.entity';
import { PassengerEntity } from '../passenger/entities/passengers.entity';
import { GeocodingService } from './infrastructure/services/geocoding/geocoding.service';
import { GeocodingGoogleService } from './infrastructure/services/geocoding/geocoding-google.service';
import { RoutingService } from './infrastructure/services/routing/routing.service';
import { PricingConfigService } from '../common/services/pricing-config.service';

@Controller('rides')
export class RidesController {
  private readonly logger = new Logger(RidesController.name);

  constructor(
    private readonly createRideUC: CreateRideUseCase,
    private readonly confirmRideUC: ConfirmRideUseCase,
    private readonly cancelRideUC: CancelRideUseCase,
    private readonly getVehiclePricesUC: GetVehiclePricesUseCase,
    private readonly geocodingService: GeocodingService,
    private readonly googlePlacesService: GeocodingGoogleService,
    private readonly routingService: RoutingService,
    private readonly rideMail: RideMailService,
    private readonly pricingConfig: PricingConfigService,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
    @InjectRepository(DispatchOffer)
    private readonly offerRepo: Repository<DispatchOffer>,
    @InjectRepository(TripPayment)
    private readonly paymentRepo: Repository<TripPayment>,
    @InjectRepository(DriverLocation)
    private readonly driverLocationRepo: Repository<DriverLocation>,
    @InjectRepository(Driver)
    private readonly driverRepo: Repository<Driver>,
    @InjectRepository(PassengerEntity)
    private readonly passengerRepo: Repository<PassengerEntity>,
  ) {}

  /* ─── Public config: Mapbox token for admin dashboard maps ───
   * MUST be defined BEFORE any parameterized routes like :id
   * otherwise NestJS will match /rides/config/mapbox-token as an ID.
   * ───────────────────────────────────────────────────────────── */
  @Get('config/mapbox-token')
  getMapboxToken() {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) {
      throw new NotFoundException('Mapbox token not configured');
    }
    return { token };
  }

  /* ─── Admin: Get pricing config (reads from PostgreSQL via Config API) ─── */
  @Get('pricing/config')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  async getPricingConfig() {
    const cfg = await this.pricingConfig.getConfig();
    return { source: 'postgresql', config: cfg };
  }

  /* ─── Admin: Update pricing config (writes to PostgreSQL via Config API) ─── */
  @Post('pricing/config')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(200)
  async updatePricingConfig(@Body() body: Record<string, any>) {
    const result = await this.pricingConfig.updateConfig(body);
    if (!result.success) {
      throw new ForbiddenException(
        `Failed to update pricing config: ${result.error}`,
      );
    }
    return { success: true, updated: body };
  }

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
    @Query('passengerCount') passengerCount?: string,
  ) {
    const passengers = passengerCount ? parseInt(passengerCount, 10) : 1;
    return this.getVehiclePricesUC.executeAll(
      pickupLat,
      pickupLon,
      dropoffLat,
      dropoffLon,
      bookingDt,
      isNaN(passengers) ? 1 : passengers,
    );
  }

  /* ─── Reverse geocoding: lat/lon → address ───────────────────────── */
  @Get('geocode/reverse')
  @Throttle({ default: { limit: 100, ttl: 60 } }) // 100 requests per minute
  async reverseGeocode(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lon', ParseFloatPipe) lon: number,
    @Query('lang') lang?: string,
  ) {
    return this.geocodingService.reverse(lat, lon, { lang });
  }

  /* ─── Nearby places: lat/lon → nearby POIs ─────────────────────────── */
  @Get('geocode/nearby')
  @Throttle({ default: { limit: 50, ttl: 60 } })
  async nearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lon', ParseFloatPipe) lon: number,
    @Query('q') q?: string,
    @Query('lang') lang?: string,
  ) {
    return this.geocodingService.nearby(lat, lon, { lang });
  }

  /* ─── Autocomplete search: query → merged results ───────────────────── */
  @Get('geocode/autocomplete')
  @Throttle({ default: { limit: 50, ttl: 60 } }) // 50 requests per minute
  async autocomplete(
    @Query('q') query: string,
    @Query('proximityLat') proximityLat?: string,
    @Query('proximityLon') proximityLon?: string,
    @Query('lang') lang?: string,
  ) {
    const proximity =
      proximityLat && proximityLon
        ? { lat: parseFloat(proximityLat), lon: parseFloat(proximityLon) }
        : undefined;
    return this.geocodingService.autocomplete(query, { proximity, lang });
  }

  /* ─── Parallel search: query → Mapbox + Nominatim merged results ───── */
  @Get('geocode/search')
  @Throttle({ default: { limit: 50, ttl: 60 } }) // 50 requests per minute
  async search(
    @Query('q') query: string,
    @Query('proximityLat') proximityLat?: string,
    @Query('proximityLon') proximityLon?: string,
    @Query('lang') lang?: string,
  ) {
    const proximity =
      proximityLat && proximityLon
        ? { lat: parseFloat(proximityLat), lon: parseFloat(proximityLon) }
        : undefined;
    return this.geocodingService.autocompleteParallel(query, {
      proximity,
      lang,
    });
  }

  /* ─── Google Places Autocomplete: query → Google results (Tunisia only) ───── */
  @Get('geocode/google-search')
  @Throttle({ default: { limit: 50, ttl: 60 } }) // 50 requests per minute
  async googleSearch(@Query('q') query: string, @Query('lang') lang?: string) {
    this.logger.log(`[GOOGLE ENDPOINT] 🔍 Searching for: "${query}"`);

    const predictions = await this.googlePlacesService.autocomplete(query, {
      lang,
    });

    this.logger.log(
      `[GOOGLE ENDPOINT] ✅ Got ${predictions.length} predictions from Google API`,
    );

    // Fetch details for each prediction to get coordinates
    const results = await Promise.all(
      predictions.map(async (prediction) => {
        const details = await this.googlePlacesService.getPlaceDetails(
          prediction.place_id,
        );
        const result = this.googlePlacesService.convertToGeocodingResult(
          prediction,
          details,
        );
        // Add debug source field to identify Google results
        return { ...result, _debug_source: 'google_places_api' };
      }),
    );

    // Filter out results without valid coordinates
    const filtered = results.filter((r) => r.lat !== 0 && r.lon !== 0);

    this.logger.log(
      `[GOOGLE ENDPOINT] 📤 Returning ${filtered.length} results with coordinates`,
    );

    return filtered;
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
  confirm(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { paymentMethod?: string },
  ) {
    return this.confirmRideUC.execute(user, id, body?.paymentMethod);
  }

  /* ─── Cancel a ride ───────────────────────── */
  @Patch(':id/cancel')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.SUPER_ADMIN)
  async cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRideDto,
  ) {
    const ride = await this.cancelRideUC.execute(user, id, dto);

    // Send cancellation + refund email to passenger
    // Skip email when payment is still pending (nothing to refund yet)
    try {
      const rideWithPassenger = await this.rideRepo.findOne({
        where: { id: ride.id },
        relations: ['passenger'],
      });
      const payment = await this.paymentRepo.findOne({
        where: { rideId: ride.id },
      });
      if (
        rideWithPassenger?.passenger?.email &&
        payment?.paymentStatus !== PaymentStatus.PENDING
      ) {
        await this.rideMail.sendRideCancelledRefundEmail(
          rideWithPassenger.passenger.email,
          rideWithPassenger.passenger.firstName || 'Passenger',
          rideWithPassenger,
          ride.cancelledBy ?? 'ADMIN',
          payment?.paymentMethod,
          ride.cancellationReason,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send cancellation email for ride ${ride.id}: ${err}`,
      );
    }

    return ride;
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

    // Fetch driver profile to get rating
    let driverProfile: any = null;
    if (ride.driverId) {
      driverProfile = await this.driverRepo.findOne({
        where: { userId: ride.driverId },
      });
    }

    // Fetch passenger profile to get rating
    let passengerProfile: any = null;
    if (ride.passengerId) {
      passengerProfile = await this.passengerRepo.findOne({
        where: { userId: ride.passengerId },
      });
    }

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

        /* Compute ETA dynamically using RoutingService (same logic as WebSocket).
           Skip if the driver location is stale (> 5 min) to avoid absurd ETAs
           from old coordinates. */
        const locAgeMs = Date.now() - new Date(loc.lastSeenAt).getTime();
        const isStale = locAgeMs > 5 * 60 * 1000; // 5 minutes

        if (ride.status === RideStatus.ARRIVED) {
          // Driver has arrived — show 100% progress with no remaining distance.
          progress = 1.0;
          etaMins = 0;
          remainingDistanceMeters = 0;
        } else if (!isStale) {
          const targetLat =
            ride.status === RideStatus.IN_TRIP ? ride.dropoffLat : ride.pickupLat;
          const targetLon =
            ride.status === RideStatus.IN_TRIP ? ride.dropoffLon : ride.pickupLon;
          // Use correct total distance based on ride phase
          const totalDistanceMeters =
            ride.status === RideStatus.IN_TRIP
              ? (ride.distanceKm ? ride.distanceKm * 1000 : 0)
              : (ride.initialPickupDistanceMeters ??
                 (ride.distanceKm ? ride.distanceKm * 1000 : 0));

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
        } else {
          this.logger.warn(
            `Ride ${id} — driver location stale (${(locAgeMs / 60_000).toFixed(1)} min), skipping dynamic ETA`,
          );
        }
      }
    }

    return {
      ...ride,
      driver_location: driverLocation,
      progress: progress,
      etaMins: etaMins,
      remainingDistanceMeters: remainingDistanceMeters,
      driverRating: driverProfile?.ratingAverage ?? null,
      passengerRating: passengerProfile?.ratingAverage ?? null,
      // Expose driver photo for passenger apps (prefer Driver.logoUrl, fallback to User.avatarUrl)
      driverLogoUrl:
        driverProfile?.logoUrl ?? (ride as any)?.driver?.avatarUrl ?? null,
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

    // Driver has arrived — no need to calculate progress.
    if (ride.status === RideStatus.ARRIVED) {
      return {
        progress: 1.0,
        remainingDistanceMeters: 0,
        remainingDurationSeconds: 0,
        totalDistanceMeters: ride.initialPickupDistanceMeters ?? 0,
        etaMins: 0,
      };
    }

    // Determine target based on ride status
    const targetLat =
      ride.status === RideStatus.IN_TRIP ? ride.dropoffLat : ride.pickupLat;
    const targetLon =
      ride.status === RideStatus.IN_TRIP ? ride.dropoffLon : ride.pickupLon;
    // Use correct total distance based on ride phase
    const totalDistanceMeters =
      ride.status === RideStatus.IN_TRIP
        ? (ride.distanceKm ? ride.distanceKm * 1000 : 0)
        : (ride.initialPickupDistanceMeters ??
           (ride.distanceKm ? ride.distanceKm * 1000 : 0));

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
  async findAll(@CurrentUser() user: User) {
    if (user.role === UserRole.SUPER_ADMIN) {
      return this.rideRepo.find({
        relations: ['passenger', 'vehicleClass', 'driver', 'vehicle'],
        order: { createdAt: 'DESC' },
        take: 200,
      });
    }

    // Driver sees rides assigned to them
    if (user.role === UserRole.DRIVER) {
      const rides = await this.rideRepo.find({
        where: { driverId: user.id },
        relations: ['passenger', 'vehicleClass', 'vehicle'],
        order: { createdAt: 'DESC' },
      });

      // BUG FIX: Include passenger rating_average in the list response.
      // The 'passenger' relation is the User entity, which does NOT have
      // rating_average. We must fetch PassengerEntity separately and merge it.
      const passengerIds = rides
        .map((r) => r.passengerId)
        .filter((id): id is string => !!id);

      const passengerProfiles = passengerIds.length
        ? await this.passengerRepo.find({
            where: { userId: In(passengerIds) },
          })
        : [];

      const profileMap = new Map(
        passengerProfiles.map((p) => [p.userId, p]),
      );

      return rides.map((ride) => {
        const profile = profileMap.get(ride.passengerId ?? '');
        return {
          ...ride,
          passengerRating: profile?.ratingAverage ?? null,
          passengerTotalRatings: profile?.totalRatings ?? null,
        };
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
